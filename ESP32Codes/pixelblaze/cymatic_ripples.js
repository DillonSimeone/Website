/*
  ==============================================================================
  Sound - Cymatic Ripples & Traveling Wavefronts (Pixelblaze v2 & v3)
  ==============================================================================

  Sensory Substitution & Acoustic Wave Physics:
  Instead of static blinking pixels, this pattern visualizes sound through the
  lens of CYMATICS—the physical propagation of acoustic vibrations through a
  medium (like water ripples or soundwaves traveling through a tactile floor).

  Key Innovations for Deaf & Hard-of-Hearing (DHH) Perception:
  1. Acoustic Wavelength Translation:
     - Real low-frequency sound has long wavelengths (meters long) and high mass.
       Bass kicks spawn broad, heavy, slow-rolling crimson/orange tidal waves.
     - High frequencies have short wavelengths (centimeters) and rapid velocity.
       Cymbals and hi-hats spawn razor-sharp, ultra-fast violet shock pulses.
     - Midrange vocals and melodies spawn fluid cyan and emerald ripples.

  2. Visible Rhythm, Tempo, and Propagation:
     - The physical distance between expanding wavefronts directly displays the
       tempo (BPM) and rhythmic spacing of the song.
     - A deaf observer can visually anticipate beat drops and track rhythmic
       syncopation as waves travel smoothly outward.

  3. Constructive Wave Interference (Additive Blending):
     - When a fast violet treble ripple overtakes a slow red bass wave, their
       fields constructively interfere, creating a luminous polychromatic burst
       at the collision crest (e.g. Red + Cyan -> brilliant white-yellow peak).

  4. Dual 1D & 2D Geometry:
     - 1D Strips: Waves propagate symmetrically from center to ends (or linear).
     - 2D Matrices: Waves expand as true circular concentric ripples from center.

  5. Monotonic Chromatic Scale (0.00 Red -> 0.82 Violet):
     - Low sub-bass is crimson red; high treble is radiant violet. Frequencies
       never wrap around into ambiguous color collisions.
*/

// --- Sensor Expansion Board Inputs ---
export var frequencyData = array(32) // 32 frequency bins (37.5 Hz -> 9.96 kHz)
export var energyAverage = -1        // Overall loudness across all frequencies
export var maxFrequency              // Loudest detected frequency in Hz
export var maxFrequencyMagnitude     // Magnitude of loudest detected tone

// --- UI Sliders (Interactive controls in Pixelblaze UI) ---
var speedMod = 1.0
var widthMod = 1.0
var userGain = 1.0
var directionMode = 0 // 0 = Center-Outward (Symmetrical), 1 = Left-to-Right

export function sliderSpeed(v) {
  speedMod = 0.4 + v * 1.6
}

export function sliderWidth(v) {
  widthMod = 0.5 + v * 1.5
}

export function sliderGain(v) {
  userGain = 0.4 + v * 1.6
}

export function sliderDirection(v) {
  directionMode = v > 0.5 ? 1 : 0
}

// --- Wavefront Pool Management ---
var MAX_WAVES = 12
var waveActive = array(MAX_WAVES)
var waveDist = array(MAX_WAVES)   // Current travel position (0.0 .. 1.0)
var waveSpeed = array(MAX_WAVES)  // Expansion velocity
var waveWidth = array(MAX_WAVES)  // Wavefront spatial thickness
var waveR = array(MAX_WAVES)      // Precomputed Red component
var waveG = array(MAX_WAVES)      // Precomputed Green component
var waveB = array(MAX_WAVES)      // Precomputed Blue component

// Initialize wave pool
for (var initW = 0; initW < MAX_WAVES; initW++) {
  waveActive[initW] = 0
  waveDist[initW] = 0
  waveSpeed[initW] = 0
  waveWidth[initW] = 0
  waveR[initW] = 0
  waveG[initW] = 0
  waveB[initW] = 0
}

// --- Fast Branchless HSV to RGB Precalculator ---
// Calculates RGB components when a wave is born to avoid per-pixel conversions
function setWaveColor(wIdx, h, s, v) {
  var k0 = (5 + h * 6) % 6
  var k1 = (3 + h * 6) % 6
  var k2 = (1 + h * 6) % 6
  waveR[wIdx] = v - v * s * max(0, min(min(k0, 4 - k0), 1))
  waveG[wIdx] = v - v * s * max(0, min(min(k1, 4 - k1), 1))
  waveB[wIdx] = v - v * s * max(0, min(min(k2, 4 - k2), 1))
}

/*
  Spawns a new acoustic traveling wavefront into the oldest available slot.
  Recycles active waves if the pool is saturated.
*/
function spawnWave(hue, speed, width, brightness) {
  var target = 0
  var maxD = -1

  for (var i = 0; i < MAX_WAVES; i++) {
    if (!waveActive[i]) {
      target = i
      break
    }
    if (waveDist[i] > maxD) {
      maxD = waveDist[i]
      target = i
    }
  }

  waveActive[target] = 1
  waveDist[target] = 0
  waveSpeed[target] = speed * speedMod
  waveWidth[target] = width * widthMod
  setWaveColor(target, hue, 1.0, clamp(brightness * userGain, 0.1, 1.8))
}

// --- Multi-Band Transient / Onset Trackers ---
var bassAvg = 0.01, midAvg = 0.01, highAvg = 0.01
var bassCooldown = 0, midCooldown = 0, highCooldown = 0

// Ambient floor glow
var ambientGlow = 0

export function beforeRender(delta) {
  // Read sensor board or fallback simulator
  var fData, curEnergy
  if (energyAverage == -1) {
    simulateSound()
    fData = _frequencyData
    curEnergy = _energyAverage
  } else {
    fData = frequencyData
    curEnergy = energyAverage
  }

  // 1. Advance all active wavefronts
  for (var w = 0; w < MAX_WAVES; w++) {
    if (waveActive[w]) {
      waveDist[w] += waveSpeed[w] * delta
      // Deactivate when wave has propagated past boundary
      if (waveDist[w] - waveWidth[w] > 1.05) {
        waveActive[w] = 0
      }
    }
  }

  // 2. Decrement onset cooldowns
  bassCooldown = max(0, bassCooldown - delta)
  midCooldown = max(0, midCooldown - delta)
  highCooldown = max(0, highCooldown - delta)

  // 3. Multi-Band Energy Integration
  // Bass Band: Bins 0-3 (~37.5 - 125 Hz)
  var bEnergy = fData[0] + fData[1] * 1.2 + fData[2] + fData[3] * 0.8
  // Mid Band: Bins 4-15 (~163 - 1170 Hz)
  var mEnergy = 0
  var maxMidBin = 4, maxMidMag = 0
  for (var mb = 4; mb <= 15; mb++) {
    mEnergy += fData[mb]
    if (fData[mb] > maxMidMag) {
      maxMidMag = fData[mb]
      maxMidBin = mb
    }
  }
  // High Band: Bins 16-31 (~1370 - 9960 Hz)
  var hEnergy = 0
  for (var hb = 16; hb <= 31; hb++) {
    hEnergy += fData[hb]
  }

  // 4. Update adaptive moving average floors
  bassAvg = bassAvg * 0.94 + bEnergy * 0.06
  midAvg = midAvg * 0.95 + mEnergy * 0.05
  highAvg = highAvg * 0.96 + hEnergy * 0.04

  // 5. Onset Triggering (Physical Wavefront Spawning)
  // Bass Onset: Heavy, broad, slow, Crimson Red / Vermilion (0.01 - 0.04 hue)
  if (bassCooldown <= 0 && bEnergy > bassAvg * 1.3 + 0.006) {
    var bHue = 0.01 + clamp(fData[3] / (bEnergy + 0.001) * 0.05, 0, 0.05)
    spawnWave(bHue, 0.00038, 0.18, bEnergy * 35.0)
    bassCooldown = 130 // Cooldown prevents flutter
  }

  // Midrange Onset: Fluid melody, medium speed/width, Emerald to Electric Cyan
  if (midCooldown <= 0 && mEnergy > midAvg * 1.35 + 0.005) {
    var mHue = clamp(0.18 + (maxMidBin - 4) / 11.0 * 0.32, 0.18, 0.52)
    spawnWave(mHue, 0.00075, 0.09, mEnergy * 28.0)
    midCooldown = 90
  }

  // High Frequency Onset: Shimmer/cymbals, rapid razor pulse, Royal Blue to Radiant Violet
  if (highCooldown <= 0 && hEnergy > highAvg * 1.4 + 0.004) {
    var hHue = 0.68 + random(0.14) // 0.68 (Blue) -> 0.82 (Violet)
    spawnWave(hHue, 0.0014, 0.038, hEnergy * 32.0)
    highCooldown = 55
  }

  // Subtle ambient breathing floor based on total sound energy
  ambientGlow = clamp(curEnergy * 8.0 * userGain, 0.0, 0.15)
}

// --- 1D Pixel Renderer ---
export function render(index) {
  // Coordinate mapping
  var pos
  if (directionMode == 0) {
    // Symmetrical Center-Outward: 0.0 at center, 1.0 at outer ends
    pos = abs((index / (pixelCount - 1)) - 0.5) * 2.0
  } else {
    // Unidirectional Flow: 0.0 at beginning, 1.0 at far end
    pos = index / (pixelCount - 1)
  }

  var r = ambientGlow * 0.2
  var g = ambientGlow * 0.1
  var b = ambientGlow * 0.3

  // Accumulate optical wave superposition across all active wavefronts
  for (var w = 0; w < MAX_WAVES; w++) {
    if (waveActive[w]) {
      var d = abs(pos - waveDist[w])
      var wWidth = waveWidth[w]

      if (d < wWidth) {
        // Smoothstep bell-curve envelope (zero trig overhead, buttery smooth)
        var val = 1.0 - (d / wWidth)
        var env = val * val * (3.0 - 2.0 * val)

        // Attenuation as wave expands toward edges (conservation of energy)
        var decay = max(0.0, 1.0 - waveDist[w] * 0.55)
        var att = env * decay

        // Additive optical interference
        r += waveR[w] * att
        g += waveG[w] * att
        b += waveB[w] * att
      }
    }
  }

  // Perceptual gamma output with clamp
  rgb(clamp(r * r, 0, 1), clamp(g * g, 0, 1), clamp(b * b, 0, 1))
}

// --- 2D Matrix Renderer (True 2D Concentric Ripples) ---
export function render2D(index, x, y) {
  // Calculate Euclidean distance from matrix center (0.5, 0.5)
  var dx = (x - 0.5) * 2.0
  var dy = (y - 0.5) * 2.0
  var pos = sqrt(dx * dx + dy * dy)

  var r = ambientGlow * 0.2
  var g = ambientGlow * 0.1
  var b = ambientGlow * 0.3

  for (var w = 0; w < MAX_WAVES; w++) {
    if (waveActive[w]) {
      var d = abs(pos - waveDist[w])
      var wWidth = waveWidth[w]

      if (d < wWidth) {
        var val = 1.0 - (d / wWidth)
        var env = val * val * (3.0 - 2.0 * val)
        var decay = max(0.0, 1.0 - waveDist[w] * 0.55)
        var att = env * decay

        r += waveR[w] * att
        g += waveG[w] * att
        b += waveB[w] * att
      }
    }
  }

  rgb(clamp(r * r, 0, 1), clamp(g * g, 0, 1), clamp(b * b, 0, 1))
}

// --- 3D Volumetric & 6-Sided Cube Renderer (Spherical Cymatic Wavefronts) ---
export function render3D(index, x, y, z) {
  // Calculate distance from cube center (0.5, 0.5, 0.5)
  var dx = x - 0.5
  var dy = y - 0.5
  var dz = z - 0.5
  var rawDist = sqrt(dx * dx + dy * dy + dz * dz)

  // Normalize: 0.0 at face center (dist ~0.5), 1.0 at outer cube corners (dist ~0.866)
  var pos = clamp((rawDist - 0.5) / 0.366, 0.0, 1.0)

  var r = ambientGlow * 0.2
  var g = ambientGlow * 0.1
  var b = ambientGlow * 0.3

  for (var w = 0; w < MAX_WAVES; w++) {
    if (waveActive[w]) {
      var d = abs(pos - waveDist[w])
      var wWidth = waveWidth[w]

      if (d < wWidth) {
        var val = 1.0 - (d / wWidth)
        var env = val * val * (3.0 - 2.0 * val)
        var decay = max(0.0, 1.0 - waveDist[w] * 0.55)
        var att = env * decay

        r += waveR[w] * att
        g += waveG[w] * att
        b += waveB[w] * att
      }
    }
  }

  rgb(clamp(r * r, 0, 1), clamp(g * g, 0, 1), clamp(b * b, 0, 1))
}


// =============================================================================
// Offline Multi-Track Synthesizer Simulation Engine
// (Active only when Sensor Expansion Board is disconnected)
// =============================================================================

var BPM = 124
var measurePeriod = 4 * 60 / BPM
var samplesPerMeasure = ceil(measurePeriod * 40)

var _energyAverage = 0, _maxFrequency = 0, _maxFrequencyMagnitude = 0
var _frequencyData = array(32)

var freqs = array(32)
freqs[0] = 37.5; freqs[1] = 50; freqs[2] = 75; freqs[3] = 100; freqs[4] = 125
freqs[5] = 163; freqs[6] = 195; freqs[7] = 234; freqs[8] = 312; freqs[9] = 391
freqs[10] = 469; freqs[11] = 586; freqs[12] = 703; freqs[13] = 859; freqs[14] = 976
freqs[15] = 1170; freqs[16] = 1370; freqs[17] = 1560; freqs[18] = 1800; freqs[19] = 2070
freqs[20] = 2380; freqs[21] = 2730; freqs[22] = 3120; freqs[23] = 3590; freqs[24] = 4100
freqs[25] = 4650; freqs[26] = 5310; freqs[27] = 6020; freqs[28] = 6840; freqs[29] = 7770
freqs[30] = 8790; freqs[31] = 9960

var beat, beatPct, timeSlot, sequencerPos, sequencerSlot
function calcSequencerTime() {
  var t1 = time(measurePeriod / 65.536)
  beat = floor(t1 * 4)
  beatPct = (t1 * 4) % 1
  timeSlot = floor(t1 * samplesPerMeasure)
  sequencerPos = 16 * t1
  sequencerSlot = floor(sequencerPos)
}

var cachedTimeSlot = -1
function simulateSound() {
  calcSequencerTime()
  if (timeSlot == cachedTimeSlot) return

  var energyTotal = 0, maxBin = 0, maxBinEnergy = 0
  for (var fBin = 0; fBin < 32; fBin++) {
    var binEnergy = simulateFrequencyData(fBin)
    energyTotal += binEnergy
    if (binEnergy > maxBinEnergy) {
      maxBin = fBin
      maxBinEnergy = binEnergy
    }
  }
  _energyAverage = energyTotal / 32
  _maxFrequency = binomSample(freqs[maxBin], 8)
  _maxFrequencyMagnitude = binomSample(maxBinEnergy, 8)
  cachedTimeSlot = timeSlot
}

var instrumentCount = 4
var instruments = array(instrumentCount)
// 1. Kick Drum: 4-on-the-floor beat, sub-bass bin 1 (~50 Hz)
instruments[0] = makeInstrument(0b1000100010001000, 1, 2, 0.028)
// 2. Bassline: Grooving syncopated bass, bin 4 (~125 Hz)
instruments[1] = makeInstrument(0b0010001000100100, 4, 3, 0.020)
// 3. Lead Synth: Expressive melodic lead, midrange bin 10 (~469 Hz)
instruments[2] = makeInstrument(0b0100101001001100, 10, 4, 0.016)
// 4. Hi-Hats / Shimmer: 16th notes percussive air, high bin 24 (~4100 Hz)
instruments[3] = makeInstrument(0b1010101010101010, 24, 6, 0.014)

function makeInstrument(sequence, centerBin, bandwidth, magnitude) {
  var inst = array(4)
  inst[0] = sequence
  inst[1] = centerBin
  inst[2] = bandwidth
  inst[3] = magnitude
  return inst
}

function simulateFrequencyData(fBin) {
  var slotProximity = 1 - (sequencerPos % 1)
  var fDataBinSum = 0
  for (var inst = 0; inst < instrumentCount; inst++) {
    if ((instruments[inst][0] >> (15 - sequencerSlot)) & 1) {
      var binProximity = max(0, 1 - abs(fBin - instruments[inst][1]) / instruments[inst][2])
      fDataBinSum += binomSample(instruments[inst][3], 3) * slotProximity * binProximity
    }
  }
  _frequencyData[fBin] = fDataBinSum
  return fDataBinSum
}

function binomSample(mean, concentration) {
  var sum = 0
  for (var i = 0; i < concentration; i++) {
    sum += random(1)
  }
  return mean * (0.5 + sum / concentration)
}
