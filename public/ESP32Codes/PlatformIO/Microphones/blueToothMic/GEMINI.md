# Bluetooth Mic (ESP-IDF HFP)

## Overview
Streams audio from an **INMP441 I2S Microphone** over **Bluetooth HFP (Hands-Free Profile)** using raw ESP-IDF APIs. The ESP32 appears as a Bluetooth headset named `ESP32-Mic`, enabling apps like **Google Live Transcript** to use it as a microphone input for speech-to-text.

**Status:** ✅ Working — confirmed mSBC (16kHz wideband) audio connection with Pixel 6a.

> **💡 Tip: Digital Gain Adjustment**
> If the microphone is too quiet or clipping, adjust the digital gain in `src/main.c`. Look for the bit shift in `mic_task()`: `int16_t sample = (int16_t)((samples[i] >> 16) << 2);`. Increase the `<< 2` for more volume or decrease it if the audio is distorted.

## Hardware Setup
*   **Microcontroller:** ESP32 DevKit (full ESP32, NOT C3 — Bluetooth Classic required)
*   **Microphone:** INMP441
*   **Wiring:**
    *   `3V3` → VCC
    *   `GND` → GND
    *   `D15` → WS
    *   `D2` → L/R (driven LOW = Left channel)
    *   `D4` → SCK
    *   `D5` → SD (data out)

## Key Features
*   **HFP Client Mode:** ESP32 appears as a Bluetooth headset mic (not A2DP music streaming).
*   **Automatic SSP Pairing:** No PIN code needed — just pair from your phone.
*   **Wideband Speech (mSBC):** Negotiates 16kHz mSBC codec with modern phones for clear audio.
*   **Format Conversion:** Converts INMP441's 32-bit I2S output to 16-bit PCM with 4x digital gain.
*   **LED Level Meter:** Built-in LED on D2 reflects real-time mic amplitude.

## Architecture
*   **Framework:** ESP-IDF v5.1.2 (not Arduino) — required because the Arduino ESP32 core does not compile HFP support.
*   **Audio Pipeline:** I2S mic → ring buffer → BT SCO outgoing callback → phone.
*   **BT Profile:** HFP-HF (Hands-Free unit). Phone acts as Audio Gateway.

### Critical Design Patterns (from official ESP-IDF hfp_hf example)

These three patterns are **mandatory** for SCO audio to work. Getting any of them wrong will cause the phone to silently reject the audio connection:

1.  **Late Data Callback Registration:** `esp_hf_client_register_data_callback()` must be called **only when audio state reaches CONNECTED**, not during init. Registering early causes the BT stack to misbehave.

2.  **Bidirectional Pump:** The `hf_incoming_cb` (phone → ESP32 speaker path) **must** call `esp_hf_client_outgoing_data_ready()`. Even though we don't need speaker output, this call is what triggers the stack to pull mic data from `hf_outgoing_cb`. Without it, no audio flows.

3.  **SCO Ringbuffer Lifecycle:** A separate `sco_ringbuf` is created on audio connect and destroyed on audio disconnect, matching the official example's `bt_app_hf_client_audio_open/close` pattern.

## sdkconfig.defaults — Key Settings

| Setting | Value | Why |
|---------|-------|-----|
| `CONFIG_BTDM_CTRL_MODE_BR_EDR_ONLY` | `y` | Classic BT only (no BLE overhead) |
| `CONFIG_BTDM_CTRL_BR_EDR_SCO_DATA_PATH_HCI` | `y` | Route SCO audio through software (HCI), not PCM pins |
| `CONFIG_BTDM_CTRL_BR_EDR_MAX_SYNC_CONN` | `1` | **Critical:** Allow 1 SCO connection. Default may be 0, which silently blocks all audio. |
| `CONFIG_BT_HFP_AUDIO_DATA_PATH_HCI` | `y` | Tell Bluedroid to use HCI for audio data |
| `CONFIG_BT_HFP_WBS_ENABLE` | `y` | Enable mSBC wideband codec (16kHz). Modern phones require this. |
| `CONFIG_BT_SSP_ENABLED` | `y` | Secure Simple Pairing — no PIN prompts |

## Troubleshooting History

### Problem: Phone always rejected SCO connection
**Root causes found (all three needed fixing):**
1.  `MAX_SYNC_CONN` was missing from sdkconfig — controller had 0 SCO slots.
2.  Data callbacks were registered at init instead of on audio connect.
3.  `outgoing_data_ready()` was never called to pump the bidirectional channel.

### Problem: Audio state stuck at 1 (CONNECTING)
Fixed by ensuring `CONFIG_BTDM_CTRL_BR_EDR_SCO_DATA_PATH_HCI=y` in sdkconfig.defaults AND deleting `sdkconfig.esp32` to force regeneration.

### Problem: WBS disabled caused codec mismatch
Pixel 6a requires mSBC negotiation. Disabling WBS forced CVSD-only, which the phone rejected.

## Notes
*   ESP32-C3 only supports BLE — no Bluetooth Classic (HFP/HSP/A2DP).
*   A2DP was tried first but phones see A2DP as a music source, not a microphone.
*   HFP is the profile used by all Bluetooth headsets for mic input.
*   **Always delete `sdkconfig.esp32`** after changing `sdkconfig.defaults` — PlatformIO caches the old config otherwise.
