# Project 03 Hardware Simulation Guide

Before manufacturing physical boards at JLCPCB, you can run a **full digital + analog simulation** of this PCB to confirm firmware behavior, sensor communication, and power circuitry.

---

## 1. Wokwi Simulation (ESP32-C3 Firmware, IMU, LEDs, Audio & Haptics)

The files in this folder ([`diagram.json`](./diagram.json) and [`sketch.ino`](./sketch.ino)) provide an exact, turnkey hardware emulation of the **03-compactAudioMotionSquarePCB**.

### Hardware Mapping in Simulation:
* **ESP32-C3 SuperMini MCU**: Real RISC-V core running in browser WebAssembly.
* **MPU-6050 6-Axis IMU**: I2C bus on **GPIO 2 (SDA)** and **GPIO 3 (SCL)**.
* **Main WS2812B NeoPixel Strip (16 LEDs)**: Connected to **GPIO 6**.
* **Aux 2 NeoPixel Strip (8 LEDs)**: Connected to **GPIO 20 (RX)**.
* **Aux 3 NeoPixel Strip (8 LEDs)**: Connected to **GPIO 21 (TX)**.
* **MAX4466 Analog Microphone**: Connected to **GPIO 0 (ADC1_CH0)** via a simulated interactive potentiometer knob.
* **Haptic Vibration Motor**: Connected to **GPIO 7 (PWM)** via a simulated tactile buzzer.
* **High-Side Power Cutoff**: Driven by **GPIO 10**.

### How to Run in Wokwi (Takes 30 Seconds):
1. Go to [wokwi.com/projects/new/esp32-c3](https://wokwi.com/projects/new/esp32-c3).
2. Click the **diagram.json** tab in the Wokwi editor, select all, and paste the contents of [`diagram.json`](./diagram.json).
3. Click the **sketch.ino** tab, select all, and paste the contents of [`sketch.ino`](./sketch.ino).
4. Click the **Library Manager** (books icon) or in `libraries.txt`, add:
   ```
   Adafruit NeoPixel
   ```
5. Click **▶ Play (Start the simulation)**!

### What You Can Test Live:
1. **Motion Gestures**: Drag the MPU-6050 chip around or change pitch/roll sliders — observe the LED colors dynamically tracking tilt orientation.
2. **Audio-Reactive Beats**: Slide the simulated microphone knob — watch the main strip pulse as a real-time sound VU meter.
3. **Tactile Haptic Pulses**: Shake the virtual IMU quickly or crank the audio above 80% — the buzzer on GPIO 7 fires haptic vibration feedback.
4. **Live Telemetry**: Watch the Serial Monitor print pitch, roll, G-force, and audio volume at 115,200 baud.

---

## 2. Falstad Circuit Simulator (Analog Power-Path & MOSFET Switching)

For the discrete analog circuitry that microcontroller emulators do not model (P-MOS power path, high-side LED cutoff, and inductive flyback diode clamping), you can simulate them in [Falstad Circuit Simulator](https://www.falstad.com/circuit/):

### Circuit A: Automatic Power-Path Management
* **Components**: 1S LiPo Battery (3.7V), USB 5V rail, AO3401A P-MOSFET (`Q_PWR`), SS14 Schottky Diode (`D_PWR`), and 100kΩ resistor (`R_PWR`).
* **Test**:
  1. Toggle USB 5V switch: When USB is applied, 5V hits the P-MOS gate, instantly shutting the MOSFET **OFF**. Zero battery current is drawn. USB powers the load through the Schottky diode.
  2. Disconnect USB 5V: The 100kΩ resistor pulls the P-MOS gate to GND, turning the P-MOS **ON**. Battery powers the system through the low-resistance channel ($< 30\text{m}\Omega$) with zero diode drop.

### Circuit B: High-Side LED Power Isolation Switch
* **Components**: AO3401A P-MOS (`Q_LED_PWR`), AO3400A N-MOS (`Q_LED_EN`), 100kΩ pull-up, 10kΩ pull-down.
* **Test**:
  1. GPIO 10 = 0V (Sleep Mode): N-MOS is OFF. 100kΩ pulls P-MOS gate to 5V (OFF). Current to the LED rail is strictly **0.000 µA** (zero parasitic drain).
  2. GPIO 10 = 3.3V (Active Mode): N-MOS turns ON, pulling P-MOS gate to GND (ON). Full 5V rail energizes the WS2812B LED array.

### Circuit C: Haptic Inductive Flyback Clamp
* **Components**: AO3400A N-MOS (`Q_FET`), Inductive Motor Coil ($L = 10\text{mH}, R = 30\Omega$), B5819W Schottky Diode (`D_HAP`).
* **Test**:
  1. Pulse the gate with 5 kHz PWM.
  2. Observe the oscilloscope: when the MOSFET shuts off, the inductive back-EMF spike safely clamps to VSYS (+5V) through the diode with **zero voltage punch-through on the MOSFET drain**.
