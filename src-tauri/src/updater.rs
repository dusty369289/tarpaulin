//! Self-update from GitHub Releases. The release workflow publishes signed bundles plus a
//! `latest.json` manifest; the updater only installs artifacts signed with the key whose public
//! half is in tauri.conf.json. Exposed through the app's own commands so the web view needs no
//! plugin permissions.
//!
//! Installs are hands-off: the Windows installer runs silently (installMode "quiet" in
//! tauri.conf.json), the app relaunches itself, the window state plugin puts the window back
//! where it was, and the web side reopens the page you were on (see src/app/updater.ts).

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// What the window state plugin remembers: everything except visibility.
pub const WINDOW_STATE: StateFlags = StateFlags::all().difference(StateFlags::VISIBLE);

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started { content_length: Option<u64> },
    Progress { chunk_length: usize },
    Finished,
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Checks the release manifest; remembers the update so `install_update` can apply it.
#[tauri::command]
pub async fn check_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

/// Downloads, verifies and installs the pending update, streaming progress, then restarts.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take().ok_or("no update to install; check first")?;
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    // Save the window's place before the old version goes, so the new one opens on top of it.
    let _ = app.save_window_state(WINDOW_STATE);
    app.restart();
}
