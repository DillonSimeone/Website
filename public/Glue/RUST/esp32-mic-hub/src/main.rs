#![windows_subsystem = "windows"]

mod adpcm;
mod ble;
mod flasher;
mod ipc;
mod startup;
mod state;
mod ui;

use std::net::UdpSocket;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use windows::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED,
};
use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};

use crate::ble::{toggle_mic_connection, BleScanner};
use crate::ipc::IPC_PORT;
use crate::startup::is_startup_enabled;
use crate::state::{HubState, MicConnState, SharedHubState};

fn run_cli_test(state: SharedHubState) -> i32 {
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
    println!("[CLI-TEST] Starting BLE scanner for C3-BLE-MIC...");

    let scanner = match BleScanner::new(Arc::clone(&state)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[CLI-TEST] BleScanner::new failed: {e:?}");
            return 1;
        }
    };
    scanner.start();

    let mut target_addr = None;
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(12) {
        {
            let guard = state.lock().unwrap();
            if let Some(m) = guard.mics.first() {
                println!(
                    "[CLI-TEST] Found {} [{}] RSSI={} dBm",
                    m.name,
                    m.mac_suffix(),
                    m.rssi_dbm
                );
                target_addr = Some(m.bt_addr);
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    let Some(bt_addr) = target_addr else {
        eprintln!("[CLI-TEST] Timed out waiting for C3-BLE-MIC.");
        scanner.stop();
        return 1;
    };

    // Bind local UDP receiver on 127.0.0.1:47100 to verify IPC audio stream
    let udp_sock = match UdpSocket::bind(("127.0.0.1", IPC_PORT)) {
        Ok(s) => {
            let _ = s.set_read_timeout(Some(Duration::from_millis(100)));
            s
        }
        Err(e) => {
            eprintln!("[CLI-TEST] Could not bind UDP :{IPC_PORT}: {e}");
            scanner.stop();
            return 1;
        }
    };

    println!("[CLI-TEST] Connecting to mic...");
    toggle_mic_connection(&state, bt_addr);

    let t_conn = Instant::now();
    let mut streaming = false;
    while t_conn.elapsed() < Duration::from_secs(15) {
        let (st, note) = {
            let guard = state.lock().unwrap();
            let m = guard.mics.iter().find(|m| m.bt_addr == bt_addr).unwrap();
            (m.state, m.status_note.clone())
        };
        if st == MicConnState::Streaming {
            println!("[CLI-TEST] Connected & streaming: {note}");
            streaming = true;
            break;
        }
        if st == MicConnState::Error {
            eprintln!("[CLI-TEST] Connection error: {note}");
            scanner.stop();
            return 2;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    if !streaming {
        eprintln!("[CLI-TEST] Timed out waiting for Streaming state.");
        scanner.stop();
        return 2;
    }

    // Spawn Windows TTS in background while capturing UDP IPC frames
    println!("[CLI-TEST] Speaking test phrase via Windows speakers...");
    let tts_handle = std::thread::spawn(|| {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Volume = 100; $s.Speak('The quick brown fox jumps over the lazy dog seven times.')",
            ])
            .output();
    });

    let mut udp_frames = 0u32;
    let mut samples_all: Vec<i16> = Vec::with_capacity(16000 * 7);
    let mut buf = [0u8; 1024];
    let t_cap = Instant::now();
    while t_cap.elapsed() < Duration::from_secs(6) {
        if let Ok((len, _)) = udp_sock.recv_from(&mut buf) {
            if len >= 11 && &buf[0..4] == b"EMIC" {
                udp_frames += 1;
                for ch in buf[9..len].chunks_exact(2) {
                    samples_all.push(i16::from_le_bytes([ch[0], ch[1]]));
                }
            }
        }
    }
    let _ = tts_handle.join();

    let (pkts, drops) = {
        let guard = state.lock().unwrap();
        let m = guard.mics.iter().find(|m| m.bt_addr == bt_addr).unwrap();
        m.metrics.stop_flag.store(true, Ordering::Release);
        (
            m.metrics.packets.load(Ordering::Relaxed),
            m.metrics.drops.load(Ordering::Relaxed),
        )
    };
    scanner.stop();

    let rms = if samples_all.is_empty() {
        0.0
    } else {
        let sum_sq: f64 = samples_all.iter().map(|&s| (s as f64) * (s as f64)).sum();
        (sum_sq / samples_all.len() as f64).sqrt()
    };

    println!(
        "[CLI-TEST] BLE pkts={pkts} drops={drops} | UDP frames={udp_frames} samples={} RMS={rms:.1}",
        samples_all.len()
    );

    if udp_frames == 0 || rms < 100.0 {
        eprintln!("[CLI-TEST] FAIL: No audio or silent RMS.");
        return 3;
    }
    println!("[CLI-TEST] PASS: BLE -> UDP IPC audio verified!");
    0
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cli_test = args.iter().any(|a| a == "--cli-test");
    let start_minimized = args.iter().any(|a| a == "--minimized");

    if cli_test {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let state = Arc::new(Mutex::new(HubState::new(false, false)));
        let code = run_cli_test(state);
        unsafe {
            CoUninitialize();
        }
        std::process::exit(code);
    }

    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    let state = Arc::new(Mutex::new(HubState::new(
        !start_minimized,
        is_startup_enabled(),
    )));

    let _ = ui::run_ui(state, start_minimized);

    unsafe {
        CoUninitialize();
    }
}
