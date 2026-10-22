# CH32V003 Thermal Haptics

An experimental thermal response project: ambient sound/music volume sampled by a MAX4466 directly controls the cooling PWM power of a TEC1-12706 Peltier element via high-current MOSFET module.

## Architecture

```text
MAX4466 OUT -> PC4 ADC (Ch 2) -> Mean Absolute Deviation -> Direct Duty Mapping -> PD4 TIM2_CH1 PWM -> MOSFET Switch -> TEC1-12706
```

## Pin map

> 🎨 **[View HTML Visual Pinout & Hardware Map](pinout.html)**

| CH32V003 pin | Connection | Function |
|---|---|---|
| PC4 | MAX4466 OUT | ADC Channel 2 (Audio input) |
| PD4 | MOSFET Module PWM/Trigger | TIM2_CH1 (Peltier cooling PWM) |
| PD1 | WCH-LinkE SWIO | Programming / Debug only |
| V | MAX4466 VCC / Logic Power | Board USB / 3.3V-5V rail |
| G | All grounds | Shared common GND reference |

PD4 is a 3.3V logic signal only. It drives the MOSFET gate trigger and never carries Peltier load current directly.

## Power wiring

### Peltier path

1. Connect the 12 V / 4 A supply to the MOSFET module's power input (`+` and `-`).
2. Connect the TEC1-12706 Peltier to the module's switched output terminals.
3. Connect **PD4** to the module's PWM/trigger input.
4. Connect the MOSFET module signal ground to the CH32V003 GND rail.
5. Connect the 12 V cooling fan directly across the 12 V power supply (always-on).
6. Mount the heatsink + fan assembly to the Peltier hot side with thermal paste before powering on.


MOSFET modules vary. Follow the labels printed on the exact board; do not infer
input/output screw terminals from product photos.

The 4 A label is not a safe current limiter. A TEC1-12706 can demand roughly
5–6 A during each PWM ON pulse, so a 4 A supply may current-limit, hiccup, or
overheat. Begin with `TEC_DUTY_MAX_PERCENT` below the supplied 40% default and
verify supply behavior. Average-duty arithmetic does not remove peak current.

Do **not** place a large capacitor directly across the switched Peltier output.
It creates charging surges and changes the intended PWM behavior. Ordinary
supply-side decoupling should follow the power supply and MOSFET-module
manufacturer's guidance.

### Vibration path

1. Connect the mini L298N channel A output to the coin vibration motor.
2. Connect PD3 to channel A `IN1`.
3. Connect PC3 to channel A `IN2`.
4. Power the motor side at the motor's rated voltage and share ground with the
   CH32V003.

Most coin vibration motors are rated near 3 V. Do not assume the motor accepts
12 V. A 12 V PWM pulse is still a 12 V pulse and can damage a 3 V motor even
when average duty looks low. Use an appropriate 3–5 V motor supply or regulator
and check the exact motor rating.

If "coin cell" means a coin-cell **battery**, do not use it for either load.
Coin cells cannot supply a Peltier and are generally poor motor sources. This
project expects a coin-style vibration motor.

### MAX4466

| MAX4466 | CH32V003 |
|---|---|
| VCC | Board `V` rail |
| GND | GND |
| OUT | PC4 |

On this TENSTAR board, USB-C places about 5 V on `V`, and the CH32V003 operates
at that VDD. Never connect the WCH-LinkE target-power pin and USB-C power at the
same time. Connect SWIO and GND while using independent USB-C power.

## Firmware behavior

- Audio is sampled at 8 kHz in 64-sample frames.
- Mean absolute deviation provides a compact volume envelope.
- A slow adaptive noise floor rejects steady background sound.
- Rising transients above the adaptive threshold count as beats.
- Up to six recent valid beat intervals produce an estimated 45–200 BPM.
- Each detected beat generates an 85 ms vibration pulse.
- At 60 BPM the Peltier starts at 8% duty; it rises toward 40% at 180 BPM.
- Peltier duty ramps rather than jumping.
- Cooling is allowed for at most 20 seconds, followed by a forced 40-second
  zero-duty recovery period.
- If no beat is detected for 2.5 seconds, cooling ramps to zero.

This is onset estimation, not a full musical tempo tracker. Double-time and
half-time readings are possible and should be tuned with the intended music.

## First power-up

1. Leave the TEC disconnected and flash the firmware.
2. Test MAX4466 beat response with only the coin motor connected.
3. Confirm PD2 starts LOW with a multimeter or oscilloscope.
4. Assemble the Peltier, thermal paste, heatsink, and always-on fan.
5. Set `TEC_DUTY_MAX_PERCENT` to 15 and connect the TEC.
6. Confirm correct hot/cold orientation within a few seconds. Power off
   immediately if the heatsink does not warm or the intended plate does not
   cool.
7. Increase the limit in small steps only while checking supply behavior,
   heatsink temperature, and touch-plate temperature externally.

Do not run a bare Peltier without its heatsink and fan, even briefly.

## Main tuning controls

All are near the top of `src/main.c`:

| Setting | Default | Purpose |
|---|---:|---|
| `BEAT_ABSOLUTE_MARGIN` | 8 | Fixed amount above background |
| `BEAT_RELATIVE_PERCENT` | 45 | Relative onset threshold |
| `BEAT_REFRACTORY_MS` | 250 | Prevents duplicate beats |
| `MOTOR_PULSE_MS` | 85 | Vibration length per onset |
| `TEC_DUTY_MAX_PERCENT` | 40 | Maximum commanded Peltier duty |
| `TEC_ACTIVE_LIMIT_MS` | 20000 | Maximum cooling window |
| `TEC_FORCED_COOLDOWN_MS` | 40000 | Mandatory recovery window |

False beats: increase either beat threshold. Missed beats: decrease one
threshold gradually. Do not increase the Peltier limit to fix beat detection.

## Build and flash

Connect WCH-LinkE `SWIO` to PD1 and `GND` to GND, then run:

```bat
upload.bat
```

Or from this directory:

```bat
pio run
pio run --target upload
```

When the board is powered from USB-C, leave the LinkE target-voltage output
disconnected.

## Recommended next hardware upgrade

The highest-value addition is a contact temperature sensor on the touch plate
and another on the hot-side heatsink. That enables real limits instead of
timer-only guesses. Until then, keep the conservative cooling/recovery cycle
and treat this as a supervised experiment.
