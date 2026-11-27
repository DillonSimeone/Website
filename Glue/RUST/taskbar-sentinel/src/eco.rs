use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

const CREATE_NO_WINDOW: u32 = 0x08000000;

// Windows Power Management Setting GUIDs
const GUID_PROCTHROTTLEMAX: &str = "bc5038f7-23e0-4960-96da-33abaf5935ec";
const GUID_TURBO_BOOST: &str = "be337238-0d82-4146-a960-4f3749d470c7";
const GUID_EPP: &str = "36687f9e-e3a5-4dbf-b1dc-15eb381c6863";

static ECO_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn init_eco_state() {
    let output = Command::new("powercfg")
        .args(&["/query", "SCHEME_CURRENT", "SUB_PROCESSOR", GUID_PROCTHROTTLEMAX])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if line.contains("Current AC Power Setting Index") || line.contains("Current DC Power Setting Index") {
                if let Some(hex_str) = line.split("0x").nth(1) {
                    let hex_str = hex_str.trim();
                    if let Ok(val) = u32::from_str_radix(hex_str, 16) {
                        // If throttle is capped at or below 55%, Eco is active
                        if val <= 55 {
                            ECO_ACTIVE.store(true, Ordering::Relaxed);
                            return;
                        }
                    }
                }
            }
        }
    }
    ECO_ACTIVE.store(false, Ordering::Relaxed);
}

pub fn is_eco_active() -> bool {
    ECO_ACTIVE.load(Ordering::Relaxed)
}

pub fn toggle_eco_mode() -> bool {
    let current = is_eco_active();
    set_eco_mode(!current)
}

pub fn set_eco_mode(enable: bool) -> bool {
    ECO_ACTIVE.store(enable, Ordering::Relaxed);

    if enable {
        // --- AGGRESSIVE ECO MODE ---
        // 1. Throttle CPU to 45% (downclock to base/minimum Vcore frequencies)
        // 2. Disable Turbo Boost completely (boost mode = 0)
        // 3. Set Energy Performance Preference (EPP) to 100 (Maximum Power Saver for Speed Shift)
        set_power_setting(GUID_PROCTHROTTLEMAX, "45");
        set_power_setting(GUID_TURBO_BOOST, "0");
        set_power_setting(GUID_EPP, "100");
    } else {
        // --- NORMAL / PERFORMANCE MODE ---
        // 1. Restore 100% clock speeds
        // 2. Enable Turbo Boost (boost mode = 2, Aggressive)
        // 3. Restore Energy Performance Preference to Balanced (38)
        set_power_setting(GUID_PROCTHROTTLEMAX, "100");
        set_power_setting(GUID_TURBO_BOOST, "2");
        set_power_setting(GUID_EPP, "38");
    }

    let _ = Command::new("powercfg")
        .args(&["/setactive", "SCHEME_CURRENT"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    enable
}

fn set_power_setting(setting_guid: &str, value: &str) {
    let _ = Command::new("powercfg")
        .args(&["/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", setting_guid, value])
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    let _ = Command::new("powercfg")
        .args(&["/setdcvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", setting_guid, value])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}
