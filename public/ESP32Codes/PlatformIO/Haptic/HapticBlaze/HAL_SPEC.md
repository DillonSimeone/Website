# HapticBlaze — Hardware Abstraction Layer Specification

This document defines the `IHapticDriver` contract and per-driver implementation requirements for the four chips supported in v1.0: **L298N**, **DRV8833**, **DRV2605L**, and **raw MOSFET PWM**.

The goal: a pattern that runs on L298N renders the same on DRV2605L. Differences in capability (e.g., on-chip waveform library) are advertised by `DriverCaps`, never assumed.

---

## 1. Interface

```cpp
namespace hapticblaze::hal {

enum class DriverKind : uint8_t {
    NONE       = 0,
    L298N      = 1,
    DRV8833    = 2,
    DRV2605L   = 3,
    MOSFET     = 4,
};

struct DriverCaps {
    uint8_t  channels;            // physical output channels
    bool     bidirectional;       // can reverse polarity (H-bridge)
    bool     brake;               // supports active brake (short low side)
    bool     onChipLibrary;       // has internal waveform ROM (DRV2605L)
    bool     closedLoop;          // auto-resonance / LRA tracking
    uint32_t maxPwmHzPerChannel;
    float    minDuty;             // below this the actuator does not move
    float    maxRecommendedDuty;  // safety cap suggested by manufacturer
};

struct DriverConfig {
    DriverKind kind;
    // up to 8 pin slots; meaning is driver-specific (see sections below).
    int8_t pins[8];
    // Optional I2C pin override (DRV2605L). -1 = use bus default.
    int8_t sda = -1;
    int8_t scl = -1;
    uint8_t i2cAddr = 0x5A;
    uint32_t pwmHz = 20000;       // requested PWM rate; driver may clamp
    uint8_t pwmBits = 10;
};

class IHapticDriver {
public:
    virtual ~IHapticDriver() = default;
    virtual bool       begin(const DriverConfig& cfg) = 0;
    virtual void       end() = 0;
    virtual void       write(uint8_t ch, float duty01) = 0;          // 0..1
    virtual void       writeSigned(uint8_t ch, float signed11) = 0;  // -1..1
    virtual void       allOff() = 0;
    virtual uint8_t    channelCount() const = 0;
    virtual DriverCaps capabilities() const = 0;
    virtual const char* name() const = 0;
};

} // namespace
```

### 1.1 Semantic rules

- `write(ch, v)` clamps internally. Out-of-range is not a fault.
- `writeSigned` on a non-bidirectional driver renders `|v|` and ignores sign.
- `allOff()` MUST take ≤ 1 ms and be ISR-safe enough to be called from the E-stop GPIO interrupt.
- `begin()` MUST be idempotent. Calling it after a `setup`-change reconfigures pins safely.

### 1.2 Conformance tests

Every driver must pass `test/test_hal_<driver>.cpp`:

1. `begin()` succeeds with a valid pin map.
2. `begin()` returns false with conflicting or out-of-range pins (no crash).
3. After `write(0, 0.5)` measured PWM duty is within ±2 % on a logic analyzer (manual test).
4. `allOff()` brings all advertised channels to 0 within 1 ms.
5. Capabilities are not lies (bidirectional drivers actually reverse).

---

## 2. L298N mini (default)

**Why it's the default.** Cheap, ubiquitous, two H-bridges, tolerant of voltage swings 5–35 V. Excellent first driver for vibration motors and solenoids.

### 2.1 Wiring

`pins[]` slots:
| Index | Signal     | Notes                                       |
| ----- | ---------- | ------------------------------------------- |
| 0     | ENA / PWM1 | LEDC-capable GPIO. Drives speed of ch 0.    |
| 1     | IN1        | Direction bit A for ch 0.                   |
| 2     | IN2        | Direction bit B for ch 0.                   |
| 3     | ENB / PWM2 | LEDC-capable GPIO. Drives speed of ch 1.    |
| 4     | IN3        | Direction bit A for ch 1.                   |
| 5     | IN4        | Direction bit B for ch 1.                   |
| 6,7   | reserved   | unused.                                     |

Logic levels: L298N expects 5 V logic, but the ESP32 3.3 V outputs are above the chip's `V_IH` floor of ~2.3 V — works reliably with the mini board. If using a generic L298N board, jumper the on-board 5 V regulator off and feed `VLOGIC` from 3.3 V.

### 2.2 Capabilities

```cpp
DriverCaps{
    .channels = 2,
    .bidirectional = true,
    .brake = true,
    .onChipLibrary = false,
    .closedLoop = false,
    .maxPwmHzPerChannel = 20000,
    .minDuty = 0.10f,
    .maxRecommendedDuty = 1.00f,
};
```

`minDuty = 0.10` because below ~10 % the motor stalls on most cheap ERM units; pattern engine soft-starts above this floor by default.

### 2.3 Implementation notes

- Allocate two LEDC channels (one per ENA/ENB) on group 0, timer 0, 20 kHz, 10-bit.
- Direction pins are plain `digitalWrite`. `writeSigned(v)`:
  - `v > 0`: IN1=H, IN2=L, duty = |v|
  - `v < 0`: IN1=L, IN2=H, duty = |v|
  - `v == 0`: brake (IN1=L, IN2=L, duty=0). Coast is available via API as `setBrakeMode(false)`.
- 20 kHz is above audible range — important; otherwise the motor sings.

### 2.4 Caveats

- Power loss across the L298N is ~1.4 V per side; not great for low-voltage LRAs. Prefer DRV8833 for 3.0 V LRAs.
- No current limiting; protect with a fuse + flyback diodes (the mini board includes diodes).

---

## 3. DRV8833

**Why it matters.** Low V_drop (vs L298N), built-in current sense, native 3.3 V logic, ideal for 3.0 V ERM/LRA and small solenoids.

### 3.1 Wiring

| Index | Signal | Notes                                          |
| ----- | ------ | ---------------------------------------------- |
| 0     | AIN1   | PWM-capable. Drives ch 0 (in fast-decay mode). |
| 1     | AIN2   | PWM-capable. Direction / complement.           |
| 2     | BIN1   | PWM-capable. ch 1.                             |
| 3     | BIN2   | PWM-capable. ch 1.                             |
| 4     | nSLEEP | Drive HIGH at begin(). Pull LOW for allOff power-save. |
| 5-7   | reserved.                                                |

### 3.2 Capabilities

```cpp
DriverCaps{
    .channels = 2, .bidirectional = true, .brake = true,
    .onChipLibrary = false, .closedLoop = false,
    .maxPwmHzPerChannel = 50000,
    .minDuty = 0.05f, .maxRecommendedDuty = 1.00f,
};
```

### 3.3 PWM mode

DRV8833 supports two PWM modes:
- **Slow decay** (IN1=PWM, IN2=HIGH): smoother current at small duty, less audible.
- **Fast decay** (IN1=PWM, IN2=LOW): faster transient response, more audible.

HapticBlaze defaults to **slow decay** at 30 kHz, configurable per channel via a `pwmMode` field exposed to the portal as a checkbox.

### 3.4 Faults

The chip's `nFAULT` pin is an open-drain output. v1.0 ignores it; v1.1 will wire it to an interrupt and surface to `/json/diag`.

---

## 4. DRV2605L

**Why it matters.** Dedicated haptic driver, I²C, on-chip waveform library (123 effects), auto-resonance tracking for LRAs. The gold standard for LRA actuators.

### 4.1 Wiring

| Index | Signal | Notes                                  |
| ----- | ------ | -------------------------------------- |
| 0     | EN     | Active-high enable. Tie to GPIO.       |
| 1     | IN/TRIG| Optional; tied LOW for I²C mode.       |
| 2-7   | reserved (uses I2C bus pins below).    |

I²C pins via `cfg.sda` / `cfg.scl`; default `0x5A`.

### 4.2 Capabilities

```cpp
DriverCaps{
    .channels = 1,
    .bidirectional = false,
    .brake = true,                  // via 0x0C STOP register
    .onChipLibrary = true,          // ROM 0..123 effects
    .closedLoop = true,             // auto-resonance for LRA
    .maxPwmHzPerChannel = 0,        // not a PWM driver from our POV
    .minDuty = 0.0f, .maxRecommendedDuty = 1.0f,
};
```

### 4.3 Two modes

HapticBlaze drives DRV2605L in two complementary modes:

- **Real-Time Playback (RTP) mode (mode register 0x05).**
  Continuous 8-bit amplitude register. `write(0, v)` maps `v` → 0..127 (LRA) or 0..255 (ERM unsigned), written to register `0x02`. This is how arbitrary patterns ride through — including audio-reactive.

- **Library trigger mode (mode 0x00).**
  Patterns that opt in to "use on-chip library" call `Pattern::triggerOnChip(effectId)` which the HAL maps to the waveform sequencer (reg `0x04..0x0B`) + Go (`0x0C |= 0x01`). Used by patterns like `BuzzClick`, `Notification`, `SharpDouble` — see [PATTERN_LIBRARY.md](PATTERN_LIBRARY.md).

The HAL switches modes automatically on the first call of each kind.

### 4.4 Calibration

On `begin()`, the driver runs **auto-calibration** (mode 0x07) if `cfg.pins[2]` is set to a non-negative value indicating "actuator type" flag (ERM=0, LRA=1). Calibration takes ~1 s; engine remains IDLE until done. Calibration constants (A_CAL_COMP, A_CAL_BEMF, FB_CTRL) are persisted to NVS keyed by actuator type so subsequent boots skip the wait.

### 4.5 LRA resonance

For LRAs, `cfg.pwmHz` is repurposed as the resonant frequency (e.g., 175 Hz for Vybronics VG0832). Auto-resonance tracking handles drift; the closed-loop bit lets the chip stay locked under varying load.

---

## 5. Raw MOSFET PWM (low-side)

**Why it matters.** Strip away every IC. A logic-level N-channel MOSFET (e.g., AO3400, IRLZ44N), a flyback diode, and a coil. Maximum hackability, minimum BOM.

### 5.1 Wiring

| Index | Signal       | Notes                                    |
| ----- | ------------ | ---------------------------------------- |
| 0     | Gate ch 0    | LEDC-capable GPIO → MOSFET gate via 220 Ω. |
| 1     | Gate ch 1    | optional second MOSFET.                  |
| 2     | Gate ch 2    | optional.                                |
| 3     | Gate ch 3    | optional.                                |
| 4-7   | reserved.                                |

User declares "how many MOSFETs are wired" by setting pins to -1 in unused slots. `channelCount()` reflects the count of non-negative pins, capped at 4.

### 5.2 Capabilities

```cpp
DriverCaps{
    .channels = up to 4,
    .bidirectional = false,
    .brake = false,
    .onChipLibrary = false, .closedLoop = false,
    .maxPwmHzPerChannel = 40000,
    .minDuty = 0.05f, .maxRecommendedDuty = 1.0f,
};
```

### 5.3 Safety advisory rendered in portal

The setup page for MOSFET mode shows a non-dismissable callout:

> **You are responsible for flyback protection.** Coils without a Schottky diode across them will fly the gate driver of your MOSFET and possibly your ESP32 GPIO. Inspect your wiring before powering up. HapticBlaze writes a 1 Hz, 30 % heartbeat for the first 5 seconds — listen and feel that the actuator is alive and stable before continuing.

This text is asserted by a UI test (it has bitten makers before).

### 5.4 Implementation

- One LEDC channel per gate, 20 kHz default, 10-bit.
- `writeSigned` renders `|v|` (unidirectional).
- `allOff()` writes duty 0 to every channel.

---

## 6. LEDC channel allocator

Across all PWM-based drivers, channels are allocated by a small singleton:

```cpp
class LedcAllocator {
public:
    int8_t allocate(uint8_t pin, uint32_t hz, uint8_t bits);
    void   release(uint8_t pin);
};
```

It tracks 16 LEDC channels (group 0+1, 0..15) and chooses a free one that supports the requested frequency / resolution combination. Drivers never address LEDC channels by number directly.

## 7. Pin sanity rules

The factory rejects (returns `begin()=false`) if:
- A pin appears more than once across all assigned slots.
- A pin is the strapping pin in a problematic state (GPIO 0, 2, 5, 12, 15) AND the user did not explicitly set `allowStrappingPins=true`.
- A pin is input-only (34..39) and is assigned to an output role.
- Total requested LEDC channels exceed 16.

These checks live in `hal/PinSanity.cpp` and are unit-testable on host.

## 8. Adding a new driver

See [ARCHITECTURE.md §8](ARCHITECTURE.md). The conformance test is the contract.
