# CH32V003 Thermal Haptics

An experimental dry-wetness illusion: music produces synchronized vibration
and cooling so a dry touch surface can feel wet. A MAX4466 detects beats, a
coin vibration motor supplies tactile transients, and a Peltier supplies the
slow thermal cue.

## Important limitation

This prototype has **no surface or hot-side temperature sensor**. Firmware
timers cannot detect a stalled fan, detached heatsink, hot room, blocked
airflow, or unexpectedly cold touch plate. The limits in this code reduce
risk; they do not make unsupervised skin contact safe.

- Use only as a supervised, short-touch prototype.
- Never strap, clamp, or hold a body part against the cold plate.
- Stop on pain, numbness, whitening skin, or persistent tingling.
- Test the assembly before each session with an external thermometer if one is
  available. Do not rely on the AHT20/BMP280: it measures nearby air, not the
  Peltier junction or touch plate.
- Keep water/condensation away from exposed electronics and mains-powered
  connections. A wet finger also transfers heat faster, increasing cold-injury
  risk.

The fan must run whenever the 12 V supply is on. Do not place the fan under
software control.

## Architecture

```text
MAX4466 OUT -> PC4 ADC -> adaptive onset detector -> BPM estimate
                                      |                |
                                      v                v
                               vibration pulse    guarded TEC duty
                                      |                |
                               mini L298N          MOSFET switch
                                      |                |
                                coin motor         TEC1-12706
```

The mini L298N drives only the small vibration motor. It cannot safely drive a
TEC1-12706. The Peltier uses the separate high-current MOSFET switch.

## Pin map

| CH32V003 pin | Connection | Function |
|---|---|---|
| PC4 | MAX4466 OUT | ADC channel 2 |
| PD2 | MOSFET module PWM/trigger | TIM1_CH1, Peltier power |
| PD3 | Mini L298N channel A IN1 | TIM2_CH2, vibration PWM |
| PC3 | Mini L298N channel A IN2 | Held LOW |
| PD1 | WCH-LinkE SWIO | Programming only |
| V | MAX4466 VCC / driver logic as appropriate | Board USB rail |
| G | All low-voltage grounds | Common reference |

PD2 and PD3 are logic signals only. They never carry motor or Peltier current.

## Power wiring

### Peltier path

1. Connect the 12 V/4 A supply to the MOSFET module's power input, observing
   its printed `+` and `-` labels.
2. Connect the TEC1-12706 to the module's switched output.
3. Connect PD2 to the module's PWM/trigger input.
4. Connect the module signal ground to CH32V003 ground.
5. Connect the 12 V fan directly across the supply, before the MOSFET switch.
6. Mount the fan and a substantial heatsink to the Peltier hot side before
   enabling power. Use thermal paste and firm, even clamping pressure.

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
