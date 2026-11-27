use std::net::UdpSocket;

use crate::adpcm::SAMPLES_PER_PKT;

pub const IPC_PORT: u16 = 47100;
pub const IPC_MAGIC: [u8; 4] = *b"EMIC";
pub const IPC_HEADER_BYTES: usize = 9;
pub const IPC_PACKET_BYTES: usize = IPC_HEADER_BYTES + SAMPLES_PER_PKT * 2; // 969 bytes

pub struct IpcSender {
    socket: UdpSocket,
    buf: [u8; IPC_PACKET_BYTES],
}

impl IpcSender {
    pub fn new() -> std::io::Result<Self> {
        let socket = UdpSocket::bind("127.0.0.1:0")?;
        socket.set_nonblocking(true)?;
        Ok(Self {
            socket,
            buf: [0u8; IPC_PACKET_BYTES],
        })
    }

    /// Sends one 30 ms (480-sample) 16 kHz mono PCM frame to speech-bridge on 127.0.0.1:47100.
    pub fn send_frame(&mut self, slot: u8, mac_tail: [u8; 2], seq: u16, samples: &[i16]) {
        let count = samples.len().min(SAMPLES_PER_PKT);
        self.buf[0..4].copy_from_slice(&IPC_MAGIC);
        self.buf[4] = slot;
        self.buf[5..7].copy_from_slice(&mac_tail);
        self.buf[7..9].copy_from_slice(&seq.to_le_bytes());

        let mut offset = IPC_HEADER_BYTES;
        for &s in &samples[..count] {
            let b = s.to_le_bytes();
            self.buf[offset] = b[0];
            self.buf[offset + 1] = b[1];
            offset += 2;
        }
        // Zero-pad tail if partial frame
        if offset < IPC_PACKET_BYTES {
            self.buf[offset..IPC_PACKET_BYTES].fill(0);
        }

        let _ = self.socket.send_to(&self.buf, ("127.0.0.1", IPC_PORT));
    }
}
