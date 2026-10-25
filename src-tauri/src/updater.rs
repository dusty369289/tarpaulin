//! Self-update from GitHub Releases. The release workflow publishes signed bundles plus a
//! `latest.json` manifest; the updater only installs artifacts signed with the key whose public
//! half is in tauri.conf.json. Exposed through the app's own commands so the web view needs no
//! plugin permissions.
//!
//! Installs are hands-off: the Windows installer runs silently (installMode "quiet" in
//! tauri.conf.json), the app relaunches itself, the window state plugin puts the window back
//! where it was, and the web side reopens the page you were on (see src/app/updater.ts).
//!
//! With automatic updates on, the web side calls `download_update` in the background; the
//! verified package is kept in memory and installed when the app quits (`install_on_exit`), or
//! straight away if the user picks "Restart now".

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// What the window state plugin remembers: everything except visibility.
pub const WINDOW_STATE: StateFlags = StateFlags::all().difference(StateFlags::VISIBLE);

/// The update found by the last check, and its package once downloaded and verified.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Pending>);

#[derive(Default)]
pub struct Pending {
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}

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
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    let mut pending = pending.0.lock().unwrap();
    // A package already downloaded for this same version stays ready.
    let same = matches!((&pending.update, &update), (Some(a), Some(b)) if a.version == b.version);
    if !same {
        pending.bytes = None;
    }
    pending.update = update;
    Ok(info)
}

fn progress(on_event: &Channel<DownloadEvent>) -> impl FnMut(usize, Option<u64>) + '_ {
    let mut started = false;
    move |chunk_length, content_length| {
        if !started {
            let _ = on_event.send(DownloadEvent::Started { content_length });
            started = true;
        }
        let _ = on_event.send(DownloadEvent::Progress { chunk_length });
    }
}

/// Downloads and verifies the pending update without installing it; it installs on quit.
#[tauri::command]
pub async fn download_update(
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = {
        let pending = pending.0.lock().unwrap();
        if pending.bytes.is_some() {
            let _ = on_event.send(DownloadEvent::Finished);
            return Ok(());
        }
        pending.update.clone().ok_or("no update to download; check first")?
    };
    let bytes = update
        .download(progress(&on_event), || {
            let _ = on_event.send(DownloadEvent::Finished);
        })
        .await
        .map_err(|e| e.to_string())?;
    let mut pending = pending.0.lock().unwrap();
    // Only keep it if a newer check hasn't replaced the update meanwhile.
    if pending.update.as_ref().is_some_and(|u| u.version == update.version) {
        pending.bytes = Some(bytes);
    }
    Ok(())
}

/// Installs the pending update now (downloading it first unless that's done), then restarts.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let (update, bytes) = {
        let mut pending = pending.0.lock().unwrap();
        let update = pending.update.take().ok_or("no update to install; check first")?;
        (update, pending.bytes.take())
    };
    match bytes {
        Some(bytes) => {
            let _ = on_event.send(DownloadEvent::Finished);
            update.install(bytes)
        }
        None => {
            update
                .download_and_install(progress(&on_event), || {
                    let _ = on_event.send(DownloadEvent::Finished);
                })
                .await
        }
    }
    .map_err(|e| e.to_string())?;
    // Save the window's place before the old version goes, so the new one opens on top of it.
    let _ = app.save_window_state(WINDOW_STATE);
    app.restart();
}

/// Drops a downloaded update (the user skipped that version), so quitting doesn't install it.
#[tauri::command]
pub fn forget_update(pending: State<'_, PendingUpdate>) {
    *pending.0.lock().unwrap() = Pending::default();
}

/// On quit: installs a downloaded update, so the next launch is the new version. The Windows
/// installer is told not to start the app again (the user just quit it).
pub fn install_on_exit(pending: &PendingUpdate) {
    let mut pending = pending.0.lock().unwrap();
    if let (Some(update), Some(bytes)) = (pending.update.take(), pending.bytes.take()) {
        if let Err(e) = update.restart_after_install(false).install(bytes) {
            eprintln!("installing the update on quit failed: {e}");
        }
    }
}
