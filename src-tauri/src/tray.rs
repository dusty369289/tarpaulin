//! Tray icon and close-to-tray: closing the window hides it (reminders keep coming) unless the
//! user turned that off. The tray menu reopens the window or quits for real.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};

/// Mirrors the "close to tray" setting, which lives in the web view's settings store.
pub struct CloseToTray(pub AtomicBool);

impl Default for CloseToTray {
    fn default() -> Self {
        Self(AtomicBool::new(true))
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Tarpaulin", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Tarpaulin", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Tarpaulin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
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

/// Window close: hide instead, when close-to-tray is on.
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.app_handle().state::<CloseToTray>().0.load(Ordering::Relaxed) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

/// For a launch at login: out of the way, in the tray if close-to-tray is on, else minimised.
#[tauri::command]
pub fn send_to_background(app: AppHandle, state: State<'_, CloseToTray>) -> Result<(), String> {
    let Some(w) = app.get_webview_window("main") else { return Ok(()) };
    if state.0.load(Ordering::Relaxed) { w.hide() } else { w.minimize() }.map_err(|e| e.to_string())
}
