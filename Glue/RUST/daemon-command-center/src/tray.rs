use crate::adb::PhoneTelemetry;
use crate::supervisor::Supervisor;
use std::mem::zeroed;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::Foundation::{COLORREF, HWND, POINT};
use windows_sys::Win32::Graphics::Gdi::{
    CreateBitmap, CreateCompatibleBitmap, CreateCompatibleDC, CreatePen, CreateSolidBrush, DeleteDC,
    DeleteObject, Ellipse, GetDC, ReleaseDC, SelectObject, HGDIOBJ, PS_SOLID,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ,
};
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_MODIFY,
    NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreateIconIndirect, CreatePopupMenu, DestroyIcon, DestroyMenu, GetCursorPos,
    SetForegroundWindow, TrackPopupMenu, HICON, ICONINFO, MF_CHECKED, MF_GRAYED, MF_POPUP, MF_SEPARATOR, MF_STRING,
    MF_UNCHECKED, TPM_BOTTOMALIGN, TPM_RIGHTALIGN, TPM_RIGHTBUTTON, WM_APP,
};

unsafe impl Send for TrayManager {}

pub const WM_TRAYICON: u32 = WM_APP + 10;
const TRAY_ICON_ID: u32 = 1;

pub const IDM_NUDGE: usize = 101;
pub const IDM_RETRIGGER: usize = 102;
pub const IDM_RESTART_ALL: usize = 103;
pub const IDM_STARTUP: usize = 104;
pub const IDM_EXIT: usize = 105;
pub const IDM_OPEN_TUNING: usize = 106;

pub const IDM_TOGGLE_WIFI: usize = 201;
pub const IDM_TOGGLE_TETHER: usize = 202;
pub const IDM_TOGGLE_ENERGY: usize = 203;
pub const IDM_TOGGLE_HAPTICS: usize = 204;
pub const IDM_TOGGLE_WATCHDOG: usize = 205;

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0";
const APP_NAME: &str = "GlueCommandCenter\0";

pub struct TrayManager {
    hwnd: HWND,
    current_icon: HICON,
}

impl TrayManager {
    pub fn new(hwnd: HWND) -> Self {
        let initial_icon = create_badge_icon(rgb(255, 82, 82)); // Red initial
        let mut nid = make_nid(hwnd, initial_icon, "Glue Daemon Command Center (Initializing)");

        unsafe {
            Shell_NotifyIconW(NIM_ADD, &mut nid);
        }

        Self {
            hwnd,
            current_icon: initial_icon,
        }
    }

    pub fn update(&mut self, telem: &PhoneTelemetry) {
        let color = if telem.connected {
            if telem.tether_active && telem.is_5ghz {
                rgb(105, 240, 174) // Neon Green: Locked 5GHz & Tethered
            } else {
                rgb(255, 215, 64) // Amber: Warning (2.4GHz or untethered)
            }
        } else {
            rgb(255, 82, 82) // Red: Disconnected
        };

        let tooltip = if telem.connected {
            format!(
                "{}: {} ({}MHz) | Bat: {}% | Tether: {}",
                telem.model,
                if telem.is_5ghz { "5 GHz" } else { "2.4 GHz" },
                telem.wifi_freq_mhz,
                telem.battery_pct,
                if telem.tether_active { "Active" } else { "Idle" }
            )
        } else {
            "Glue Command Center: No Android device detected".to_string()
        };

        let new_icon = create_badge_icon(color);
        let mut nid = make_nid(self.hwnd, new_icon, &tooltip);

        unsafe {
            Shell_NotifyIconW(NIM_MODIFY, &mut nid);
            if self.current_icon != 0 as _ {
                DestroyIcon(self.current_icon);
            }
        }

        self.current_icon = new_icon;
    }

    pub fn remove(&mut self) {
        let mut nid: NOTIFYICONDATAW = unsafe { zeroed() };
        nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        nid.hWnd = self.hwnd;
        nid.uID = TRAY_ICON_ID;

        unsafe {
            Shell_NotifyIconW(NIM_DELETE, &mut nid);
            if self.current_icon != 0 as _ {
                DestroyIcon(self.current_icon);
            }
        }
    }
}

pub fn show_tray_context_menu(hwnd: HWND, supervisor: &Supervisor, telem: &PhoneTelemetry) {
    unsafe {
        let menu = CreatePopupMenu();
        if menu.is_null() {
            return;
        }

        // Title Header
        let status_hdr = if telem.connected {
            format!(
                "{} (🟢 {} | {}%)\0",
                telem.model,
                if telem.is_5ghz { "5GHz" } else { "2.4GHz" },
                telem.battery_pct
            )
        } else {
            "Pixel 6a: 🔴 Disconnected\0".to_string()
        };
        let hdr_u16: Vec<u16> = status_hdr.encode_utf16().collect();
        AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, hdr_u16.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        // Quick Actions
        let nudge_txt: Vec<u16> = "⚡ Force 5GHz Wi-Fi Nudge\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_NUDGE, nudge_txt.as_ptr());

        let tether_txt: Vec<u16> = "🔄 Re-trigger Tether (NCM)\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_RETRIGGER, tether_txt.as_ptr());

        let restart_txt: Vec<u16> = "♻️ Restart Active Daemons\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_RESTART_ALL, restart_txt.as_ptr());

        let tuning_txt: Vec<u16> = "⚡ AudioToSmartphoneHaptics Tuning Panel\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_OPEN_TUNING, tuning_txt.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        // Submenu: Daemon Manager (Toggles)
        let daemons_menu = CreatePopupMenu();
        let statuses = supervisor.get_status_list();

        for d in statuses {
            let check = if d.enabled { MF_CHECKED } else { MF_UNCHECKED };
            let state_str = if d.running {
                format!("{} (🟢 Running)\0", d.title)
            } else {
                format!("{} (⚪ Stopped)\0", d.title)
            };
            let u16_title: Vec<u16> = state_str.encode_utf16().collect();

            let cmd_id = match d.id {
                "wifi_sentinel" => IDM_TOGGLE_WIFI,
                "usb_tether" => IDM_TOGGLE_TETHER,
                "energy_daemon" => IDM_TOGGLE_ENERGY,
                "audio_haptics" => IDM_TOGGLE_HAPTICS,
                _ => 0,
            };
            if cmd_id != 0 {
                AppendMenuW(daemons_menu, MF_STRING | check, cmd_id, u16_title.as_ptr());
            }
        }

        AppendMenuW(daemons_menu, MF_SEPARATOR, 0, std::ptr::null());
        let watchdog_check = if supervisor.config.auto_restart_crashed {
            MF_CHECKED
        } else {
            MF_UNCHECKED
        };
        let wd_txt: Vec<u16> = "Auto-Revive Crashed Daemons\0".encode_utf16().collect();
        AppendMenuW(daemons_menu, MF_STRING | watchdog_check, IDM_TOGGLE_WATCHDOG, wd_txt.as_ptr());

        let daemons_title: Vec<u16> = "⚙️ Manage Daemons & Toggles\0".encode_utf16().collect();
        AppendMenuW(menu, MF_POPUP, daemons_menu as usize, daemons_title.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        // Startup & Exit
        let startup_check = if is_startup_enabled() { MF_CHECKED } else { MF_UNCHECKED };
        let startup_txt: Vec<u16> = "Run on Windows Startup\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING | startup_check, IDM_STARTUP, startup_txt.as_ptr());

        let exit_txt: Vec<u16> = "❌ Exit Command Center\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_EXIT, exit_txt.as_ptr());

        let mut pt: POINT = zeroed();
        GetCursorPos(&mut pt);
        SetForegroundWindow(hwnd);
        TrackPopupMenu(
            menu,
            TPM_RIGHTBUTTON | TPM_BOTTOMALIGN | TPM_RIGHTALIGN,
            pt.x,
            pt.y,
            0,
            hwnd,
            std::ptr::null(),
        );
        DestroyMenu(menu);
    }
}

fn make_nid(hwnd: HWND, hicon: HICON, tip: &str) -> NOTIFYICONDATAW {
    let mut nid: NOTIFYICONDATAW = unsafe { zeroed() };
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = TRAY_ICON_ID;
    nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid.uCallbackMessage = WM_TRAYICON;
    nid.hIcon = hicon;

    let tip_u16: Vec<u16> = tip.encode_utf16().take(127).collect();
    for (i, &ch) in tip_u16.iter().enumerate() {
        nid.szTip[i] = ch;
    }
    nid
}

fn create_badge_icon(badge_color: COLORREF) -> HICON {
    unsafe {
        let hdc = GetDC(std::ptr::null_mut());
        let mem_dc = CreateCompatibleDC(hdc);

        let size = 16;
        let h_bmp = CreateCompatibleBitmap(hdc, size, size);
        let h_mask = CreateBitmap(size, size, 1, 1, std::ptr::null());

        let old_bmp = SelectObject(mem_dc, h_bmp as HGDIOBJ);

        // Dark background circle
        let bg_brush = CreateSolidBrush(rgb(26, 26, 32));
        let bg_pen = CreatePen(PS_SOLID as i32, 1, rgb(45, 45, 55));
        let old_brush = SelectObject(mem_dc, bg_brush as HGDIOBJ);
        let old_pen = SelectObject(mem_dc, bg_pen as HGDIOBJ);
        Ellipse(mem_dc, 0, 0, size, size);

        // Colored status dot in center
        let dot_brush = CreateSolidBrush(badge_color);
        let dot_pen = CreatePen(PS_SOLID as i32, 1, badge_color);
        SelectObject(mem_dc, dot_brush as HGDIOBJ);
        SelectObject(mem_dc, dot_pen as HGDIOBJ);
        Ellipse(mem_dc, 3, 3, size - 3, size - 3);

        SelectObject(mem_dc, old_brush);
        SelectObject(mem_dc, old_pen);
        SelectObject(mem_dc, old_bmp);

        DeleteObject(bg_brush as HGDIOBJ);
        DeleteObject(bg_pen as HGDIOBJ);
        DeleteObject(dot_brush as HGDIOBJ);
        DeleteObject(dot_pen as HGDIOBJ);
        DeleteDC(mem_dc);
        ReleaseDC(std::ptr::null_mut(), hdc);

        let mut ii: ICONINFO = zeroed();
        ii.fIcon = 1;
        ii.hbmColor = h_bmp;
        ii.hbmMask = h_mask;

        let icon = CreateIconIndirect(&ii);

        DeleteObject(h_bmp as HGDIOBJ);
        DeleteObject(h_mask as HGDIOBJ);

        icon
    }
}

pub fn is_startup_enabled() -> bool {
    let subkey: Vec<u16> = RUN_KEY.encode_utf16().collect();
    let name: Vec<u16> = APP_NAME.encode_utf16().collect();
    let mut hkey: HKEY = std::ptr::null_mut();

    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
            let mut val_type: u32 = 0;
            let mut data_len: u32 = 0;
            let res = RegQueryValueExW(
                hkey,
                name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                std::ptr::null_mut(),
                &mut data_len,
            );
            RegCloseKey(hkey);
            res == 0
        } else {
            false
        }
    }
}

pub fn toggle_startup() -> bool {
    let currently_enabled = is_startup_enabled();
    let subkey: Vec<u16> = RUN_KEY.encode_utf16().collect();
    let name: Vec<u16> = APP_NAME.encode_utf16().collect();
    let mut hkey: HKEY = std::ptr::null_mut();

    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_WRITE, &mut hkey) == 0 {
            if currently_enabled {
                RegDeleteValueW(hkey, name.as_ptr());
                RegCloseKey(hkey);
                false
            } else {
                if let Ok(exe_path) = std::env::current_exe() {
                    let mut path_u16: Vec<u16> = exe_path.as_os_str().encode_wide().collect();
                    path_u16.push(0);
                    let byte_len = (path_u16.len() * std::mem::size_of::<u16>()) as u32;
                    RegSetValueExW(
                        hkey,
                        name.as_ptr(),
                        0,
                        REG_SZ,
                        path_u16.as_ptr() as *const u8,
                        byte_len,
                    );
                }
                RegCloseKey(hkey);
                true
            }
        } else {
            false
        }
    }
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
