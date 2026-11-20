use serde::Serialize;
use std::net::UdpSocket;

#[derive(Serialize, Clone, Debug)]
pub struct TelemetryPacket {
    pub energy: f32,
    pub audio_pct: u32,
    pub sub: f32,
    pub punch: f32,
    pub snap: f32,
    pub vel: f32,
    pub pwm: u32,
    pub hit: bool,
    pub peak: u32,
    pub enabled: bool,
    pub mic_mode: bool,
    pub source: String,
}

pub struct TelemetryBroadcaster {
    socket: Option<UdpSocket>,
    target: &'static str,
}

impl TelemetryBroadcaster {
    pub fn new() -> Self {
        let socket = UdpSocket::bind("127.0.0.1:0").ok();
        Self {
            socket,
            target: "127.0.0.1:48123",
        }
    }

    pub fn send(&self, packet: &TelemetryPacket) {
        if let Some(ref s) = self.socket {
            if let Ok(bytes) = serde_json::to_vec(packet) {
                let _ = s.send_to(&bytes, self.target);
            }
        }
    }
}
