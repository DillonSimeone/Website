use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub const MAX_CONNECTED: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum MicConnState {
    Available,
    Connecting,
    Streaming,
    Error,
}

pub struct MicLiveMetrics {
    pub rms_bits: AtomicU32,
    pub peak_bits: AtomicU32,
    pub packets: AtomicU32,
    pub drops: AtomicU32,
    pub stop_flag: AtomicBool,
}

impl MicLiveMetrics {
    pub fn new() -> Self {
        Self {
            rms_bits: AtomicU32::new(0),
            peak_bits: AtomicU32::new(0),
            packets: AtomicU32::new(0),
            drops: AtomicU32::new(0),
            stop_flag: AtomicBool::new(false),
        }
    }

    pub fn set_vu(&self, rms: f32, peak: f32) {
        self.rms_bits.store(rms.to_bits(), Ordering::Relaxed);
        self.peak_bits.store(peak.to_bits(), Ordering::Relaxed);
    }

    pub fn get_vu(&self) -> (f32, f32) {
        let rms = f32::from_bits(self.rms_bits.load(Ordering::Relaxed));
        let peak = f32::from_bits(self.peak_bits.load(Ordering::Relaxed));
        (rms, peak)
    }
}

pub struct MicEntry {
    pub bt_addr: u64,
    pub name: String,
    pub rssi_dbm: i16,
    pub last_seen: Instant,
    pub state: MicConnState,
    pub slot: Option<u8>,
    pub metrics: Arc<MicLiveMetrics>,
    pub status_note: String,
}

impl MicEntry {
    pub fn mac_tail(&self) -> [u8; 2] {
        [
            ((self.bt_addr >> 8) & 0xFF) as u8,
            (self.bt_addr & 0xFF) as u8,
        ]
    }

    pub fn mac_suffix(&self) -> String {
        format!("{:02X}{:02X}", (self.bt_addr >> 8) & 0xFF, self.bt_addr & 0xFF)
    }
}

pub struct HubState {
    pub mics: Vec<MicEntry>,
    pub scanning: bool,
    pub window_visible: bool,
    pub flash_in_progress: bool,
    pub flash_status: String,
    pub start_with_windows: bool,
}

impl HubState {
    pub fn new(window_visible: bool, start_with_windows: bool) -> Self {
        Self {
            mics: Vec::new(),
            scanning: false,
            window_visible,
            flash_in_progress: false,
            flash_status: "READY // PLUG ESP32-C3 TO FLASH".to_string(),
            start_with_windows,
        }
    }

    pub fn connected_count(&self) -> usize {
        self.mics
            .iter()
            .filter(|m| matches!(m.state, MicConnState::Connecting | MicConnState::Streaming))
            .count()
    }

    pub fn allocate_slot(&self) -> Option<u8> {
        for slot in 0..(MAX_CONNECTED as u8) {
            let used = self.mics.iter().any(|m| m.slot == Some(slot));
            if !used {
                return Some(slot);
            }
        }
        None
    }
}

pub type SharedHubState = Arc<Mutex<HubState>>;
