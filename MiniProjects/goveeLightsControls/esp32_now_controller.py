"""
ESP32-NOW Controller Module (Groundwork & Bridge Client)
=========================================================
This module enables controlling custom ESP32-C3 LED strips running FastLED via ESP-NOW.

Architecture:
-------------
1. PC (GoveeTrayControl) -> Sends UDP packet (port 4210) to a Wi-Fi ESP-NOW Gateway Bridge
   OR sends binary frame via USB Serial (COM port) to a tethered ESP32.
2. The Gateway ESP32 broadcasts the packet via ESP-NOW to all ESP32-C3 FastLED nodes.
3. ESP32-C3 nodes receive the packet in <5ms and instantly update their FastLED animation.

Packet Structure matches: firmware/esp32c3_fastled_espnow/include/espnow_protocol.h
"""

import os
import sys
import struct
import socket
import threading
from typing import Optional, Dict, List

# Command Constants
CMD_POWER       = 0x01
CMD_BRIGHTNESS  = 0x02
CMD_COLOR       = 0x03
CMD_PATTERN     = 0x04
CMD_ALL         = 0x05

# Pattern Constants matching firmware
PATTERNS = [
    "Solid Color",
    "Rainbow Cycle",
    "Fire2012 Simulation",
    "Breathing Pulse",
    "Twinkle Sparkle",
    "Color Chase"
]

class ESP32NowDevice:
    def __init__(self, node_id: int = 0, name: str = "ESP32-C3 FastLED (All)"):
        self.node_id = node_id # 0 = All broadcast
        self.name = name
        self.is_on = True
        self.brightness = 100
        self.r = 255
        self.g = 180
        self.b = 50
        self.active_pattern_idx = 1
        self.active_pattern_name = "Rainbow Cycle"
        self.speed = 30


class ESP32NowManager:
    def __init__(self, gateway_ip: str = "255.255.255.255", gateway_port: int = 4210):
        self.gateway_ip = gateway_ip
        self.gateway_port = gateway_port
        self.devices: Dict[int, ESP32NowDevice] = {
            0: ESP32NowDevice(0, "ESP32-C3 Nodes (Broadcast)")
        }
        self.is_configured = False # Set True when an ESP32 bridge is active

    def build_packet(self, cmd: int, node_id: int, power: bool, brightness: int, 
                     r: int, g: int, b: int, pattern: int, speed: int = 30) -> bytes:
        """
        Builds a 16-byte binary packet matching EspNowLightPacket in espnow_protocol.h:
        - magic: 2 bytes (0xEE, 0x32)
        - cmd: 1 byte
        - node_id: 1 byte
        - power: 1 byte (0/1)
        - brightness: 1 byte (0-255)
        - r, g, b: 3 bytes
        - pattern: 1 byte (0-5)
        - speed: 1 byte
        - reserved: 4 bytes
        """
        bri_255 = max(0, min(255, int((brightness / 100.0) * 255)))
        p_val = 1 if power else 0
        magic = bytes([0xEE, 0x32])
        reserved = bytes([0x00, 0x00, 0x00, 0x00])

        packet = struct.pack(
            "!2sBBBBBBBB4s",
            magic,
            cmd,
            node_id,
            p_val,
            bri_255,
            r, g, b,
            pattern,
            speed,
            reserved
        )
        return packet

    def send_packet(self, packet: bytes):
        """Broadcasts packet over UDP to the ESP-NOW Gateway Bridge."""
        def _send():
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                s.settimeout(1.0)
                s.sendto(packet, (self.gateway_ip, self.gateway_port))
                s.close()
            except Exception as e:
                print(f"[ESP-NOW UDP Send Error] {e}")

        threading.Thread(target=_send, daemon=True).start()

    def set_power(self, node_id: int, on: bool):
        dev = self.devices.get(node_id)
        if dev:
            dev.is_on = on
            pkt = self.build_packet(
                cmd=CMD_POWER,
                node_id=node_id,
                power=on,
                brightness=dev.brightness,
                r=dev.r, g=dev.g, b=dev.b,
                pattern=dev.active_pattern_idx,
                speed=dev.speed
            )
            self.send_packet(pkt)

    def set_brightness(self, node_id: int, pct: int):
        dev = self.devices.get(node_id)
        if dev:
            dev.brightness = pct
            dev.is_on = (pct > 0)
            pkt = self.build_packet(
                cmd=CMD_BRIGHTNESS,
                node_id=node_id,
                power=dev.is_on,
                brightness=pct,
                r=dev.r, g=dev.g, b=dev.b,
                pattern=dev.active_pattern_idx,
                speed=dev.speed
            )
            self.send_packet(pkt)

    def set_pattern(self, node_id: int, pattern_idx: int):
        dev = self.devices.get(node_id)
        if dev and 0 <= pattern_idx < len(PATTERNS):
            dev.active_pattern_idx = pattern_idx
            dev.active_pattern_name = PATTERNS[pattern_idx]
            dev.is_on = True
            pkt = self.build_packet(
                cmd=CMD_PATTERN,
                node_id=node_id,
                power=True,
                brightness=dev.brightness,
                r=dev.r, g=dev.g, b=dev.b,
                pattern=pattern_idx,
                speed=dev.speed
            )
            self.send_packet(pkt)

    def set_color(self, node_id: int, r: int, g: int, b: int):
        dev = self.devices.get(node_id)
        if dev:
            dev.r, dev.g, dev.b = r, g, b
            dev.active_pattern_idx = 0 # Pattern Solid
            dev.active_pattern_name = "Solid Color"
            dev.is_on = True
            pkt = self.build_packet(
                cmd=CMD_COLOR,
                node_id=node_id,
                power=True,
                brightness=dev.brightness,
                r=r, g=g, b=b,
                pattern=0,
                speed=dev.speed
            )
            self.send_packet(pkt)
