#![windows_subsystem = "windows"]

mod adb;
mod config;
pub mod haptics_cfg;
mod hud;
pub mod presets_window;
mod supervisor;
pub mod test_mode_window;
mod tray;
pub mod tuning_window;

use adb::{find_adb, force_5ghz_nudge, query_telemetry, retrigger_tether, PhoneTelemetry};
use hud::{create_hud_window, toggle_hud, HudState, HUD_STATE};
use std::mem::zeroed;
use std::path::PathBuf;
use std::sync::Mutex;
use supervisor::Supervisor;
use tray::{
    show_tray_context_menu, toggle_startup, TrayManager, IDM_EXIT, IDM_NUDGE, IDM_OPEN_TUNING,
    IDM_RESTART_ALL, IDM_RETRIGGER, IDM_STARTUP, IDM_TOGGLE_ENERGY, IDM_TOGGLE_HAPTICS,
    IDM_TOGGLE_TETHER, IDM_TOGGLE_WATCHDOG, IDM_TOGGLE_WIFI, WM_TRAYICON,
};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::InvalidateRect;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, IsWindowVisible,
    LoadCursorW, PostMessageW, PostQuitMessage, RegisterClassW, IDC_ARROW, MSG,
    WM_APP, WM_CLOSE, WM_COMMAND, WM_DESTROY, WM_LBUTTONUP, WM_RBUTTONUP, WNDCLASSW,
};

const WM_TELEMETRY_UPDATED: u32 = WM_APP + 20;

struct GlobalState {
    supervisor: Supervisor,
    telemetry: PhoneTelemetry,
    adb: Option<PathBuf>,
    tray: Option<TrayManager>,
    hud_hwnd: HWND,
}

unsafe impl Send for GlobalState {}

static STATE: Mutex<Option<GlobalState>> = Mutex::new(None);

pub fn toggle_daemon_global(id: &'static str) {
    if let Ok(mut lock) = STATE.lock() {
        if let Some(state) = lock.as_mut() {
            state.supervisor.toggle_daemon(id);

            // Sync to HUD
            if let Ok(mut hlock) = HUD_STATE.lock() {
                if let Some(hstate) = hlock.as_mut() {
                    hstate.supervisor.config = state.supervisor.config.clone();
                }
            }
            unsafe {
                InvalidateRect(state.hud_hwnd, std::ptr::null(), 0);
            }
        }
    }
}

pub fn restart_active_daemons_global() {
    if let Ok(mut lock) = STATE.lock() {
        if let Some(state) = lock.as_mut() {
            state.supervisor.restart_all_active();
            unsafe {
                InvalidateRect(state.hud_hwnd, std::ptr::null(), 0);
            }
        }
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let _ = std::fs::write("crash.log", format!("PANIC: {:?}\n", info));
    }));

    let class_name: Vec<u16> = "GlueCommandCenterTrayClass\0".encode_utf16().collect();
    let title: Vec<u16> = "Glue Command Center\0".encode_utf16().collect();

    unsafe {
        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(tray_wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: h_instance,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };

        RegisterClassW(&wc);

        // Hidden message window for tray events
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            title.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if hwnd.is_null() {
            return;
        }

        let hud_hwnd = create_hud_window();
        let adb_path = find_adb();
        let supervisor = Supervisor::new();
        let telemetry = if let Some(adb) = &adb_path {
            query_telemetry(adb)
        } else {
            PhoneTelemetry::default()
        };
        let mut tray = TrayManager::new(hwnd);
        tray.update(&telemetry);

        if let Ok(mut lock) = HUD_STATE.lock() {
            *lock = Some(HudState {
                supervisor: Supervisor::new(),
                telemetry: telemetry.clone(),
                adb: adb_path.clone(),
            });
        }

        if let Ok(mut lock) = STATE.lock() {
            *lock = Some(GlobalState {
                supervisor,
                telemetry,
                adb: adb_path,
                tray: Some(tray),
                hud_hwnd,
            });
        }

        // Background thread for 3-second watchdog and ADB telemetry (never blocks GUI thread!)
        let bg_hwnd_val = hwnd as usize;
        std::thread::spawn(move || {
            let bg_hwnd = bg_hwnd_val as HWND;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(3000));

                let adb_path = {
                    let lock = STATE.lock().ok();
                    lock.and_then(|s| s.as_ref().and_then(|st| st.adb.clone()))
                };

                let adb_path = match adb_path {
                    Some(p) => Some(p),
                    None => find_adb(),
                };

                let new_telemetry = if let Some(adb) = &adb_path {
                    query_telemetry(adb)
                } else {
                    PhoneTelemetry::default()
                };

                if let Ok(mut lock) = STATE.lock() {
                    if let Some(state) = lock.as_mut() {
                        state.supervisor.watchdog_tick();
                        if state.adb.is_none() && adb_path.is_some() {
                            state.adb = adb_path.clone();
                        }
                        state.telemetry = new_telemetry.clone();
                    }
                }

                if let Ok(mut hlock) = HUD_STATE.lock() {
                    if let Some(hstate) = hlock.as_mut() {
                        if hstate.adb.is_none() && adb_path.is_some() {
                            hstate.adb = adb_path;
                        }
                        hstate.telemetry = new_telemetry;
                    }
                }

                PostMessageW(bg_hwnd, WM_TELEMETRY_UPDATED, 0, 0);
            }
        });

        let mut msg: MSG = zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn tray_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_TELEMETRY_UPDATED => {
            if let Ok(mut lock) = STATE.lock() {
                if let Some(state) = lock.as_mut() {
                    if let Some(tray) = state.tray.as_mut() {
                        tray.update(&state.telemetry);
                    }
                    if IsWindowVisible(state.hud_hwnd) != 0 {
                        InvalidateRect(state.hud_hwnd, std::ptr::null(), 0);
                    }
                }
            }
            0
        }
        WM_TRAYICON => {
            let event = (lparam & 0xFFFF) as u32;
            match event {
                WM_LBUTTONUP => {
                    if let Ok(lock) = STATE.lock() {
                        if let Some(state) = lock.as_ref() {
                            toggle_hud(state.hud_hwnd);
                        }
                    }
                }
                WM_RBUTTONUP => {
                    if let Ok(lock) = STATE.lock() {
                        if let Some(state) = lock.as_ref() {
                            show_tray_context_menu(hwnd, &state.supervisor, &state.telemetry);
                        }
                    }
                }
                _ => {}
            }
            0
        }
        WM_COMMAND => {
            let cmd_id = (wparam & 0xFFFF) as usize;
            if let Ok(mut lock) = STATE.lock() {
                if let Some(state) = lock.as_mut() {
                    match cmd_id {
                        IDM_NUDGE => {
                            if let Some(adb) = &state.adb {
                                force_5ghz_nudge(adb);
                            }
                        }
                        IDM_RETRIGGER => {
                            if let Some(adb) = &state.adb {
                                retrigger_tether(adb);
                            }
                        }
                        IDM_RESTART_ALL => {
                            state.supervisor.restart_all_active();
                        }
                        IDM_OPEN_TUNING => {
                            crate::tuning_window::toggle_tuning_window(state.hud_hwnd, state.adb.clone());
                        }
                        IDM_TOGGLE_WIFI => {
                            state.supervisor.toggle_daemon("wifi_sentinel");
                        }
                        IDM_TOGGLE_TETHER => {
                            state.supervisor.toggle_daemon("usb_tether");
                        }
                        IDM_TOGGLE_ENERGY => {
                            state.supervisor.toggle_daemon("energy_daemon");
                        }
                        IDM_TOGGLE_HAPTICS => {
                            state.supervisor.toggle_daemon("audio_haptics");
                        }
                        IDM_TOGGLE_WATCHDOG => {
                            state.supervisor.config.auto_restart_crashed =
                                !state.supervisor.config.auto_restart_crashed;
                            crate::config::save_config(&state.supervisor.config);
                        }
                        IDM_STARTUP => {
                            toggle_startup();
                        }
                        IDM_EXIT => {
                            crate::test_mode_window::close_test_window();
                            crate::tuning_window::close_tuning_window();
                            if let Some(tray) = state.tray.as_mut() {
                                tray.remove();
                            }
                            DestroyWindow(state.hud_hwnd);
                            DestroyWindow(hwnd);
                        }
                        _ => {}
                    }
                }
            }
            0
        }
        WM_DESTROY => {
            crate::test_mode_window::close_test_window();
            crate::tuning_window::close_tuning_window();
            PostQuitMessage(0);
            0
        }
        WM_CLOSE => DefWindowProcW(hwnd, msg, wparam, lparam),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
