# Robot Controller Pinout (Dynamic Config)

此 Device Uses a **SoftAP Web Interface** (`OmniBot_Setup`) for pin assignment. The table below represents the **Default** fallback configuration if no settings are saved.

## Default Pinout (L298N Mini Mode)
| Function | Motor | ESP32 Pin | Notes |
| :------- | :---- | :-------- | :---- |
| **IN1**  | Front Left | 25 | PWM/Logic |
| **IN2**  | Front Left | 26 | PWM/Logic |
| **IN3**  | Front Right| 32 | PWM/Logic |
| **IN4**  | Front Right| 33 | PWM/Logic |
| **IN1**  | Rear Left  | 12 | PWM/Logic |
| **IN2**  | Rear Left  | 13 | PWM/Logic |
| **IN3**  | Rear Right | 27 | PWM/Logic |
| **IN4**  | Rear Right | 14 | PWM/Logic |

*Note: Pins 34, 35, 36, and 39 are **Input Only** and cannot be used for motors.*

## L298N Mini Wiring Logic
Unlike the standard L298N, the Mini does not have Enable pins. Speed control is achieved by sending PWM directly to the Direction pins.

- **Forward:** IN1 = PWM, IN2 = LOW
- **Backward:** IN1 = LOW, IN2 = PWM
- **Stop:** IN1 = LOW, IN2 = LOW

## Power Connections
- **Motor Power +**: Connect to Battery Positive (7.4V - 12V).
- **Motor Power -**: Connect to **ESP32 GND** (Common Ground is Critical).
