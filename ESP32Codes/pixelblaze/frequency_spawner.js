/*
  ==============================================================================
  Deaf-Accessible Multi-Frequency Spawner (Pixelblaze v2 & v3)
  ==============================================================================
  
  Sensory Substitution & Visual Music Design:
  This pattern translates sound into visual music specifically optimized for
  Deaf and Hard-of-Hearing (DHH) individuals.
  
  Key Accessibility Innovations:
  1. Non-Wrapping Chromatic Scale (0.00 Red -> 0.82 Violet):
     Standard HSV wraps 1.0 back to 0.0 (Red). In music visualization, that
     causes sub-bass kicks and ultrasonic cymbals to look identical. We map
     frequencies monotonically across the 32 sensor board bins:
       - Sub-Bass & Kicks (37 - 100 Hz)   -> Deep Crimson Red & Vermilion
       - Basslines (100 - 250 Hz)          -> Warm Amber & Tangerine
       - Midrange / Vocals (250 - 2000 Hz) -> Yellow, Lime & Electric Cyan
       - Highs & Cymbals (2000 - 10000 Hz) -> Deep Royal Blue & Vibrant Violet
       
  2. Polyphony & Tri-Peak Detection (Option A: Global Top 3 with Spacing):
     Music is rarely a single note; it contains rhythm, melody, and percussive
     shimmer at the same time. The pattern analyzes the 32-band spectrum to
     extract the top 3 dominant frequency peaks using neighborhood suppression
     (preventing a single wide note from consuming multiple peaks):
       - Peak 1 (Dominant component): 60% of spawned pixels
       - Peak 2 (Secondary harmonic): 25% of spawned pixels
       - Peak 3 (Tertiary detail):    15% of spawned pixels
       
  3. Attack Transients & Visual Punch:
     High-amplitude attacks cause brief desaturation toward white ("white-hot
     core"), simulating visual persistence and tactile transients.
     
  4. Automatic Gain Control (PI Controller):
     Continuously tunes sensitivity to keep the visual field at ~22% average
     fill across whispers and loud concerts.
     
  5. Built-in 4-Track Offline Simulator:
     When no Sensor Board is connected (energyAverage == -1), the pattern
     automatically switches to a multi-track sequencer (Kick, Bass, Lead, Hi-Hat)
     so the pattern is immediately interactive in the simulator.
*/

// --- Sensor Expansion Board Inputs ---
export var frequencyData = array(32) // 32 frequency bins (37.5 Hz -> 9.96 kHz)
export var energyAverage = -1        // Overall loudness across all frequencies
export var maxFrequency              // Loudest detected frequency in Hz
export var maxFrequencyMagnitude     // Magnitude of loudest detected tone

// --- Pixel Buffers ---
var vals = array(pixelCount) // Current brightness (0..1)
var hues = array(pixelCount) // Assigned frequency hue (0..0.82)
var sats = array(pixelCount) // Saturation (0..1, dips on transients)

// Initialize buffers to safe default states
for (var initIdx = 0; initIdx < pixelCount; initIdx++) {
  vals[initIdx] = 0
  hues[initIdx] = 0
  sats[initIdx] = 1.0
}

// --- Top 3 Extracted Peaks ---
// Each peak stores: [0]=binIndex, [1]=magnitude, [2]=hue
var p1Bin = 0, p1Mag = 0, p1Hue = 0
var p2Bin = 0, p2Mag = 0, p2Hue = 0
var p3Bin = 0, p3Mag = 0, p3Hue = 0

// --- UI Sliders (Configurable in Pixelblaze UI) ---
var speedMod = 1.0
var decayRate = 0.0006
var userGain = 1.0

export function sliderSpeed(v) {
  speedMod = 0.3 + v * 1.7
}

export function sliderDecay(v) {
  decayRate = 0.0002 + v * 0.0012
}

export function sliderGain(v) {
  userGain = 0.4 + v * 1.6
}

// --- PI Controller (Automatic Gain Control) ---
var targetFill = 0.22
var brightnessFeedback = 0
var sensitivity = 1.0

// [0]=kp, [1]=ki, [2]=accumulatedError, [3]=minErr, [4]=maxErr
var pic = makePIController(0.05, 0.15, 300, 0, 1000)

function makePIController(kp, ki, start, min, max) {
  var p = array(5)
  p[0] = kp
  p[1] = ki
  p[2] = start
  p[3] = min
  p[4] = max
  return p
}

function calcPIController(p, err) {
  p[2] = clamp(p[2] + err, p[3], p[4])
  return max(p[0] * err + p[1] * p[2], 0.3)
}

/*
  Maps a frequency bin index (0 to 31) to a dedicated hue (0.0 to 0.82).
  By capping at 0.82 (Violet/Magenta), 0.00 (Red) is reserved exclusively for
  sub-bass, ensuring low and high frequencies are never confused visually.
*/
function binToHue(b) {
  return clamp(b / 31.0 * 0.82, 0.0, 0.82)
}

/*
  Extracts the Top 3 Peaks across the 32 frequency bins with neighborhood
  suppression (minimum distance of 2 bins) to ensure true polyphony.
*/
function extractTop3Peaks(fData) {
  var b, mag

  // 1. Find Peak 1 (Global maximum)
  p1Mag = 0; p1Bin = 0
  for (b = 0; b < 32; b++) {
    mag = fData[b]
    if (mag > p1Mag) {
      p1Mag = mag
      p1Bin = b
    }
  }
  p1Hue = binToHue(p1Bin)

  // 2. Find Peak 2 (Highest outside p1Bin +/- 2)
  p2Mag = 0; p2Bin = -1
  for (b = 0; b < 32; b++) {
    if (abs(b - p1Bin) > 2) {
      mag = fData[b]
      if (mag > p2Mag) {
        p2Mag = mag
        p2Bin = b
      }
    }
  }
  if (p2Bin >= 0) {
    p2Hue = binToHue(p2Bin)
  } else {
    p2Mag = p1Mag * 0.5
    p2Hue = p1Hue
  }

  // 3. Find Peak 3 (Highest outside p1Bin and p2Bin +/- 2)
  p3Mag = 0; p3Bin = -1
  for (b = 0; b < 32; b++) {
    if (abs(b - p1Bin) > 2 && (p2Bin < 0 || abs(b - p2Bin) > 2)) {
      mag = fData[b]
      if (mag > p3Mag) {
        p3Mag = mag
        p3Bin = b
      }
    }
  }
  if (p3Bin >= 0) {
    p3Hue = binToHue(p3Bin)
  } else {
    p3Mag = p2Mag * 0.5
    p3Hue = p2Hue
  }
}

// --- Main Frame Update ---
export function beforeRender(delta) {
  delta = delta * speedMod

  // Adjust sensitivity based on previous frame brightness feedback
  sensitivity = calcPIController(pic, targetFill - (brightnessFeedback / pixelCount)) * userGain
  brightnessFeedback = 0

  // Acquire frequency data (Live Sensor Board or Fallback Simulation)
  var currentFData
  var curEnergy = 0

  if (energyAverage == -1) {
    simulateSound()
    currentFData = _frequencyData
    curEnergy = _energyAverage
  } else {
    currentFData = frequencyData
    curEnergy = energyAverage
  }

  // Extract the top 3 polyphonic frequency peaks
  extractTop3Peaks(currentFData)

  // Pre-calculate effective peak strengths
  var s1 = p1Mag * sensitivity
  var s2 = p2Mag * sensitivity
  var s3 = p3Mag * sensitivity
  var overallActivity = curEnergy * sensitivity

  // Spawn and decay pixels
  for (var i = 0; i < pixelCount; i++) {
    // Fade out pixel according to elapsed time and background energy
    vals[i] -= decayRate * delta + (overallActivity * 0.0003)

    // Recover saturation as the pixel decays (attack was white-hot)
    if (sats[i] < 1.0) {
      sats[i] = min(1.0, sats[i] + 0.001 * delta)
    }

    // Re-spawn or spark decayed pixels based on frequency peak distribution
    if (vals[i] <= 0) {
      var roll = random(1.0)

      if (roll < 0.60) {
        // Peak 1: 60% probability (Primary dominant tone)
        vals[i] = random(1.0) * s1
        hues[i] = p1Hue
      } else if (roll < 0.85) {
        // Peak 2: 25% probability (Secondary harmonic/counter-melody)
        vals[i] = random(1.0) * s2
        hues[i] = p2Hue
      } else {
        // Peak 3: 15% probability (Tertiary percussion/air)
        vals[i] = random(1.0) * s3
        hues[i] = p3Hue
      }

      // Attack Flash: High energy transients desaturate toward bright white
      if (vals[i] > 0.65) {
        sats[i] = max(0.2, 1.0 - (vals[i] - 0.65) * 1.8)
      } else {
        sats[i] = 1.0
      }
    }
  }
}

// --- Render Each Pixel ---
export function render(index) {
  var v = clamp(vals[index], 0.0, 1.0)
  
  // Apply perceptual gamma correction (v^2) for clean, high-contrast dynamic range
  var displayV = v * v

  // Accumulate feedback for PI controller
  brightnessFeedback += displayV

  hsv(hues[index], sats[index], displayV)
}

// 2D Matrix Support (maps 2D coordinates seamlessly using the same engine)
export function render2D(index, x, y) {
  render(index)
}

// 3D Volumetric / Cube Support
export function render3D(index, x, y, z) {
  render(index)
}


// =============================================================================
// Offline Multi-Track Synthesizer Simulation Engine
// (Active only when Sensor Expansion Board is disconnected)
// =============================================================================

var BPM = 126
var measurePeriod = 4 * 60 / BPM
var samplesPerMeasure = ceil(measurePeriod * 40) // 40Hz sensor board update rate

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
instruments[0] = makeInstrument(0b1000100010001000, 1, 2, 0.025)
// 2. Bassline: Grooving bassline, low-mid bin 4 (~125 Hz)
instruments[1] = makeInstrument(0b0010001000100100, 4, 3, 0.018)
// 3. Lead Synth: Melodic syncopation, midrange bin 11 (~586 Hz)
instruments[2] = makeInstrument(0b0100101001001100, 11, 4, 0.015)
// 4. Hi-Hats / Shimmer: 16th notes percussive shimmer, high bin 24 (~4100 Hz)
instruments[3] = makeInstrument(0b1010101010101010, 24, 6, 0.012)

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
