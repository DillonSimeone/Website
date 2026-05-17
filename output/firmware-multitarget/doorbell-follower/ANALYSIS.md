# doorbell-follower — Cost-Down Analysis
ESP-NOW receiver. ESP-NOW is ESP32-family-only — C3 is the cheapest viable target. Pin remap to C3 GPIOs.
## Library Substitutions
Arduino `esp_now.h` (still applies) — but replace wrapper macros with direct `esp_now_init`, `esp_now_register_recv_cb` calls.
