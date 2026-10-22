mod auth;
mod canvas;
mod desktop;
mod export;
mod tray;
mod updater;

use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_oauth::OauthConfig;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, Mutex as AsyncMutex};

use auth::{ConnectionInfo, CredentialVault, Credentials, KeyringStore};
use canvas::{normalize_base_url, CanvasError};

const OAUTH_TIMEOUT: Duration = Duration::from_secs(300);
const OAUTH_DONE_PAGE: &str = "<!doctype html><html><body style=\"font-family:system-ui;padding:3rem\"><h2>Tarpaulin is connected.</h2><p>You can close this tab and return to the app.</p></body></html>";

struct AppState {
    http: reqwest::Client,
    vault: CredentialVault,
    /// Serialises token refreshes so concurrent 401s don't each spend the refresh token.
    refresh_lock: AsyncMutex<()>,
}

fn err(e: impl ToString) -> String {
    e.to_string()
}

fn connected(state: &AppState) -> Result<Credentials, CanvasError> {
    state
        .vault
        .get()
        .map_err(CanvasError::Keychain)?
        .ok_or(CanvasError::NotConnected)
}

/// Saves credentials, reporting a keychain failure as one (not as a network error).
fn store(state: &AppState, creds: Credentials) -> Result<(), CanvasError> {
    state.vault.set(creds).map_err(CanvasError::Keychain)
}

async fn refreshed(state: &AppState, stale: &Credentials) -> Result<Credentials, CanvasError> {
    let _guard = state.refresh_lock.lock().await;
    // Another request may already have refreshed while we waited.
    let current = connected(state)?;
    if current.access_token() != stale.access_token() {
        return Ok(current);
    }
    let fresh = auth::refresh(&state.http, &current).await?;
    store(state, fresh.clone())?;
    Ok(fresh)
}

async fn fetch_user_name(
    http: &reqwest::Client,
    creds: &Credentials,
) -> Result<Option<String>, CanvasError> {
    let base = normalize_base_url(creds.base_url())?;
    let me = canvas::get_all(http, &base, creds.access_token(), "/api/v1/users/self", &[]).await?;
    Ok(me.get("name").and_then(Value::as_str).map(str::to_string))
}

/// Read-only Canvas GET. `path` must be under `/api/v1/`; arrays are returned with every page joined.
#[tauri::command]
async fn canvas_request(
    state: State<'_, AppState>,
    path: String,
    query: Vec<(String, String)>,
) -> Result<Value, String> {
    let mut creds = connected(&state).map_err(err)?;
    if creds.needs_refresh(auth::now_secs()) {
        creds = refreshed(&state, &creds).await.map_err(err)?;
    }
    let base = normalize_base_url(creds.base_url()).map_err(err)?;
    match canvas::get_all(&state.http, &base, creds.access_token(), &path, &query).await {
        Err(CanvasError::Unauthorized) if matches!(creds, Credentials::Oauth { .. }) => {
            let fresh = refreshed(&state, &creds).await.map_err(err)?;
            canvas::get_all(&state.http, &base, fresh.access_token(), &path, &query)
                .await
                .map_err(err)
        }
        other => other.map_err(err),
    }
}

/// When the connected access token expires, looked up with the token itself: Canvas finds a
/// user's token by its hint (`GET /api/v1/users/self/tokens/:hint`). The token and its hint stay
/// here; the frontend gets only the date. A rejected token is an error, so the app shows its
/// "token expired" banner; anything else Canvas refuses (an old token without a hint, a scoped
/// token, an admin restriction) just means the date can't be known.
#[tauri::command]
async fn token_expiry(state: State<'_, AppState>) -> Result<canvas::TokenExpiry, String> {
    let creds = connected(&state).map_err(err)?;
    let Credentials::Token { base_url, token } = &creds else {
        return Ok(canvas::TokenExpiry::NotApplicable);
    };
    let Some(hint) = canvas::token_hint(token) else {
        return Ok(canvas::TokenExpiry::Unknown);
    };
    let base = normalize_base_url(base_url).map_err(err)?;
    let path = format!("/api/v1/users/self/tokens/{hint}");
    let lookup = canvas::get_all(&state.http, &base, token, &path, &[]).await;
    expiry_from_lookup(lookup, &hint).map_err(err)
}

/// A rejected token or a network failure is an error. Canvas refusing the lookup, an odd
/// answer, or throttling (the date is only a hint, not worth retrying for) means it's unknown.
fn expiry_from_lookup(
    lookup: Result<Value, CanvasError>,
    hint: &str,
) -> Result<canvas::TokenExpiry, CanvasError> {
    match lookup {
        Ok(body) => Ok(canvas::read_token_expiry(&body, hint)),
        Err(
            CanvasError::Http { .. } | CanvasError::Decode(_) | CanvasError::RateLimited { .. },
        ) => Ok(canvas::TokenExpiry::Unknown),
        Err(e) => Err(e),
    }
}

// The commands below that read the keychain are async even where they don't await: sync
// commands run on the main thread, and a keychain prompt (unlock, allow access) would freeze the
// window while it's showing.

#[tauri::command]
async fn auth_status(state: State<'_, AppState>) -> Result<ConnectionInfo, String> {
    Ok(
        match state
            .vault
            .get()
            .map_err(|e| err(CanvasError::Keychain(e)))?
        {
            Some(creds) => ConnectionInfo::from_credentials(&creds, None),
            None => ConnectionInfo::disconnected(),
        },
    )
}

/// Tests the token against `/api/v1/users/self` before storing it.
#[tauri::command]
async fn save_token(
    state: State<'_, AppState>,
    base_url: String,
    token: String,
) -> Result<ConnectionInfo, String> {
    let base = normalize_base_url(&base_url).map_err(err)?;
    let creds = Credentials::Token {
        base_url: base.to_string(),
        token: token.trim().to_string(),
    };
    let name = fetch_user_name(&state.http, &creds).await.map_err(err)?;
    store(&state, creds.clone()).map_err(err)?;
    Ok(ConnectionInfo::from_credentials(&creds, name))
}

/// Runs the OAuth2 authorization-code flow through a loopback redirect in the system browser.
#[tauri::command]
async fn oauth_login(
    app: AppHandle,
    state: State<'_, AppState>,
    base_url: String,
    client_id: String,
    client_secret: String,
) -> Result<ConnectionInfo, String> {
    let base = normalize_base_url(&base_url).map_err(err)?;
    let expected_state = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Mutex::new(Some(tx));
    let port = tauri_plugin_oauth::start_with_config(
        OauthConfig {
            ports: Some(auth::OAUTH_PORTS.to_vec()),
            response: Some(OAUTH_DONE_PAGE.into()),
            redirect_uri: None,
        },
        move |url| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(url);
            }
        },
    )
    .map_err(|e| format!("could not start the local OAuth listener: {e}"))?;
    let redirect = auth::redirect_uri(port);
    let authorize = auth::authorize_url(&base, client_id.trim(), &redirect, &expected_state);

    let result = async {
        app.opener()
            .open_url(authorize.as_str(), None::<&str>)
            .map_err(err)?;
        let callback = tokio::time::timeout(OAUTH_TIMEOUT, rx)
            .await
            .map_err(|_| "timed out waiting for Canvas to redirect back".to_string())?
            .map_err(err)?;
        let code = auth::parse_callback(&callback, &expected_state)?;
        let creds = auth::exchange_code(
            &state.http,
            &base,
            client_id.trim(),
            client_secret.trim(),
            &redirect,
            &code,
        )
        .await
        .map_err(err)?;
        let name = fetch_user_name(&state.http, &creds).await.map_err(err)?;
        store(&state, creds.clone()).map_err(err)?;
        Ok(ConnectionInfo::from_credentials(&creds, name))
    }
    .await;
    let _ = tauri_plugin_oauth::cancel(port);
    result
}

/// Forgets the stored login. An OAuth token is revoked on Canvas first, best effort (offline,
/// the local copy is still deleted). A manual token is the user's own to manage in Canvas.
#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    if let Ok(Some(creds @ Credentials::Oauth { .. })) = state.vault.get() {
        let revoke_url = normalize_base_url(creds.base_url())
            .ok()
            .and_then(|base| base.join("/login/oauth2/token").ok());
        if let Some(url) = revoke_url {
            let revoke = state
                .http
                .delete(url)
                .bearer_auth(creds.access_token())
                .send();
            let _ = tokio::time::timeout(Duration::from_secs(5), revoke).await;
        }
    }
    state
        .vault
        .clear()
        .map_err(|e| err(CanvasError::Keychain(e)))
}

/// Same scheme, host and port (a missing port is the scheme's default).
fn same_origin(a: &url::Url, b: &url::Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// Opens a Canvas page in the system browser. Only links on the connected Canvas host are allowed.
#[tauri::command]
async fn open_external(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    let creds = connected(&state).map_err(err)?;
    let base = normalize_base_url(creds.base_url()).map_err(err)?;
    let target = url::Url::parse(&url).map_err(err)?;
    if !same_origin(&target, &base) {
        return Err("only Canvas links can be opened".into());
    }
    app.opener()
        .open_url(target.as_str(), None::<&str>)
        .map_err(err)
}

/// Opens a web page from Canvas content (a link in an assignment, say) in the system browser.
/// Only http and https; the app asks the user before calling this for non-Canvas links.
#[tauri::command]
fn open_web_link(app: AppHandle, url: String) -> Result<(), String> {
    let target = url::Url::parse(&url).map_err(err)?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("only web links can be opened".into());
    }
    app.opener()
        .open_url(target.as_str(), None::<&str>)
        .map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = reqwest::Client::builder()
        .user_agent(concat!("Tarpaulin/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client");
    tauri::Builder::default()
        // First, so a second launch hands over before anything else is set up: it brings up the
        // running app's window and exits, instead of adding a second tray icon and poller.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app)
        }))
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        // Remembers the window's size, position and maximised state between launches, so an
        // update (or any restart) reopens it exactly where it was.
        // Visibility is left out: quitting from the tray (window hidden) must not make the next
        // launch start invisible.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(updater::WINDOW_STATE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![desktop::AUTOSTART_ARG]),
        ))
        .manage(updater::PendingUpdate::default())
        .manage(tray::TrayActions::default())
        .manage(desktop::Startup::new(desktop::launched_at_login()))
        .setup(|app| {
            let prefs_path = app
                .path()
                .app_config_dir()
                .ok()
                .map(|dir| dir.join("desktop.json"));
            app.manage(desktop::Prefs::load(prefs_path));
            // Without a tray the app still runs; closing the window then quits (see tray.rs).
            if let Err(e) = tray::setup(app.handle()) {
                eprintln!("tray icon unavailable: {e}");
            }
            desktop::prepare_main(app.handle());
            Ok(())
        })
        // The window starts hidden (tauri.conf.json) and appears once its page has loaded.
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == PageLoadEvent::Finished {
                desktop::reveal_main(webview.app_handle());
            }
        })
        .on_window_event(tray::on_window_event)
        .manage(AppState {
            http,
            vault: CredentialVault::new(Box::new(KeyringStore)),
            refresh_lock: AsyncMutex::new(()),
        })
        .invoke_handler(tauri::generate_handler![
            canvas_request,
            auth_status,
            token_expiry,
            save_token,
            oauth_login,
            logout,
            open_external,
            open_web_link,
            updater::app_version,
            updater::check_update,
            updater::install_update,
            desktop::notification_permission,
            desktop::request_notification_permission,
            desktop::notify,
            desktop::autostart_enabled,
            desktop::set_autostart,
            desktop::launched_at_login,
            desktop::set_start_minimized,
            tray::set_close_to_tray,
            tray::subscribe_tray,
            export::save_export
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tarpaulin")
        .run(|app, event| {
            // macOS: clicking the Dock icon while the window is hidden brings it back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                tray::show_main(app);
            }
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_expiry_is_unknown_when_canvas_wont_say() {
        let unknown = |e| {
            matches!(
                expiry_from_lookup(Err(e), "AbCde"),
                Ok(canvas::TokenExpiry::Unknown)
            )
        };
        assert!(unknown(CanvasError::Http {
            status: 404,
            body: String::new()
        }));
        assert!(unknown(CanvasError::Decode("x".into())));
        assert!(unknown(CanvasError::RateLimited { status: 403 }));
        assert!(matches!(
            expiry_from_lookup(Err(CanvasError::Unauthorized), "AbCde"),
            Err(CanvasError::Unauthorized)
        ));
        assert!(matches!(
            expiry_from_lookup(Err(CanvasError::Network("down".into())), "AbCde"),
            Err(CanvasError::Network(_))
        ));
    }

    #[test]
    fn canvas_links_must_match_the_port_too() {
        let base = url::Url::parse("https://canvas.example.edu").unwrap();
        let link = |s: &str| url::Url::parse(s).unwrap();
        assert!(same_origin(
            &link("https://canvas.example.edu/courses/1"),
            &base
        ));
        assert!(same_origin(
            &link("https://canvas.example.edu:443/courses/1"),
            &base
        ));
        assert!(!same_origin(
            &link("https://canvas.example.edu:8443/courses/1"),
            &base
        ));
        assert!(!same_origin(
            &link("http://canvas.example.edu/courses/1"),
            &base
        ));
        assert!(!same_origin(
            &link("https://evil.example.edu/courses/1"),
            &base
        ));
    }
}
