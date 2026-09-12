# DeafDoorbell

**A visual doorbell alert system for deaf individuals, powered by ESP-NOW.**

When your door chime rings, a microphone-equipped ESP32-C3 hears it and instantly alerts every LED-strip-equipped ESP32-C3 in your home to flash brightly.

---

## Quick Start

### Master (next to the door chime)

**Wiring:**

| Component      | GPIO | Notes                   |
|----------------|------|-------------------------|
| INMP411 SD     | 0    | I2S data                |
| INMP411 SCK    | 1    | I2S clock               |
| INMP411 L/R    | 2    | Drive LOW (left channel) |
| INMP411 WS     | 3    | I2S word select         |
| INMP411 GND    | 4    | Optional soft ground    |
| Onboard LED    | 8    | Audio level feedback    |

**Setup:**
1. Connect the INMP411 mic as shown above.
2. Flash `Master/` firmware via `upload.bat`.
3. Connect your phone to WiFi network **"DeafDoorbell-Master"**.
4. The captive portal opens automatically. Adjust:
   - **Threshold** — Set high enough that only the chime triggers it.
   - **Flash Duration** — How long Followers flash (500ms–10s).
   - **Cooldown** — Minimum time between re-triggers.
   - **Color** — Pick the LED flash color.

### Follower (anywhere in your home)

**Wiring:**

| Component      | GPIO | Notes                         |
|----------------|------|-------------------------------|
| WS2812B Data   | 2    | LED strip data line           |
| Vibration Motor| 3    | Via transistor/MOSFET to GND  |
| Onboard LED    | 8    | Heartbeat indicator           |

**Setup:**
1. Connect LED strip and (optionally) vibration motor.
2. Flash `Follower/` firmware via `upload.bat`.
3. Power on. That's it — it auto-listens for Master broadcasts.

### Adding More Followers
Just flash more ESP32-C3 boards with the Follower firmware and power them on. No pairing needed — ESP-NOW broadcast reaches all units on the same WiFi channel.

---

## How It Works

```
Door Chime Rings
       |
  [Master ESP32-C3]
  INMP411 mic hears it
  RMS exceeds threshold
       |
  ESP-NOW Broadcast
  (FF:FF:FF:FF:FF:FF)
  Includes: duration + RGB color
       |
  +---------+---------+
  |         |         |
[Follower] [Follower] [Follower]
 Flash LEDs  Flash LEDs  Flash LEDs
 Buzz Motor  Buzz Motor  Buzz Motor
```

---

## Adjusting LED Count

In `Follower/src/main.cpp`, change:
```cpp
#define LED_COUNT  60   // Your strip length
```

## Troubleshooting

- **No flash on Follower?** — Check that Master and Follower are on the same WiFi channel (default: channel 1). The Master's AP forces channel 1.
- **False triggers?** — Raise the threshold via the captive portal. Position the mic as close to the chime as possible.
- **Weak signal?** — ESP-NOW range is ~200m line-of-sight. Through walls it's typically 30-50m. Add a Follower as a relay if needed.
