use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{GetStockObject, DEFAULT_GUI_FONT};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
    RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    GetCursorPos, GetWindowTextW, RegisterClassW, SendMessageW, SetForegroundWindow, ShowWindow,
    TrackPopupMenu, CW_USEDEFAULT, HMENU, MF_CHECKED, MF_POPUP, MF_SEPARATOR, MF_STRING,
    MF_UNCHECKED, SW_SHOW, TPM_BOTTOMALIGN, TPM_RIGHTBUTTON, WM_CLOSE, WM_COMMAND, WM_CREATE,
    WM_SETFONT, WNDCLASSW, WS_BORDER, WS_CAPTION, WS_CHILD, WS_OVERLAPPED, WS_SYSMENU, WS_TABSTOP,
    WS_VISIBLE,
};

pub const IDM_TASKMGR: usize = 101;
pub const IDM_STARTUP: usize = 102;
pub const IDM_EXIT: usize = 103;
pub const IDM_TOGGLE_ECO: usize = 104;

pub const IDM_RATE_12: usize = 201;
pub const IDM_RATE_16: usize = 202;
pub const IDM_RATE_20: usize = 203;
pub const IDM_RATE_28: usize = 204;
pub const IDM_RATE_36: usize = 205;
pub const IDM_RATE_CUSTOM: usize = 206;

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0";
const APP_NAME: &str = "TaskbarSentinel\0";
const SETTINGS_KEY: &str = "Software\\TaskbarSentinel\0";

const IDC_RATE_EDIT: usize = 301;
const IDC_RATE_OK: usize = 302;
static mut EDIT_HWND: HWND = std::ptr::null_mut();

pub fn get_kwh_rate() -> f32 {
    let subkey: Vec<u16> = SETTINGS_KEY.encode_utf16().collect();
    let val_name: Vec<u16> = "KwhRate\0".encode_utf16().collect();
    let mut hkey: HKEY = std::ptr::null_mut();

    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
            let mut val_type: u32 = 0;
            let mut buf = [0u8; 64];
            let mut data_len = buf.len() as u32;
            let res = RegQueryValueExW(
                hkey,
                val_name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                buf.as_mut_ptr(),
                &mut data_len,
            );
            RegCloseKey(hkey);
            if res == 0 && val_type == REG_SZ {
                let s = String::from_utf8_lossy(&buf[..data_len as usize]);
                let trimmed = s.trim_matches(char::from(0)).trim();
                if let Ok(rate) = trimmed.parse::<f32>() {
                    if rate > 0.0 && rate < 10.0 {
                        return rate;
                    }
                }
            }
        }
    }
    0.18 // Default 18 cents/kWh
}

pub fn set_kwh_rate(rate: f32) {
    let subkey: Vec<u16> = SETTINGS_KEY.encode_utf16().collect();
    let val_name: Vec<u16> = "KwhRate\0".encode_utf16().collect();
    let mut hkey: HKEY = std::ptr::null_mut();

    unsafe {
        if RegCreateKeyW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            &mut hkey,
        ) == 0
        {
            let val_str = format!("{:.3}\0", rate);
            let bytes = val_str.as_bytes();
            RegSetValueExW(
                hkey,
                val_name.as_ptr(),
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            );
            RegCloseKey(hkey);
        }
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

unsafe extern "system" fn rate_dlg_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CREATE => {
            let font = GetStockObject(DEFAULT_GUI_FONT);
            let h_inst = GetModuleHandleW(std::ptr::null());

            let lbl_cls: Vec<u16> = "STATIC\0".encode_utf16().collect();
            let lbl_txt: Vec<u16> = "Electricity rate ($/kWh):\0".encode_utf16().collect();
            let lbl = CreateWindowExW(
                0,
                lbl_cls.as_ptr(),
                lbl_txt.as_ptr(),
                WS_CHILD | WS_VISIBLE,
                14,
                16,
                180,
                20,
                hwnd,
                std::ptr::null_mut(),
                h_inst,
                std::ptr::null(),
            );
            SendMessageW(lbl, WM_SETFONT, font as WPARAM, 1);

            let edit_cls: Vec<u16> = "EDIT\0".encode_utf16().collect();
            let curr_txt: Vec<u16> = format!("{:.2}\0", get_kwh_rate()).encode_utf16().collect();
            let edit = CreateWindowExW(
                0,
                edit_cls.as_ptr(),
                curr_txt.as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_BORDER | WS_TABSTOP,
                14,
                40,
                120,
                24,
                hwnd,
                IDC_RATE_EDIT as HMENU,
                h_inst,
                std::ptr::null(),
            );
            SendMessageW(edit, WM_SETFONT, font as WPARAM, 1);
            EDIT_HWND = edit;

            let btn_cls: Vec<u16> = "BUTTON\0".encode_utf16().collect();
            let btn_txt: Vec<u16> = "Save\0".encode_utf16().collect();
            let btn = CreateWindowExW(
                0,
                btn_cls.as_ptr(),
                btn_txt.as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP,
                144,
                40,
                70,
                24,
                hwnd,
                IDC_RATE_OK as HMENU,
                h_inst,
                std::ptr::null(),
            );
            SendMessageW(btn, WM_SETFONT, font as WPARAM, 1);
            0
        }
        WM_COMMAND => {
            let id = wparam & 0xFFFF;
            if id == IDC_RATE_OK {
                if !EDIT_HWND.is_null() {
                    let mut buf = [0u16; 32];
                    let len = GetWindowTextW(EDIT_HWND, buf.as_mut_ptr(), buf.len() as i32);
                    if len > 0 {
                        let s = String::from_utf16_lossy(&buf[..len as usize]);
                        if let Ok(val) = s.trim().parse::<f32>() {
                            if val > 0.0 && val < 10.0 {
                                set_kwh_rate(val);
                            }
                        }
                    }
                }
                DestroyWindow(hwnd);
                return 0;
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_CLOSE => {
            DestroyWindow(hwnd);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

pub fn prompt_custom_rate() {
    unsafe {
        let cls_name: Vec<u16> = "TaskbarSentinelRateDlg\0".encode_utf16().collect();
        let title: Vec<u16> = "Set Electricity Rate\0".encode_utf16().collect();
        let h_inst = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(rate_dlg_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: h_inst,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: (5 + 1) as _,
            lpszMenuName: std::ptr::null(),
            lpszClassName: cls_name.as_ptr(),
        };
        RegisterClassW(&wc);

        let hwnd = CreateWindowExW(
            0,
            cls_name.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            245,
            115,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_inst,
            std::ptr::null(),
        );
        if !hwnd.is_null() {
            ShowWindow(hwnd, SW_SHOW);
            SetForegroundWindow(hwnd);
        }
    }
}

pub fn show_context_menu(hwnd: HWND) {
    unsafe {
        let menu = CreatePopupMenu();
        if menu.is_null() {
            return;
        }

        let taskmgr_txt: Vec<u16> = "Open Task Manager\t(Left-Click)\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_TASKMGR, taskmgr_txt.as_ptr());

        let eco_active = crate::eco::is_eco_active();
        let eco_flag = if eco_active { MF_CHECKED } else { MF_UNCHECKED };
        let eco_txt: Vec<u16> = if eco_active {
            "⚡ Ultra Eco Mode (ACTIVE - Max Battery)\0"
        } else {
            "⚡ Ultra Eco Mode (OFF - Full Clocks)\0"
        }
        .encode_utf16()
        .collect();
        AppendMenuW(menu, MF_STRING | eco_flag, IDM_TOGGLE_ECO, eco_txt.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        // Submenu: Electricity Cost Rate
        let rate_menu = CreatePopupMenu();
        let curr_rate = get_kwh_rate();

        let check_rate = |target: f32| -> u32 {
            if (curr_rate - target).abs() < 0.015 {
                MF_CHECKED
            } else {
                MF_UNCHECKED
            }
        };

        let r12_txt: Vec<u16> = "$0.12 / kWh (Low / Hydro)\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING | check_rate(0.12), IDM_RATE_12, r12_txt.as_ptr());

        let r16_txt: Vec<u16> = "$0.16 / kWh (US Average)\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING | check_rate(0.16), IDM_RATE_16, r16_txt.as_ptr());

        let r20_txt: Vec<u16> = "$0.20 / kWh (Standard)\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING | check_rate(0.20), IDM_RATE_20, r20_txt.as_ptr());

        let r28_txt: Vec<u16> = "$0.28 / kWh (High / CA)\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING | check_rate(0.28), IDM_RATE_28, r28_txt.as_ptr());

        let r36_txt: Vec<u16> = "$0.36 / kWh (Peak Tier)\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING | check_rate(0.36), IDM_RATE_36, r36_txt.as_ptr());

        AppendMenuW(rate_menu, MF_SEPARATOR, 0, std::ptr::null());

        let r_custom_txt: Vec<u16> = "Custom Rate (Input Box)...\0".encode_utf16().collect();
        AppendMenuW(rate_menu, MF_STRING, IDM_RATE_CUSTOM, r_custom_txt.as_ptr());

        let rate_title: Vec<u16> = format!("⚡ Electricity Rate (${:.2}/kWh)\0", curr_rate).encode_utf16().collect();
        AppendMenuW(menu, MF_POPUP, rate_menu as usize, rate_title.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        let startup_flag = if is_startup_enabled() {
            MF_CHECKED
        } else {
            MF_UNCHECKED
        };
        let startup_txt: Vec<u16> = "Run on Startup\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING | startup_flag, IDM_STARTUP, startup_txt.as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        let exit_txt: Vec<u16> = "Exit Sentinel\0".encode_utf16().collect();
        AppendMenuW(menu, MF_STRING, IDM_EXIT, exit_txt.as_ptr());

        let mut pt = std::mem::zeroed();
        GetCursorPos(&mut pt);
        SetForegroundWindow(hwnd);
        TrackPopupMenu(
            menu,
            TPM_RIGHTBUTTON | TPM_BOTTOMALIGN,
            pt.x,
            pt.y,
            0,
            hwnd,
            std::ptr::null(),
        );
        DestroyMenu(menu);
    }
}
