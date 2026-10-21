//! Desktop integration: system notifications and opening at login. Like the updater, these are
//! the app's own commands, so the web view needs no plugin permissions.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::{NotificationExt, PermissionState};

/// Passed to the app when the OS starts it at login, so it can start minimised.
pub const AUTOSTART_ARG: &str = "--autostart";

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
    app.notification().permission_state().map(permission_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<&'static str, String> {
    app.notification().request_permission().map(permission_name).map_err(|e| e.to_string())
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
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())?;
    launcher.is_enabled().map_err(|e| e.to_string())
}

/// Whether this launch came from the OS at login (rather than the user opening the app).
#[tauri::command]
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == AUTOSTART_ARG)
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
    use super::clip;

    #[test]
    fn clips_long_text_on_char_boundaries() {
        assert_eq!(clip("  short  ", 10), "short");
        assert_eq!(clip("abcdefghij", 10), "abcdefghij");
        assert_eq!(clip("abcdefghijk", 10), "abcdefghi…");
        // Multi-byte characters never split.
        assert_eq!(clip("ééééééé", 4), "ééé…");
    }
}
