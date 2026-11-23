use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;

use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
};

use crate::state::SharedHubState;

const PIO_PROJECT_DIR: &str =
    r"C:\Users\Dillo\OneDrive\Desktop\Github\Website\public\ESP32Codes\PlatformIO\02_Audio_Haptics\esp32c3_ble_mic";
const PIO_PYTHON: &str = r"C:\Users\Dillo\.platformio\penv\Scripts\python.exe";
const PIO_ESPTOOL: &str = r"C:\Users\Dillo\.platformio\packages\tool-esptoolpy\esptool.py";

fn find_com_ports() -> Vec<String> {
    let mut ports = Vec::new();
    let subkey: Vec<u16> = "HARDWARE\\DEVICEMAP\\SERIALCOMM\0"
        .encode_utf16()
        .collect();
    let mut hkey = HKEY::default();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(subkey.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if status != ERROR_SUCCESS {
        return ports;
    }

    let mut idx = 0u32;
    let mut name_buf = [0u16; 256];
    let mut data_buf = [0u8; 256];
    loop {
        let mut name_len = name_buf.len() as u32;
        let mut data_len = data_buf.len() as u32;
        let mut reg_type = 0u32;
        let res = unsafe {
            RegEnumValueW(
                hkey,
                idx,
                windows::core::PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                Some(&mut reg_type),
                Some(data_buf.as_mut_ptr()),
                Some(&mut data_len),
            )
        };
        if res != ERROR_SUCCESS {
            break;
        }
        let val_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
        let wide_len = (data_len as usize) / 2;
        let mut wide = Vec::with_capacity(wide_len);
        for chunk in data_buf[..wide_len * 2].chunks_exact(2) {
            let u = u16::from_le_bytes([chunk[0], chunk[1]]);
            if u == 0 {
                break;
            }
            wide.push(u);
        }
        let com_name = String::from_utf16_lossy(&wide);
        // Prefer USB Serial / USB-JTAG devices
        if val_name.contains("USBSER") || com_name.starts_with("COM") {
            ports.push(com_name);
        }
        idx += 1;
    }
    unsafe {
        let _ = RegCloseKey(hkey);
    }
    ports
}

fn find_espressif_port() -> Option<String> {
    // Check PowerShell PnP for Espressif VID_303A first; fallback to highest USBSER COM port
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_SerialPort | Where-Object { $_.PNPDeviceID -match 'VID_303A' } | Select-Object -ExpandProperty DeviceID",
        ])
        .output()
        .ok();

    if let Some(o) = out {
        let txt = String::from_utf8_lossy(&o.stdout);
        if let Some(line) = txt.lines().map(str::trim).find(|l| l.starts_with("COM")) {
            return Some(line.to_string());
        }
    }

    find_com_ports().into_iter().last()
}

pub fn start_flash_async(state: &SharedHubState) {
    {
        let mut guard = state.lock().unwrap();
        if guard.flash_in_progress {
            return;
        }
        guard.flash_in_progress = true;
        guard.flash_status = "DETECTING ESP32-C3 PORT...".to_string();
    }

    let state_bg = Arc::clone(state);
    std::thread::spawn(move || {
        let port = match find_espressif_port() {
            Some(p) => p,
            None => {
                let mut guard = state_bg.lock().unwrap();
                guard.flash_in_progress = false;
                guard.flash_status = "NO ESP32-C3 COM PORT FOUND".to_string();
                return;
            }
        };

        {
            let mut guard = state_bg.lock().unwrap();
            guard.flash_status = format!("FLASHING {port}...");
        }

        let build_dir = PathBuf::from(PIO_PROJECT_DIR).join(r".pio\build\esp32c3");
        let bootloader = build_dir.join("bootloader.bin");
        let partitions = build_dir.join("partitions.bin");
        let firmware = build_dir.join("firmware.bin");

        let ok = if bootloader.exists()
            && partitions.exists()
            && firmware.exists()
            && PathBuf::from(PIO_PYTHON).exists()
            && PathBuf::from(PIO_ESPTOOL).exists()
        {
            let res = Command::new(PIO_PYTHON)
                .args([
                    PIO_ESPTOOL,
                    "--chip",
                    "esp32c3",
                    "--port",
                    &port,
                    "--baud",
                    "460800",
                    "--before",
                    "default_reset",
                    "--after",
                    "hard_reset",
                    "write_flash",
                    "-z",
                    "--flash_mode",
                    "dio",
                    "--flash_freq",
                    "80m",
                    "--flash_size",
                    "4MB",
                    "0x0000",
                    bootloader.to_str().unwrap_or_default(),
                    "0x8000",
                    partitions.to_str().unwrap_or_default(),
                    "0x10000",
                    firmware.to_str().unwrap_or_default(),
                ])
                .output();
            matches!(res, Ok(o) if o.status.success())
        } else {
            let res = Command::new("pio")
                .args(["run", "-t", "upload", "--upload-port", &port])
                .current_dir(PIO_PROJECT_DIR)
                .output();
            matches!(res, Ok(o) if o.status.success())
        };

        let mut guard = state_bg.lock().unwrap();
        guard.flash_in_progress = false;
        if ok {
            guard.flash_status = format!("FLASH OK ({port}) // UNPLUG & REPLUG IF NEEDED");
        } else {
            guard.flash_status = format!("FLASH FAILED ON {port}");
        }
    });
}
