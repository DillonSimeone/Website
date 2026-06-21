# Project Upgrade: ESP-NOW Reactive Handle & Follower

This project contains two ESP32-C3 firmware applications that communicate via **ESP-NOW** (a fast, low-latency connectionless protocol) to link a motion-reactive handle device with an external LED strip follower.

---

## ⚡ How It Works

1. **Handle Device (`reactiveHandleLightMotion`)**:
   - Reads accelerometer and gyroscope data from the **MPU6050** sensor.
   - Computes an `energyLevel` (0.0 to 1.0) based on motion intensity.
   - Updates local LEDs and controls a vibration motor with complex haptic patterns (heartbeat, gallop, buzz) depending on the charge.
   - Broadcasts the float `energyLevel` every 30ms via ESP-NOW to all listening devices (`FF:FF:FF:FF:FF:FF`).
   - Automatically enters deep sleep on inactivity, turning off the radio and waking up on motion.

2. **Follower Device (`reactiveFollowerLightMotion`)**:
   - Continuously listens for ESP-NOW broadcasts.
   - Uses **Delta Math (exponential easing / interpolation)** to smoothly transition its current light level toward the target value received from the handle.
   - Displays the level proportionally on its own LED strip. For example:
     - `1.0` target lights up 100% of the strip.
     - `0.5` target lights up 50% of the strip.

---

## 📐 Delta Math (Smoothing)

To prevent the follower's LED strip from looking jittery or stepping abruptly when updating, we implement exponential decay easing (delta-time-based interpolation):

$$\text{currentCharge} \leftarrow \text{currentCharge} + (\text{targetCharge} - \text{currentCharge}) \times \text{easingFactor} \times \text{dt}$$

- **`easingFactor`** (default `6.0`): Controls how fast the follower catches up to the handle. A higher value is more responsive; a lower value is smoother.
- **`dt`**: Elapsed time since last frame in seconds, ensuring smooth animation independent of frame rate fluctuations.

---

## 🔌 Pinouts

Here are the hardware configurations for both devices. Both utilize the **ESP32-C3-DevKitM-1** development board.

### 1. Handle Device Pinout

| Pin Name | ESP32-C3 GPIO | Description / Connection |
|---|---|---|
| **SDA_PIN** | `GPIO 2` | I2C Data line for MPU6050 |
| **SCL_PIN** | `GPIO 3` | I2C Clock line for MPU6050 |
| **GND_PIN** | `GPIO 4` | Soft Ground. Set `LOW` to power the MPU6050 |
| **INT_PIN** | `GPIO 5` | MPU6050 Interrupt line. Used to wake ESP32 from deep sleep |
| **LED_PIN** | `GPIO 6` | Data pin for WS2812B LED strip (74 LEDs) |
| **MOTOR_PIN**| `GPIO 7` | PWM control pin for Haptic Vibration Motor driver |

### 2. Follower Device Pinout

| Pin Name | ESP32-C3 GPIO | Description / Connection |
|---|---|---|
| **LED_PIN** | `GPIO 6` | Data pin for WS2812B LED strip (74 LEDs) |
| **VCC** | `5V / USB` | External 5V Power Supply for LED strip |
| **GND** | `GND` | Common Ground with LED strip |

---

## 🛠️ Flashing & Monitoring

Scripts are provided in each directory to automate compilation, upload, and serial port monitoring.

- **To flash the Handle**: Run `reactiveHandleLightMotion/upload.bat`
- **To flash the Follower**: Run `reactiveFollowerLightMotion/flashFollower.bat`
