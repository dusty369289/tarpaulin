//! Credentials live only in the OS keychain (and in memory once loaded); the frontend never sees
//! them. Supports personal access tokens and Canvas OAuth2 with refresh tokens.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use url::Url;

use crate::canvas::{normalize_base_url, CanvasError};

const KEYCHAIN_SERVICE: &str = "dev.tarpaulin.app";
const KEYCHAIN_ACCOUNT: &str = "canvas-credentials";
/// Fixed loopback ports so they can be registered as redirect URIs on a Canvas developer key.
pub const OAUTH_PORTS: [u16; 3] = [43821, 43822, 43823];
pub const OAUTH_CALLBACK_PATH: &str = "/oauth/callback";
/// Refresh this many seconds before Canvas says the access token expires.
const REFRESH_SKEW_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum Credentials {
    Token {
        base_url: String,
        token: String,
    },
    Oauth {
        base_url: String,
        client_id: String,
        client_secret: String,
        access_token: String,
        refresh_token: Option<String>,
        /// Unix seconds.
        expires_at: Option<u64>,
    },
}

impl Credentials {
    pub fn base_url(&self) -> &str {
        match self {
            Credentials::Token { base_url, .. } | Credentials::Oauth { base_url, .. } => base_url,
        }
    }

    pub fn access_token(&self) -> &str {
        match self {
            Credentials::Token { token, .. } => token,
            Credentials::Oauth { access_token, .. } => access_token,
        }
    }

    pub fn method(&self) -> &'static str {
        match self {
            Credentials::Token { .. } => "token",
            Credentials::Oauth { .. } => "oauth",
        }
    }

    pub fn needs_refresh(&self, now: u64) -> bool {
        matches!(self, Credentials::Oauth { expires_at: Some(exp), refresh_token: Some(_), .. }
            if now + REFRESH_SKEW_SECS >= *exp)
    }
}

/// What the frontend is allowed to know about the connection.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub connected: bool,
    pub base_url: Option<String>,
    pub method: Option<String>,
    pub user_name: Option<String>,
}

impl ConnectionInfo {
    pub fn disconnected() -> Self {
        Self {
            connected: false,
            base_url: None,
            method: None,
            user_name: None,
        }
    }

    pub fn from_credentials(creds: &Credentials, user_name: Option<String>) -> Self {
        Self {
            connected: true,
            base_url: Some(creds.base_url().trim_end_matches('/').to_string()),
            method: Some(creds.method().to_string()),
            user_name,
        }
    }
}

pub trait SecretStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, secret: &str) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

pub struct KeyringStore;

impl KeyringStore {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
    }
}

impl SecretStore for KeyringStore {
    fn load(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn save(&self, secret: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(secret)
            .map_err(|e| e.to_string())
    }

    fn clear(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Caches credentials in memory so the keychain is read once per launch.
pub struct CredentialVault {
    store: Box<dyn SecretStore>,
    cache: Mutex<Option<Option<Credentials>>>,
}

impl CredentialVault {
    pub fn new(store: Box<dyn SecretStore>) -> Self {
        Self {
            store,
            cache: Mutex::new(None),
        }
    }

    pub fn get(&self) -> Result<Option<Credentials>, String> {
        let mut cache = self.cache.lock().unwrap();
        if let Some(cached) = cache.as_ref() {
            return Ok(cached.clone());
        }
        let creds = match self.store.load()? {
            Some(raw) => serde_json::from_str(&raw).ok(),
            None => None,
        };
        *cache = Some(creds.clone());
        Ok(creds)
    }

    pub fn set(&self, creds: Credentials) -> Result<(), String> {
        let raw = serde_json::to_string(&creds).map_err(|e| e.to_string())?;
        self.store.save(&raw)?;
        *self.cache.lock().unwrap() = Some(Some(creds));
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        self.store.clear()?;
        *self.cache.lock().unwrap() = Some(None);
        Ok(())
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}{OAUTH_CALLBACK_PATH}")
}

pub fn authorize_url(base: &Url, client_id: &str, redirect_uri: &str, state: &str) -> Url {
    let mut url = base.join("/login/oauth2/auth").expect("static path joins");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("state", state);
    url
}

/// Pulls the authorization code out of the loopback redirect, checking `state` to block CSRF.
pub fn parse_callback(callback: &str, expected_state: &str) -> Result<String, String> {
    let url = Url::parse(callback).map_err(|e| format!("bad callback URL: {e}"))?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.into_owned())
    };
    if let Some(err) = param("error") {
        let desc = param("error_description").unwrap_or_default();
        return Err(format!("Canvas denied access: {err} {desc}")
            .trim()
            .to_string());
    }
    if param("state").as_deref() != Some(expected_state) {
        return Err("OAuth state mismatch; try connecting again".into());
    }
    param("code")
        .filter(|c| !c.is_empty())
        .ok_or_else(|| "no authorization code returned".into())
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
}

async fn post_token(
    http: &reqwest::Client,
    base: &Url,
    form: &[(&str, &str)],
) -> Result<TokenResponse, CanvasError> {
    let url = base.join("/login/oauth2/token").expect("static path joins");
    let response = http
        .post(url)
        .form(form)
        .send()
        .await
        .map_err(|e| CanvasError::Network(e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(CanvasError::Http {
            status: status.as_u16(),
            body: body.chars().take(300).collect(),
        });
    }
    response
        .json()
        .await
        .map_err(|e| CanvasError::Decode(e.to_string()))
}

pub async fn exchange_code(
    http: &reqwest::Client,
    base: &Url,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> Result<Credentials, CanvasError> {
    let token = post_token(
        http,
        base,
        &[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("code", code),
        ],
    )
    .await?;
    Ok(Credentials::Oauth {
        base_url: base.to_string(),
        client_id: client_id.into(),
        client_secret: client_secret.into(),
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_in.map(|s| now_secs() + s),
    })
}

/// Swaps the refresh token for a new access token. Canvas doesn't rotate refresh tokens, so the
/// old one is kept when the response omits it.
pub async fn refresh(
    http: &reqwest::Client,
    creds: &Credentials,
) -> Result<Credentials, CanvasError> {
    let Credentials::Oauth {
        base_url,
        client_id,
        client_secret,
        refresh_token: Some(refresh_token),
        ..
    } = creds
    else {
        return Err(CanvasError::Unauthorized);
    };
    let base = normalize_base_url(base_url)?;
    let token = post_token(
        http,
        &base,
        &[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
        ],
    )
    .await?;
    Ok(Credentials::Oauth {
        base_url: base_url.clone(),
        client_id: client_id.clone(),
        client_secret: client_secret.clone(),
        access_token: token.access_token,
        refresh_token: token.refresh_token.or_else(|| Some(refresh_token.clone())),
        expires_at: token.expires_in.map(|s| now_secs() + s),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryStore(Mutex<Option<String>>);

    impl SecretStore for std::sync::Arc<MemoryStore> {
        fn load(&self) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().clone())
        }
        fn save(&self, secret: &str) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(secret.into());
            Ok(())
        }
        fn clear(&self) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    fn oauth(expires_at: Option<u64>) -> Credentials {
        Credentials::Oauth {
            base_url: "https://c.edu/".into(),
            client_id: "id".into(),
            client_secret: "secret".into(),
            access_token: "access".into(),
            refresh_token: Some("refresh".into()),
            expires_at,
        }
    }

    #[test]
    fn vault_round_trips_through_store() {
        let mem = std::sync::Arc::new(MemoryStore::default());
        let vault = CredentialVault::new(Box::new(mem.clone()));
        assert_eq!(vault.get().unwrap(), None);
        let creds = Credentials::Token {
            base_url: "https://c.edu/".into(),
            token: "t".into(),
        };
        vault.set(creds.clone()).unwrap();
        assert!(mem
            .0
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .contains("\"method\":\"token\""));
        let fresh = CredentialVault::new(Box::new(mem.clone()));
        assert_eq!(fresh.get().unwrap(), Some(creds));
        fresh.clear().unwrap();
        assert_eq!(fresh.get().unwrap(), None);
        assert!(mem.0.lock().unwrap().is_none());
    }

    #[test]
    fn connection_info_hides_secrets() {
        let info = ConnectionInfo::from_credentials(&oauth(None), Some("Sam".into()));
        let json = serde_json::to_string(&info).unwrap();
        assert!(!json.contains("access") && !json.contains("secret") && !json.contains("refresh"));
        assert_eq!(info.base_url.as_deref(), Some("https://c.edu"));
    }

    #[test]
    fn refresh_window() {
        assert!(oauth(Some(1_000)).needs_refresh(950));
        assert!(!oauth(Some(1_000)).needs_refresh(100));
        assert!(!oauth(None).needs_refresh(u64::MAX - 100));
        let token = Credentials::Token {
            base_url: "https://c.edu/".into(),
            token: "t".into(),
        };
        assert!(!token.needs_refresh(u64::MAX - 100));
    }

    #[test]
    fn builds_authorize_url() {
        let base = normalize_base_url("https://c.edu").unwrap();
        let url = authorize_url(&base, "10000000000001", &redirect_uri(43821), "xyz");
        assert_eq!(
            url.as_str(),
            "https://c.edu/login/oauth2/auth?client_id=10000000000001&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A43821%2Foauth%2Fcallback&state=xyz"
        );
    }

    #[test]
    fn parses_callbacks() {
        let ok = "http://127.0.0.1:43821/oauth/callback?code=abc&state=xyz";
        assert_eq!(parse_callback(ok, "xyz").unwrap(), "abc");
        assert!(parse_callback(ok, "other").unwrap_err().contains("state"));
        let denied = "http://127.0.0.1:43821/oauth/callback?error=access_denied&state=xyz";
        assert!(parse_callback(denied, "xyz")
            .unwrap_err()
            .contains("access_denied"));
        let empty = "http://127.0.0.1:43821/oauth/callback?code=&state=xyz";
        assert!(parse_callback(empty, "xyz").is_err());
    }

    /// Serves one canned token response and hands back the raw request it received.
    async fn token_server(body: &'static str) -> (Url, tokio::task::JoinHandle<String>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(resp.as_bytes()).await.unwrap();
            req
        });
        (
            normalize_base_url(&format!("http://127.0.0.1:{port}")).unwrap(),
            handle,
        )
    }

    #[tokio::test]
    async fn exchanges_code_for_tokens() {
        let (base, req) =
            token_server(r#"{"access_token":"a1","refresh_token":"r1","expires_in":3600}"#).await;
        let http = reqwest::Client::new();
        let creds = exchange_code(
            &http,
            &base,
            "cid",
            "csecret",
            &redirect_uri(43821),
            "the-code",
        )
        .await
        .unwrap();
        let req = req.await.unwrap();
        assert!(req.starts_with("POST /login/oauth2/token"));
        assert!(req.contains("grant_type=authorization_code"));
        assert!(req.contains("code=the-code"));
        assert!(req.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A43821%2Foauth%2Fcallback"));
        match creds {
            Credentials::Oauth {
                access_token,
                refresh_token,
                expires_at,
                ..
            } => {
                assert_eq!(access_token, "a1");
                assert_eq!(refresh_token.as_deref(), Some("r1"));
                assert!(expires_at.unwrap() > now_secs());
            }
            other => panic!("expected OAuth credentials, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn refresh_keeps_refresh_token_when_canvas_omits_it() {
        let (base, req) = token_server(r#"{"access_token":"a2","expires_in":3600}"#).await;
        let http = reqwest::Client::new();
        let stale = Credentials::Oauth {
            base_url: base.to_string(),
            client_id: "cid".into(),
            client_secret: "csecret".into(),
            access_token: "a1".into(),
            refresh_token: Some("r1".into()),
            expires_at: Some(0),
        };
        let fresh = refresh(&http, &stale).await.unwrap();
        assert!(req.await.unwrap().contains("grant_type=refresh_token"));
        assert_eq!(fresh.access_token(), "a2");
        assert!(
            matches!(fresh, Credentials::Oauth { refresh_token: Some(ref r), .. } if r == "r1")
        );
    }

    #[tokio::test]
    async fn token_credentials_cannot_refresh() {
        let http = reqwest::Client::new();
        let token = Credentials::Token {
            base_url: "https://c.edu/".into(),
            token: "t".into(),
        };
        assert_eq!(
            refresh(&http, &token).await.unwrap_err(),
            CanvasError::Unauthorized
        );
    }
}
