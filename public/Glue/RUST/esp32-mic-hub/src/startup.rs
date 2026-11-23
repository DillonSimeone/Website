use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ,
};

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME: &str = "Esp32MicHub";

pub fn is_startup_enabled() -> bool {
    let key_w: Vec<u16> = format!("{RUN_KEY}\0").encode_utf16().collect();
    let val_w: Vec<u16> = format!("{VALUE_NAME}\0").encode_utf16().collect();
    let mut hkey = HKEY::default();
    let res = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_w.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if res != ERROR_SUCCESS {
        return false;
    }
    let q = unsafe { RegQueryValueExW(hkey, PCWSTR(val_w.as_ptr()), None, None, None, None) };
    unsafe {
        let _ = RegCloseKey(hkey);
    }
    q == ERROR_SUCCESS
}

pub fn set_startup_enabled(enable: bool) -> bool {
    let key_w: Vec<u16> = format!("{RUN_KEY}\0").encode_utf16().collect();
    let val_w: Vec<u16> = format!("{VALUE_NAME}\0").encode_utf16().collect();
    let mut hkey = HKEY::default();
    let res = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_w.as_ptr()),
            0,
            KEY_WRITE,
            &mut hkey,
        )
    };
    if res != ERROR_SUCCESS {
        return false;
    }

    let ok = if enable {
        let exe = std::env::current_exe()
            .map(|p| format!("\"{}\" --minimized", p.display()))
            .unwrap_or_default();
        if exe.is_empty() {
            false
        } else {
            let mut data_w: Vec<u16> = exe.encode_utf16().collect();
            data_w.push(0);
            let bytes = unsafe {
                std::slice::from_raw_parts(data_w.as_ptr() as *const u8, data_w.len() * 2)
            };
            unsafe {
                RegSetValueExW(hkey, PCWSTR(val_w.as_ptr()), 0, REG_SZ, Some(bytes))
                    == ERROR_SUCCESS
            }
        }
    } else {
        unsafe { RegDeleteValueW(hkey, PCWSTR(val_w.as_ptr())) == ERROR_SUCCESS }
    };

    unsafe {
        let _ = RegCloseKey(hkey);
    }
    ok
}
