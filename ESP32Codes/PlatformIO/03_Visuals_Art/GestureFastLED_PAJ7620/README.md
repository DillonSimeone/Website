# GestureFastLED_PAJ7620 (ESP32-C3 SuperMini)

Zero-wire direct-mount gesture controller for WS2812B addressable LEDs using the **ESP32-C3 SuperMini** and the **GY-PAJ7620** 9-gesture recognition sensor.

## Hardware Setup & Pinout

The GY-PAJ7620 5-pin female or male header plugs directly onto the side edge of the ESP32-C3 SuperMini with **zero jumper wires**:

| Sensor Pin | ESP32-C3 Pin | Mode / Description |
|---|---|---|
| **VCC** | **3V3** | 3.3V System Power Rail |
| **GND** | **GPIO 4** | **Soft Ground**: Configured as `OUTPUT LOW` in firmware |
| **SCL** | **GPIO 3** | I2C Clock (`Wire.begin`) |
| **SDA** | **GPIO 2** | I2C Data (`Wire.begin`) |
| **INT** | **GPIO 1** | Active-Low Gesture Interrupt (`INPUT_PULLUP`) |
| *(Strip)* | **GPIO 5** | **FastLED Data Out** (Opposite row header) |
| *(Board)* | **GPIO 8** | Onboard Blue Status LED (Flashes on gesture) |

> **Note**: If your GY-PAJ7620 breakout board has SDA and SCL swapped on the silkscreen, simply swap `PIN_I2C_SDA` and `PIN_I2C_SCL` at the top of `src/main.cpp`.

---

## 9 Native Built-in Gestures & Controls

| Gesture | Action on FastLED | Serial Output |
|---|---|---|
| **Swipe UP** | Next Animation Pattern (8 built-in patterns) | `[GESTURE] UP -> Pattern: ...` |
| **Swipe DOWN** | Previous Animation Pattern | `[GESTURE] DOWN -> Pattern: ...` |
| **Swipe LEFT** | Previous Color Palette (8 curated palettes) | `[GESTURE] LEFT -> Palette: ...` |
| **Swipe RIGHT** | Next Color Palette | `[GESTURE] RIGHT -> Palette: ...` |
| **Push FORWARD** | Expand active LED length (+5 LEDs, up to 60) | `[GESTURE] FORWARD -> Active LEDs: ...` |
| **Pull BACKWARD** | Shrink active LED length (-5 LEDs, down to 5) | `[GESTURE] BACKWARD -> Active LEDs: ...` |
| **Clockwise Circle** | Increase Brightness (+30) | `[GESTURE] CLOCKWISE -> Brightness: ...` |
| **Counter-CW Circle** | Decrease Brightness (-30) | `[GESTURE] COUNTER-CW -> Brightness: ...` |
| **Wave** | Toggle Power ON / OFF (Instant sleep blackout) | `[GESTURE] WAVE -> Power Toggle: ...` |

---

## Built-In Patterns & Palettes

### 8 Animation Patterns:
1. **Rainbow Flow**: Smooth chromatic wave running along the strip.
2. **Palette Breathing**: Soft organic breathing pulse in palette hues.
3. **Theater Chase**: Classic marquee dots in motion.
4. **Meteor Rain**: Comet with realistic fading tail.
5. **Star Twinkle**: Random gentle starlight sparkles.
6. **Fire Glow**: Dynamic heat and spark simulation.
7. **Cylon Scanner**: Retro back-and-forth scanning eye.
8. **Solid Tone Wash**: Uniform smooth palette color wash.

### 8 Curated Palettes:
1. `Rainbow`
2. `Ocean Blue`
3. `Lava Fire`
4. `Emerald Forest`
5. `Party Punch`
6. `Cyberpunk Neon` (Hot magenta, electric cyan, neon purple)
7. `Sunset Glow` (Amber, rose gold, twilight violet)
8. `Ice Frost` (Pale ice blue, crystal white)

---

## Compiling & Flashing

### One-Click Script (Windows)
Double-click `upload.bat` to automatically build, upload, and launch the serial monitor.

### PlatformIO CLI
```bash
cd PlatformIO/03_Visuals_Art/GestureFastLED_PAJ7620
pio run -e esp32c3 -t upload
pio device monitor -b 115200
```
