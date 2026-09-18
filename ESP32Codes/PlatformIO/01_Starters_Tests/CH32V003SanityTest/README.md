# CH32V003 Sanity Test

First-flash test for the black TENSTAR CH32V003F4P6 minimum system board.

## What it verifies

- PlatformIO's CH32V toolchain can compile for the correct 16 KB / 2 KB target.
- The WCH-LinkE can program the chip through its single-wire debug interface.
- GPIO and timing are running.
- An external LED on **PC3** can be controlled.

The recognizable output is **three quick flashes followed by a one-second pause**.

## Confirmed on this board

The test was verified on the black TENSTAR CH32V003F4P6 board:

- **PC3** successfully drives an external 3 mm LED.
- **PD7 does not work as a normal blink output in the default configuration** because it is also `NRST`; driving it low resets the MCU and makes the LED appear continuously lit.
- No controllable onboard LED was identified on this board revision.

## WCH-LinkE wiring

Use the three center pads on the bottom of the board:

| WCH-LinkE | Board pad |
|---|---|
| SWDIO / TMS | **SWD** |
| 3V3 | **V** (only when USB-C is disconnected) |
| GND | **G** |

The board's `SWD` pad is internally connected to the MCU's **PD1/SWIO** pin. The LinkE's RX/TX pins are optional UART signals and are not used for flashing.

Do not power the board from USB-C and the LinkE 3V3 pin simultaneously.

## Build and flash

Run [`upload.bat`](upload.bat), or:

```bat
pio run
pio run -t upload
```

The LinkE must be in RISC-V mode. Windows should report USB VID:PID **1A86:8010**.

## External LED wiring

```text
PC3 ---- 220 ohm to 1 kohm resistor ---- LED anode (+, long leg)
GND ----------------------------------- LED cathode (-, short leg/flat edge)
```

Do not omit the resistor. Also avoid **PD7**: on CH32V003 it doubles as **NRST**. Turning the LED off pulls NRST low, resets the chip, and makes the LED look stuck on.

## Troubleshooting

- **LED stuck on (especially on PD7):** Move the anode to **PC3**. PD7 is NRST and resets when driven low.
- **No flashing:** Verify LED polarity, resistor, PC3, and the shared GND connection.
- **Probe not found:** Install both WCHLink and WCHLinkSER drivers and reconnect the LinkE.
- **Wrong LinkE mode:** Switch it to RISC-V mode; `1A86:8012` indicates ARM/DAP mode.
- **Upload crashes or times out:** Recheck `SWDIO→SWD`, `3V3→V`, and `GND→G`.
- **Still no flash:** Change `upload_protocol` in `platformio.ini` to `minichlink`, then retry.

For a fuller board reference, open:

[`../../02_Audio_Haptics/CH32V003Haptics/board-guide.html`](../../02_Audio_Haptics/CH32V003Haptics/board-guide.html)
