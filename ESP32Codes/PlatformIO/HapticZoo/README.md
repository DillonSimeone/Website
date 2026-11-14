# The Haptic Petting Zoo — Swamp Biome BLE Controller

Firmware for the 3-channel Swamp Biome interactive tactile petting habitat. Controls 3x 5V coin vibration motors inside an Alligator, Fish, and Snapping Turtle using an ESP32-C3 SuperMini and an L298N Mini Dual H-Bridge motor driver.

## Hardware Specifications
- **Microcontroller**: ESP32-C3 SuperMini (RISC-V 160MHz, BLE 5.0, Native USB-CDC)
- **Motor Driver**: L298N Mini Motor Driver (24 × 22 × 8 mm, dual bridge with low-side or single-ended switching)
- **Actuators**: 3× 5V DC Coin Vibration Motors (10mm or 12mm diameter × 3.4mm thickness)
- **Enclosure Fit**: Custom 3D printed swamp terrain tray seated inside the compact waterproof transit case (216 × 165 × 95 mm).

---

## Wiring Schematic

```text
       ESP32-C3 SuperMini                 L298N Mini Driver                5V Coin Motors
     +--------------------+             +-------------------+             +---------------+
     |                    |             |                   |             |               |
     |         5V (VBUS)  +------------>+ 5V / + (Power)    |             |               |
     |                GND +------------>+ -  / GND          +------+----->+ (-) Common    |
     |                    |             |                   |      |      |               |
     |             GPIO 0 +------------>+ IN1               |      |      +---------------+
     |             GPIO 1 +------------>+ IN2               |      |
     |             GPIO 2 +------------>+ IN3               |      |      +---------------+
     |                    |             |                   |      |      | Alligator     |
     |                    |             |              MOTOR|      +----->+ (-) Coin      |
     |                    |             |              OUT1 +------------>+ (+) Motor     |
     |                    |             |                   |             +---------------+
     |                    |             |              MOTOR|             +---------------+
     |                    |             |              OUT2 +------------>+ (+) Fish Coin |
     |                    |             |                   |             +---------------+
     |                    |             |              MOTOR|             +---------------+
     |                    |             |              OUT3 +------------>+ (+) Turtle    |
     +--------------------+             +-------------------+             +---------------+
```

*Note on L298N Mini Wiring*:
When using the L298N Mini to drive three separate coin vibration motors, tie the negative wire of each coin motor to common Ground (`GND`), and wire the positive motor leads to `OUT1`, `OUT2`, and `OUT3`. Drive `IN1`, `IN2`, and `IN3` with LEDC PWM from ESP32-C3 `GPIO 0`, `GPIO 1`, and `GPIO 2`.

---

## Web Bluetooth Protocol

- **Device Name**: `HapticZoo-Swamp`
- **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Characteristic UUID**: `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Read/Write/Notify)

### Command Packet (4 Bytes)
| Byte Index | Field | Description | Values |
|---|---|---|---|
| `0` | Channel | Target creature | `0` = Alligator, `1` = Fish, `2` = Turtle, `255` = All |
| `1` | Mode | Actuation mode | `0` = Manual Intensity, `1` = Timed Burst, `2` = Heartbeat, `3` = Flutter/Wave, `4` = Stop |
| `2` | Value | Intensity / Duty Cycle | `0` – `255` |
| `3` | Param | Duration or Period factor | `Param * 10 ms` (e.g., 50 = 500ms burst) |

---

## Compilation & Flashing
```bash
pio run -e esp32c3
pio run -e esp32c3 -t upload
```
