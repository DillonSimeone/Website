# reactiveHandleLightMotion

Motion-reactive LightBaton **handle** firmware for ESP32-C3. Reads MPU6050/6500 IMU data, drives local WS2812B LEDs + haptic motor, broadcasts `energyLevel` over **ESP-NOW**, and exposes **Web Bluetooth** tuning (Haxel-style).

## Features

- **ESP-NOW broadcast** — unchanged float `energyLevel` packet to followers / Ember (`FF:FF:FF:FF:FF:FF`, optional channel hopping)
- **BLE control portal** — Nordic UART JSON service; pair from Chrome via [`public/Projects/LightBaton/bluetooth.html`](../../../../Projects/LightBaton/bluetooth.html)
- **Motion speed bins** — 32 bins (0–15 = X-axis speed, 16–31 = Y-axis speed) routed to per-bin haptic patterns
- **16 built-in patterns** — classic shapes (Heartbeat, Gallop, Shimmer) + motion-reactive masters (DualAxis, SpinSync, SwingBeat, …)
- **NVS persistence** — pattern, bins, intensity, charge/decay rates survive reboot

## Pin Configuration

| Signal | GPIO |
| :--- | :--- |
| `SDA_PIN` | 2 |
| `SCL_PIN` | 3 |
| `GND_PIN` | 4 (soft ground for IMU) |
| `INT_PIN` | 5 (sleep wake) |
| `LED_PIN` | 6 |
| `MOTOR_PIN` | 7 |

## Build Environments

| Env | IMU |
| :--- | :--- |
| `esp32c3_mpu6050` (default) | MPU6050 |
| `esp32c3_mpu6500` | MPU6500 |

## Flash

```bat
upload.bat
```

Or:

```bat
pio run -e esp32c3_mpu6050 -t upload
pio device monitor
```

## BLE Setup

1. Flash the handle firmware.
2. Open **Chrome/Edge** → [`/Projects/LightBaton/bluetooth.html`](../../../../Projects/LightBaton/bluetooth.html)
3. Click **CONNECT BLE** → select `LightBaton-…`
4. Tune master pattern, motion bin routing, charge/decay on the **Motion Bins** tab.

ESP-NOW continues broadcasting while BLE is connected.

## Source Layout

```
src/
  main.cpp           — setup/loop, ESP-NOW, energy integrator
  MpuSensor.*        — IMU driver
  MotionAnalyzer.*   — X/Y speed bins from gyro + accel
  Patterns.*         — haptic pattern library
  PatternEngine.*    — bin routing + motor evaluation
  BleServer.*        — Web Bluetooth JSON API
  DeviceConfig.*     — NVS settings
```
