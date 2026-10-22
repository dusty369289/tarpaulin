//! Desktop integration: system notifications, opening at login and how the window first
//! appears. Like the updater, these are the app's own commands, so the web view needs no plugin
//! permissions.
//!
//! The main window is created hidden (tauri.conf.json) and shown from here once its page has
//! loaded, so no empty frame flashes up, and a launch at login that should stay in the tray never
//! shows at all. That decision is made before the web view runs, so the desktop settings it needs
//! are mirrored into a small file (`ShellPrefs`).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::{NotificationExt, PermissionState};

/// Passed to the app when the OS starts it at login, so it can start minimised.
pub const AUTOSTART_ARG: &str = "--autostart";

/// If the page never reports that it loaded (a broken build, say), show the window anyway.
const REVEAL_FALLBACK: Duration = Duration::from_secs(8);

/// The desktop settings the shell needs on its own: at startup, before the web view has loaded,
/// and when the window closes. The web view's settings store stays the source of truth and
/// mirrors these here (`set_close_to_tray`, `set_start_minimized`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShellPrefs {
    pub close_to_tray: bool,
    pub start_minimized: bool,
    /// The one-time "still running in the tray" notification has been shown.
    pub tray_hint_shown: bool,
}

/// Same defaults as src/app/settingsStore.ts.
impl Default for ShellPrefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_minimized: true,
            tray_hint_shown: false,
        }
    }
}

/// `ShellPrefs`, kept in `desktop.json` in the app's config directory. A missing or unreadable
/// file means the defaults; a failed write only loses the mirror until the next change.
pub struct Prefs {
    path: Option<PathBuf>,
    current: Mutex<ShellPrefs>,
}

impl Prefs {
    pub fn load(path: Option<PathBuf>) -> Self {
        let current = path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            current: Mutex::new(current),
        }
    }

    pub fn get(&self) -> ShellPrefs {
        self.current.lock().unwrap().clone()
    }

    /// Changes the prefs and writes them out if anything changed; returns the new prefs.
    pub fn update(&self, change: impl FnOnce(&mut ShellPrefs)) -> ShellPrefs {
        let mut current = self.current.lock().unwrap();
        let before = current.clone();
        change(&mut current);
        if *current != before {
            if let Some(path) = &self.path {
                if let Some(dir) = path.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                if let Ok(text) = serde_json::to_string_pretty(&*current) {
                    let _ = std::fs::write(path, text);
                }
            }
        }
        current.clone()
    }
}

/// How the main window first appears.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reveal {
    Show,
    /// Launched at login with close-to-tray off: on the taskbar, out of the way.
    Minimize,
    /// Launched at login with close-to-tray on: only the tray icon.
    StayHidden,
}

pub fn initial_reveal(at_login: bool, prefs: &ShellPrefs) -> Reveal {
    if !at_login || !prefs.start_minimized {
        Reveal::Show
    } else if prefs.close_to_tray {
        Reveal::StayHidden
    } else {
        Reveal::Minimize
    }
}

/// Startup bookkeeping for the main window.
pub struct Startup {
    at_login: bool,
    revealed: Mutex<Option<Reveal>>,
    /// Set once the web view's own setting has been checked against the mirror, or the user
    /// opened the window themselves. After that, startup never moves the window again.
    settled: AtomicBool,
}

impl Startup {
    pub fn new(at_login: bool) -> Self {
        Self {
            at_login,
            revealed: Mutex::new(None),
            settled: AtomicBool::new(false),
        }
    }

    /// The user brought the window up (tray, Dock, a second launch).
    pub fn user_opened(&self) {
        self.settled.store(true, Ordering::Relaxed);
        self.revealed.lock().unwrap().get_or_insert(Reveal::Show);
    }
}

fn apply_reveal(app: &AppHandle, reveal: Reveal) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    match reveal {
        Reveal::Show => {
            let _ = w.show();
            let _ = w.set_focus();
        }
        Reveal::Minimize => {
            let _ = w.show();
            let _ = w.minimize();
        }
        Reveal::StayHidden => {
            let _ = w.hide();
        }
    }
}

/// Shows the main window as the startup prefs say, the first time it's called (once the page
/// has loaded). Later calls do nothing.
pub fn reveal_main(app: &AppHandle) {
    let startup = app.state::<Startup>();
    let reveal = {
        let mut revealed = startup.revealed.lock().unwrap();
        if revealed.is_some() {
            return;
        }
        let reveal = initial_reveal(startup.at_login, &app.state::<Prefs>().get());
        *revealed = Some(reveal);
        reveal
    };
    apply_reveal(app, reveal);
}

/// Called from setup. The window's background colour (tauri.conf.json) is the dark plain theme;
/// on a light system it's switched to the light one, so resizing before the page paints doesn't
/// flash the wrong colour. Also makes sure the window appears even if the page never loads.
pub fn prepare_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if matches!(w.theme(), Ok(tauri::Theme::Light)) {
            let _ = w.set_background_color(Some(tauri::window::Color(0xf4, 0xf5, 0xf7, 0xff)));
        }
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(REVEAL_FALLBACK).await;
        reveal_main(&app);
    });
}

fn permission_name(state: PermissionState) -> &'static str {
    match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        _ => "prompt",
    }
}

/// "granted", "denied" or "prompt" (not decided yet).
#[tauri::command]
pub fn notification_permission(app: AppHandle) -> Result<&'static str, String> {
    app.notification()
        .permission_state()
        .map(permission_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<&'static str, String> {
    app.notification()
        .request_permission()
        .map(permission_name)
        .map_err(|e| e.to_string())
}

/// Shows a system notification. Titles and bodies are capped so a long Canvas title can't
/// produce an unreadable toast.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(clip(&title, 80))
        .body(clip(&body, 240))
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())?;
    launcher.is_enabled().map_err(|e| e.to_string())
}

/// Whether this launch came from the OS at login (rather than the user opening the app).
#[tauri::command]
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == AUTOSTART_ARG)
}

/// Mirrors "start minimised at login". On a launch at login, the first call also corrects the
/// window if the mirror was out of date (the setting changed after it was last written).
#[tauri::command]
pub fn set_start_minimized(
    app: AppHandle,
    prefs: State<'_, Prefs>,
    startup: State<'_, Startup>,
    enabled: bool,
) {
    let prefs = prefs.update(|p| p.start_minimized = enabled);
    if !startup.at_login || startup.settled.swap(true, Ordering::Relaxed) {
        return;
    }
    let wanted = initial_reveal(true, &prefs);
    let mut revealed = startup.revealed.lock().unwrap();
    // Not revealed yet: the reveal reads the new value itself.
    if revealed.is_some_and(|r| r != wanted) {
        *revealed = Some(wanted);
        drop(revealed);
        apply_reveal(&app, wanted);
    }
}

fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    let cut: String = s.chars().take(max - 1).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_prefs_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("tarpaulin-test-{}", uuid::Uuid::new_v4()))
            .join("desktop.json")
    }

    #[test]
    fn clips_long_text_on_char_boundaries() {
        assert_eq!(clip("  short  ", 10), "short");
        assert_eq!(clip("abcdefghij", 10), "abcdefghij");
        assert_eq!(clip("abcdefghijk", 10), "abcdefghi…");
        // Multi-byte characters never split.
        assert_eq!(clip("ééééééé", 4), "ééé…");
    }

    #[test]
    fn prefs_default_when_missing_or_unreadable() {
        assert_eq!(Prefs::load(None).get(), ShellPrefs::default());
        let path = temp_prefs_path();
        assert_eq!(Prefs::load(Some(path.clone())).get(), ShellPrefs::default());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(Prefs::load(Some(path.clone())).get(), ShellPrefs::default());
        // Missing fields take their defaults; unknown ones are ignored.
        std::fs::write(&path, r#"{"startMinimized":false,"somethingNew":1}"#).unwrap();
        let loaded = Prefs::load(Some(path.clone())).get();
        assert_eq!(
            loaded,
            ShellPrefs {
                start_minimized: false,
                ..ShellPrefs::default()
            }
        );
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn prefs_survive_a_restart() {
        let path = temp_prefs_path();
        let prefs = Prefs::load(Some(path.clone()));
        let updated = prefs.update(|p| {
            p.close_to_tray = false;
            p.tray_hint_shown = true;
        });
        assert!(!updated.close_to_tray && updated.tray_hint_shown);
        assert_eq!(Prefs::load(Some(path.clone())).get(), updated);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn window_appears_unless_launched_at_login_to_the_background() {
        let prefs = |start_minimized, close_to_tray| ShellPrefs {
            start_minimized,
            close_to_tray,
            tray_hint_shown: false,
        };
        assert_eq!(initial_reveal(false, &prefs(true, true)), Reveal::Show);
        assert_eq!(initial_reveal(true, &prefs(false, true)), Reveal::Show);
        assert_eq!(initial_reveal(true, &prefs(true, true)), Reveal::StayHidden);
        assert_eq!(initial_reveal(true, &prefs(true, false)), Reveal::Minimize);
    }

    #[test]
    fn opening_the_window_settles_startup() {
        let startup = Startup::new(true);
        startup.user_opened();
        assert!(startup.settled.load(Ordering::Relaxed));
        assert_eq!(*startup.revealed.lock().unwrap(), Some(Reveal::Show));
    }
}
