use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use windows::core::{GUID, HSTRING};
use windows::Devices::Bluetooth::Advertisement::{
    BluetoothLEAdvertisementReceivedEventArgs, BluetoothLEAdvertisementWatcher,
    BluetoothLEScanningMode,
};
use windows::Devices::Bluetooth::GenericAttributeProfile::{
    GattClientCharacteristicConfigurationDescriptorValue, GattCommunicationStatus, GattSession,
    GattValueChangedEventArgs,
};
use windows::Devices::Bluetooth::{BluetoothCacheMode, BluetoothLEDevice};
use windows::Foundation::TypedEventHandler;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

use crate::adpcm::{compute_vu, decode_packet_payload, SAMPLES_PER_PKT};
use crate::ipc::IpcSender;
use crate::state::{MicConnState, MicEntry, MicLiveMetrics, SharedHubState, MAX_CONNECTED};

// Custom GATT UUIDs matching esp32c3_ble_mic firmware
const SERVICE_GUID: GUID = GUID::from_u128(0x12345678_1234_5678_1234_56789abcdef0);
const AUDIO_CHAR_GUID: GUID = GUID::from_u128(0x12345678_1234_5678_1234_56789abcdef1);

pub struct BleScanner {
    watcher: BluetoothLEAdvertisementWatcher,
    _token: i64,
}

impl BleScanner {
    pub fn new(state: SharedHubState) -> windows::core::Result<Self> {
        let watcher = BluetoothLEAdvertisementWatcher::new()?;
        watcher.SetScanningMode(BluetoothLEScanningMode::Active)?;

        let handler = TypedEventHandler::<
            BluetoothLEAdvertisementWatcher,
            BluetoothLEAdvertisementReceivedEventArgs,
        >::new(move |_sender, args| {
            let Some(args) = args.as_ref() else {
                return Ok(());
            };
            let adv = args.Advertisement()?;
            let name = adv.LocalName()?.to_string();
            if !name.starts_with("C3-BLE-MIC") {
                return Ok(());
            }

            let bt_addr = args.BluetoothAddress()?;
            let rssi = args.RawSignalStrengthInDBm()?;
            let now = Instant::now();

            let mut guard = state.lock().unwrap();
            if let Some(existing) = guard.mics.iter_mut().find(|m| m.bt_addr == bt_addr) {
                existing.rssi_dbm = rssi;
                existing.last_seen = now;
                if !name.is_empty() {
                    existing.name = name;
                }
            } else {
                guard.mics.push(MicEntry {
                    bt_addr,
                    name,
                    rssi_dbm: rssi,
                    last_seen: now,
                    state: MicConnState::Available,
                    slot: None,
                    metrics: Arc::new(MicLiveMetrics::new()),
                    status_note: "READY".to_string(),
                });
                // Sort by strongest RSSI first
                guard.mics.sort_by(|a, b| b.rssi_dbm.cmp(&a.rssi_dbm));
            }
            Ok(())
        });

        let token = watcher.Received(&handler)?;
        Ok(Self {
            watcher,
            _token: token.Value,
        })
    }

    pub fn start(&self) {
        let _ = self.watcher.Start();
    }

    pub fn stop(&self) {
        let _ = self.watcher.Stop();
    }
}

pub fn toggle_mic_connection(state: &SharedHubState, bt_addr: u64) {
    let action = {
        let mut guard = state.lock().unwrap();
        let connected = guard.connected_count();
        let alloc_slot = guard.allocate_slot();
        let Some(mic) = guard.mics.iter_mut().find(|m| m.bt_addr == bt_addr) else {
            return;
        };

        match mic.state {
            MicConnState::Connecting | MicConnState::Streaming => {
                mic.metrics.stop_flag.store(true, Ordering::Release);
                mic.state = MicConnState::Available;
                mic.slot = None;
                mic.metrics.set_vu(0.0, 0.0);
                mic.status_note = "DISCONNECTED".to_string();
                None
            }
            MicConnState::Available | MicConnState::Error => {
                if connected >= MAX_CONNECTED {
                    mic.status_note = format!("MAX {MAX_CONNECTED} CONNECTED");
                    return;
                }
                let Some(slot) = alloc_slot else {
                    return;
                };
                mic.metrics.stop_flag.store(false, Ordering::Release);
                mic.metrics.packets.store(0, Ordering::Relaxed);
                mic.metrics.drops.store(0, Ordering::Relaxed);
                mic.metrics.set_vu(0.0, 0.0);
                mic.state = MicConnState::Connecting;
                mic.slot = Some(slot);
                mic.status_note = "CONNECTING...".to_string();
                Some((slot, mic.mac_tail(), Arc::clone(&mic.metrics)))
            }
        }
    };

    if let Some((slot, mac_tail, metrics)) = action {
        let state_bg = Arc::clone(state);
        std::thread::spawn(move || {
            run_mic_worker(state_bg, bt_addr, slot, mac_tail, metrics);
        });
    }
}

fn set_mic_error(state: &SharedHubState, bt_addr: u64, msg: &str) {
    let mut guard = state.lock().unwrap();
    if let Some(mic) = guard.mics.iter_mut().find(|m| m.bt_addr == bt_addr) {
        if !mic.metrics.stop_flag.load(Ordering::Acquire) {
            mic.state = MicConnState::Error;
            mic.slot = None;
            mic.metrics.set_vu(0.0, 0.0);
            mic.status_note = msg.to_string();
        }
    }
}

fn run_mic_worker(
    state: SharedHubState,
    bt_addr: u64,
    slot: u8,
    mac_tail: [u8; 2],
    metrics: Arc<MicLiveMetrics>,
) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let res = run_mic_session(&state, bt_addr, slot, mac_tail, &metrics);
    if let Err(err) = res {
        set_mic_error(&state, bt_addr, &format!("ERR: {}", err.code().0));
    }

    unsafe {
        CoUninitialize();
    }
}

fn run_mic_session(
    state: &SharedHubState,
    bt_addr: u64,
    slot: u8,
    mac_tail: [u8; 2],
    metrics: &Arc<MicLiveMetrics>,
) -> windows::core::Result<()> {
    let device = match BluetoothLEDevice::FromBluetoothAddressAsync(bt_addr) {
        Ok(op) => match op.get() {
            Ok(d) => d,
            Err(e) => {
                set_mic_error(state, bt_addr, &format!("CONN 0x{:08X}", e.code().0 as u32));
                return Ok(());
            }
        },
        Err(e) => {
            set_mic_error(state, bt_addr, &format!("ADDR 0x{:08X}", e.code().0 as u32));
            return Ok(());
        }
    };
    if metrics.stop_flag.load(Ordering::Acquire) {
        return Ok(());
    }

    // Keep BLE link alive via GattSession
    let _gatt_session = match device.BluetoothDeviceId() {
        Ok(dev_id) => match GattSession::FromDeviceIdAsync(&dev_id) {
            Ok(op) => match op.get() {
                Ok(sess) => {
                    let _ = sess.SetMaintainConnection(true);
                    Some(sess)
                }
                Err(_) => None,
            },
            Err(_) => None,
        },
        Err(_) => None,
    };

    // Retry GATT service discovery up to 3 times (WinRT BLE can return transient Unreachable/0x80070016)
    let mut svc_res = None;
    let mut last_err = 0u32;
    for attempt in 0..3 {
        if metrics.stop_flag.load(Ordering::Acquire) {
            return Ok(());
        }
        let cache_mode = if attempt == 0 {
            BluetoothCacheMode::Uncached
        } else {
            BluetoothCacheMode::Cached
        };
        match device.GetGattServicesForUuidWithCacheModeAsync(SERVICE_GUID, cache_mode) {
            Ok(op) => match op.get() {
                Ok(r) => {
                    if r.Status().ok() == Some(GattCommunicationStatus::Success) {
                        svc_res = Some(r);
                        break;
                    }
                }
                Err(e) => {
                    last_err = e.code().0 as u32;
                }
            },
            Err(e) => {
                last_err = e.code().0 as u32;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    let Some(svc_res) = svc_res else {
        set_mic_error(state, bt_addr, &format!("SVC 0x{:08X}", last_err));
        return Ok(());
    };
    let services = svc_res.Services()?;
    if services.Size()? == 0 {
        set_mic_error(state, bt_addr, "NO AUDIO SERVICE");
        return Ok(());
    }
    let service = services.GetAt(0)?;

    let chr_res = match service.GetCharacteristicsForUuidWithCacheModeAsync(
        AUDIO_CHAR_GUID,
        BluetoothCacheMode::Uncached,
    ) {
        Ok(op) => match op.get() {
            Ok(r) => r,
            Err(e) => {
                set_mic_error(state, bt_addr, &format!("CHR_GET 0x{:08X}", e.code().0 as u32));
                return Ok(());
            }
        },
        Err(e) => {
            set_mic_error(state, bt_addr, &format!("CHR_OP 0x{:08X}", e.code().0 as u32));
            return Ok(());
        }
    };
    if chr_res.Status()? != GattCommunicationStatus::Success {
        set_mic_error(state, bt_addr, "CHAR NOT FOUND");
        return Ok(());
    }
    let chars = chr_res.Characteristics()?;
    if chars.Size()? == 0 {
        set_mic_error(state, bt_addr, "NO AUDIO CHAR");
        return Ok(());
    }
    let audio_char = chars.GetAt(0)?;

    let ipc = Arc::new(Mutex::new(
        IpcSender::new().map_err(|_| windows::core::Error::from_win32())?,
    ));
    let expected_seq = Arc::new(Mutex::new(None::<u16>));
    let metrics_cb = Arc::clone(metrics);
    let ipc_cb = Arc::clone(&ipc);
    let seq_cb = Arc::clone(&expected_seq);

    let handler = TypedEventHandler::<
        windows::Devices::Bluetooth::GenericAttributeProfile::GattCharacteristic,
        GattValueChangedEventArgs,
    >::new(move |_sender, args| {
        if metrics_cb.stop_flag.load(Ordering::Acquire) {
            return Ok(());
        }
        let Some(args) = args.as_ref() else {
            return Ok(());
        };
        let buf = args.CharacteristicValue()?;
        let len = buf.Length()? as usize;
        if !(6..=256).contains(&len) {
            return Ok(());
        }

        let reader = DataReader::FromBuffer(&buf)?;
        let mut raw_pkt = [0u8; 256];
        reader.ReadBytes(&mut raw_pkt[..len])?;

        let seq = u16::from_le_bytes([raw_pkt[0], raw_pkt[1]]);
        {
            let mut exp = seq_cb.lock().unwrap();
            if let Some(prev_exp) = *exp {
                let diff = seq.wrapping_sub(prev_exp);
                if diff > 0 && diff < 1000 {
                    metrics_cb.drops.fetch_add(diff as u32, Ordering::Relaxed);
                }
            }
            *exp = Some(seq.wrapping_add(1));
        }

        let mut pcm = [0i16; SAMPLES_PER_PKT];
        let decoded = decode_packet_payload(&raw_pkt[2..len], &mut pcm);
        if decoded > 0 {
            let (rms, peak) = compute_vu(&pcm[..decoded]);
            metrics_cb.set_vu(rms, peak);
            metrics_cb.packets.fetch_add(1, Ordering::Relaxed);

            if let Ok(mut sender) = ipc_cb.lock() {
                sender.send_frame(slot, mac_tail, seq, &pcm[..decoded]);
            }
        }
        Ok(())
    });

    let token = audio_char.ValueChanged(&handler)?;
    let cccd_res = match audio_char.WriteClientCharacteristicConfigurationDescriptorWithResultAsync(
        GattClientCharacteristicConfigurationDescriptorValue::Notify,
    ) {
        Ok(op) => match op.get() {
            Ok(r) => r,
            Err(e) => {
                let _ = audio_char.RemoveValueChanged(token);
                set_mic_error(state, bt_addr, &format!("CCCD_GET 0x{:08X}", e.code().0 as u32));
                return Ok(());
            }
        },
        Err(e) => {
            let _ = audio_char.RemoveValueChanged(token);
            set_mic_error(state, bt_addr, &format!("CCCD_OP 0x{:08X}", e.code().0 as u32));
            return Ok(());
        }
    };

    if cccd_res.Status()? != GattCommunicationStatus::Success {
        let _ = audio_char.RemoveValueChanged(token);
        set_mic_error(state, bt_addr, "NOTIFY FAILED");
        return Ok(());
    }

    {
        let mut guard = state.lock().unwrap();
        if let Some(mic) = guard.mics.iter_mut().find(|m| m.bt_addr == bt_addr) {
            if !metrics.stop_flag.load(Ordering::Acquire) {
                mic.state = MicConnState::Streaming;
                mic.status_note = format!("STREAMING // CH {}", slot + 1);
            }
        }
    }

    // Keep session alive until user disconnects
    while !metrics.stop_flag.load(Ordering::Acquire) {
        std::thread::sleep(std::time::Duration::from_millis(80));
    }

    let _ = audio_char.RemoveValueChanged(token);
    let _ = audio_char.WriteClientCharacteristicConfigurationDescriptorAsync(
        GattClientCharacteristicConfigurationDescriptorValue::None,
    );
    let _ = service.Close();
    let _ = device.Close();
    let _ = HSTRING::new();
    Ok(())
}
