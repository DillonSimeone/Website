# bluetooth-mic — Cost-Down Analysis
## Project Purpose
Bluetooth Classic HFP-HF mic — pair with phone, stream audio. Requires BR/EDR + HFP profile stack.
## Original Hardware
ESP32-WROOM-32E (BR/EDR + BLE).
## Replacement Selection
**Keep ESP32-WROOM-32E.** ESP32-C3/C6/H2 are BLE-only (no Bluetooth Classic radio). ESP32-S3 also dropped BR/EDR support. Migration away from classic ESP32 silicon breaks the core feature.
## Library Substitutions
Drop Arduino BT classes; use ESP-IDF's `esp_bt.h` + `esp_hf_client_api.h` directly.
## Risk & Validation
Confirm HFP-HF profile coverage required by target phone (call audio, ring, volume control).
