# CH32V003Haptics

Sound-reactive haptics on a **TENSTAR CH32V003F4P6** module using a **MAX4466** mic and a **bidirectional H-bridge**.

A tiny fixed-point 64-point FFT splits audio into three bands and plays a different motor pattern for each:

| Band | Approx. Hz | Pattern |
|------|------------|---------|
| Low | 125–375 | `tap  tap` (two short pulses, forward) |
| Mid | 500–1125 | Sustained spin (forward PWM) |
| High | 1250–3000 | `tap  taaaap  tap  taaaap` (short/long, reversing) |

An external LED on **PC3** uses hardware PWM to display the smoothed overall microphone volume independently of the selected frequency band.

Framework: **ch32v003fun** (lightweight, fits 16 KB flash / 2 KB RAM).  
Probe: **WCH-LinkE** (required for CH32V003 — plain WCH-Link is not enough).

---

## 1. One-time Windows environment setup

### 1.1 PlatformIO CH32V platform

Already installable with:

```bat
pio pkg install -g -p https://github.com/Community-PIO-CH32V/platform-ch32v.git
```

This pulls the RISC-V GCC toolchain and OpenOCD / wlink helpers used to talk to the LinkE.

### 1.2 WCH-LinkE USB drivers

Drivers were downloaded to:

`%USERPROFILE%\Downloads\WCHLink-Driver-Windows\wchlink-driver-windows-main\`

Install **both** (run as Administrator if Windows asks):

1. `WCHLink\SETUP.EXE` — debug interface driver  
2. `WCHLinkSER\SETUP.EXE` — USB-serial (CDC) side of the LinkE  

Then plug in the LinkE and check **Device Manager**:

- An interface / WCH-Link device should appear  
- A COM port should appear for the serial side  

**RISC-V mode check:** the LinkE must enumerate as **VID:PID `1A86:8010`**.  
If you see `1A86:8012`, it is in ARM/DAP mode — hold the **ModeS** button while plugging in (or use WCH-LinkUtility) to switch back to RISC-V mode.

Optional (firmware update / brick recovery): [WCH-LinkUtility](https://www.wch.cn/downloads/WCH-LinkUtility_ZIP.html)

---

## 2. Wire the WCH-LinkE (flash / debug)

CH32V003 uses a **1-wire** debug interface (SWIO). You only need three wires:

| WCH-LinkE | TENSTAR board center pad |
|-----------|--------------------------|
| **3V3** | **V** (only with USB-C disconnected) |
| **GND** | **G** |
| **SWDIO / SWIO / TMS** | **SWD** (internally PD1/SWIO) |

Notes:

- The board labels its single-wire programming pad **SWD** even though the MCU signal is **PD1/SWIO**.
- Do **not** use PD1 as a normal GPIO while debugging — it is the SWIO pin.  
- Prefer powering the board from the LinkE **3V3** while developing.  
- Never connect the LinkE **3V3** output while USB-C or another supply is powering the board.
- The LinkE's **RX/TX** pins are UART signals, not programming pins.

```
  WCH-LinkE                 CH32V003F4P6
  ---------                 ------------
  3V3  -------------------- V
  GND  -------------------- G
  SWIO -------------------- SWD (PD1 internally)
```

Board feature and sanity-test reference: [`board-guide.html`](board-guide.html)

---

## 2.1 Power rail: 3.3 V or 5 V

The CH32V003 accepts approximately **2.7–5.5 V** on VDD. This board's pads marked **V** are expected to be one shared VCC rail:

- **USB-C power (confirmed):** V pins — including the center programming "3.3 V" pad — measure about **5 V**.
- **WCH-LinkE power:** V pins are about **3.3 V**.

All **V** pads are one shared rail. The board runs fine at 5 V (VDD range ~2.7–5.5 V), but at 5 V every GPIO high and the ADC reference are 5 V.

When using USB-C power, connect only **SWD** and **GND** to the LinkE. Do not join its 3.3 V output to the board's 5 V rail.

---

## 3. Build and flash

### Option A — one-click

Double-click [`upload.bat`](upload.bat) in this folder.

### Option B — PlatformIO CLI

```bat
cd PlatformIO\02_Audio_Haptics\CH32V003Haptics
pio run
pio run -t upload
```

Default env: `genericCH32V003F4P6`  
Default upload protocol: `wch-link` (OpenOCD via the LinkE)

If OpenOCD misbehaves, try in `platformio.ini`:

```ini
upload_protocol = minichlink
; or
upload_protocol = wlink
```

---

## 4. Application wiring

### MAX4466 microphone

| MAX4466 | CH32V003 |
|---------|----------|
| VCC | Board **V** rail |
| GND | GND |
| OUT | **PC4** (ADC channel 2) |

Powering the MAX4466 from the same **V** rail as the CH32 keeps its output within the ADC's 0-to-VDD range. If the board is at 5 V, PC4 and the mic may use 5 V; if the board is at 3.3 V, use 3.3 V. Do not let the mic output exceed MCU VDD.

### Volume LED

| LED connection | CH32V003 |
|----------------|----------|
| Anode (+, long leg), through 220Ω–1kΩ resistor | **PC3** (TIM1_CH3 PWM) |
| Cathode (−, short leg / flat edge) | GND |

Brightness is based on the mean absolute microphone amplitude after removing the MAX4466's DC bias. `LED_VOLUME_GATE` sets the off threshold, `LED_VOLUME_MAX` sets the level that reaches full brightness, and `VOLUME_SMOOTH_SHIFT` controls response smoothing.

### H-bridge motor driver (two direction inputs)

| Driver | CH32V003 | Role |
|--------|----------|------|
| IN1 | **PD2** (TIM1_CH1 PWM) | Forward |
| IN2 | **PD3** (TIM2_CH2 PWM) | Reverse |
| VM / motor supply | Separate battery / PSU | **Not** MCU V rail |
| GND | Shared with MCU GND | Required |

Firmware guarantees only one of IN1/IN2 is driven at a time, and both go low (coast) between direction changes.

**Critical:**

- Never drive a DC motor from a GPIO.  
- Give the motor its own supply sized for stall current.  
- Share grounds.  
- Keep motor wiring short; add the driver’s recommended flyback / bulk capacitance.

---

## 5. How the firmware behaves

1. Samples 64 ADC readings at ~8 kHz on PC4.  
2. Removes DC bias, applies a triangular window, runs a fixed-point FFT.  
3. Sums magnitude into low / mid / high bins.  
4. If one band clearly wins above the noise gate:
   - **Low** → two short forward taps  
   - **Mid** → continuous forward spin (duty tracks energy)  
   - **High** → short/long taps while flipping direction  

Tunables live at the top of [`src/main.c`](src/main.c):

- `ENERGY_GATE`, `BAND_MARGIN` — sensitivity / band separation  
- `PWM_DUTY_FLOOR`, `PWM_DUTY_MAX` — motor kick + max speed  
- `LED_VOLUME_GATE`, `LED_VOLUME_MAX` — LED volume range
- `VOLUME_SMOOTH_SHIFT` — LED attack/release smoothing
- `TAP_*_MS`, `PATTERN_GAP_MS` — rhythm  
- `BIN_*` — frequency ranges  

---

## 6. Recovery / troubleshooting

| Symptom | Fix |
|---------|-----|
| Upload can’t find probe | Install both driver SETUPs; replug LinkE |
| Wrong VID/PID (`8012`) | Switch LinkE to RISC-V mode |
| `Error: open failed` / OpenOCD timeout | Check V/GND/SWD wiring and power-source selection; try `minichlink` |
| Chip seems bricked | WCH-LinkUtility → erase flash (NRST method if needed) |
| Motor silent | Raise `PWM_DUTY_FLOOR`; verify IN1/IN2 vs your driver logic polarity |
| Always mid / always low | Raise `ENERGY_GATE` or adjust `BIN_*` / `BAND_MARGIN` |
| Mic flatline ~0 or ~1023 | Check MAX4466 VCC/GND/OUT → PC4 and confirm mic VCC matches MCU VDD |

---

## 7. Project layout

```
CH32V003Haptics/
  platformio.ini   Platform + board + LinkE upload
  upload.bat       One-click flash
  README.md        This guide
  src/
    funconfig.h    ch32v003fun options
    main.c         ADC + FFT + H-bridge patterns
```

## Specs

- MCU: CH32V003F4P6 @ 48 MHz  
- Flash / RAM budget: 16 KB / 2 KB  
- Probe: WCH-LinkE only (SDI / SWIO)  
- Audio: MAX4466 → PC4  
- Volume LED: PC3 / TIM1_CH3
- Actuator: H-bridge IN1/IN2 on PD2/PD3  
