# Robot Controller Pinout (Freenove ESP32)

## Power Connections
- **L298N GND**: Connect to **ESP32 GND** and **Power Source Negative**. (Critical: Common Ground)
- **L298N 12V**: Connect to Motor Power Source (e.g., 7.4V - 12V Battery).
- **ESP32 Vin**: Connect to Battery Positive (if within voltage range) or L298N 5V Out.

## L298N #1 (Front Motors)
| Function | Motor | ESP32 Pin | Notes |
| :------- | :---- | :-------- | :---- |
| **ENA**  | Front Left | 14 | PWM (Speed) |
| **IN1**  | Front Left | 12 | Direction |
| **IN2**  | Front Left | 13 | Direction |
| **IN3**  | Front Right| 27 | Direction |
| **IN4**  | Front Right| 26 | Direction |
| **ENB**  | Front Right| 25 | PWM (Speed) |

## L298N #2 (Rear Motors)
| Function | Motor | ESP32 Pin | Notes |
| :------- | :---- | :-------- | :---- |
| **ENA**  | Rear Left  | 19 | PWM (Speed) |
| **IN1**  | Rear Left  | 33 | Direction |
| **IN2**  | Rear Left  | 32 | Direction |
| **IN3**  | Rear Right | 18 | Direction |
| **IN4**  | Rear Right | 5  | Direction |
| **ENB**  | Rear Right | 17 | PWM (Speed) |

## Strapping Pin Notes
- **GPIO 12**: If pulled HIGH at boot, can affect flash voltage. Ensure motor driver doesn't pull this high if boot issues occur.
- **GPIO 5**: Outputs PWM signal at boot.
- **GPIO 15**: Keep LOW at boot (default).

## L298N 6-Pin Conversion Guide
To enable speed control (PWM), you must modify the standard L298N module:

1. **Remove Jumpers**: Pull the black plastic jumpers off the **ENA** and **ENB** pins.
2. **The "Voltage Trap"**: Each jumper header has two pins. One is the **Signal Input** and the other is **5V Output**. 
    - **DO NOT** connect the ESP32 to the 5V pin (usually the one closer to the heatsink).
    - Connect the ESP32 PWM pin to the **Signal Pin** (usually the one closer to the board edge/IN pins).
3. **Soldering**: For a permanent build, solder your wires to the underside of the **Signal Pin**. Leave the 5V pin disconnected.
