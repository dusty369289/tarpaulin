//! Tray icon and close-to-tray: closing the window hides it (reminders keep coming) unless the
//! user turned that off. The tray menu reopens the window, passes Refresh, Settings and Check for
//! updates to the web view, or quits for real.

use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_notification::NotificationExt;

use crate::desktop::{Prefs, Startup};

/// The web view's listener for tray menu actions (see `subscribe_tray`).
#[derive(Default)]
pub struct TrayActions(Mutex<Option<Channel<String>>>);

/// Menu items the web view handles, by id. The same words reach it through the channel.
const WEB_ACTIONS: [&str; 3] = ["refresh", "settings", "check-updates"];

pub fn show_main(app: &AppHandle) {
    app.state::<Startup>().user_opened();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn send_to_web(app: &AppHandle, action: &str) {
    if let Some(channel) = app.state::<TrayActions>().0.lock().unwrap().as_ref() {
        let _ = channel.send(action.to_string());
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Tarpaulin", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "check-updates", "Check for updates…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Tarpaulin", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &refresh,
            &settings,
            &updates,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Tarpaulin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            // Refresh happens in place; the others need the window to show their result.
            "refresh" => send_to_web(app, "refresh"),
            id if WEB_ACTIONS.contains(&id) => {
                show_main(app);
                send_to_web(app, id);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Window close: hide instead, when close-to-tray is on. The first time, say so, so the app
/// doesn't seem to have quit while it keeps sending reminders.
///
/// Linux desktops without a StatusNotifier host (GNOME without the AppIndicator extension) still
/// build the icon but never show it; there the window can only come back by launching the app
/// again, which the single-instance plugin turns into showing this window.
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let prefs = app.state::<Prefs>();
        // No tray icon (it failed to build): hiding would leave no way back but relaunching.
        if !prefs.get().close_to_tray || app.tray_by_id("main").is_none() {
            return;
        }
        api.prevent_close();
        let _ = window.hide();
        if !prefs.get().tray_hint_shown {
            prefs.update(|p| p.tray_hint_shown = true);
            let _ = app
                .notification()
                .builder()
                .title("Tarpaulin is still running")
                .body("Reminders keep coming. Open it again from the tray icon, or quit from its menu.")
                .show();
        }
    }
}

#[tauri::command]
pub fn set_close_to_tray(prefs: State<'_, Prefs>, enabled: bool) {
    prefs.update(|p| p.close_to_tray = enabled);
}

/// The web view registers here for tray menu actions ("refresh", "settings", "check-updates").
/// A reload registers again and replaces the old listener.
#[tauri::command]
pub fn subscribe_tray(actions: State<'_, TrayActions>, on_action: Channel<String>) {
    *actions.0.lock().unwrap() = Some(on_action);
}
