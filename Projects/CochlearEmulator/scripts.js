// ─── AUDIO ENGINE STATE ──────────────────────────────────────────────────
let audioCtx = null;
let inputNode = null;
let micStream = null;
let filterBank = []; // Array of { filter, analyser, envelope, freq }
let vocoderCarrierNodes = []; // Array of oscillators/gains
let noiseBufferNode = null;
let outputGainNode = null;
let pipelineInputGainNode = null;

// Telemetry & General State
let isProcessing = false;
let timeSec = 0;
let channelCount = 8;
let envelopes = new Array(8).fill(0);
let actuators = new Array(3).fill(0);
let smoothedActuators = new Array(3).fill(0);
let animationFrameId = null;

// Greenwood Formula Constants (Human)
const A = 165.4;
const a = 2.1;
const k = 0.85;

// Hoxel Scripting Engine
let currentScriptFunc = null;
let scriptErrorOccurred = false;

// Telemetry History
const telemetryHistory = [];
const historyLength = 200;

// Presets Dictionary
const PRESETS = {
  direct: `// Direct Multi-Channel Map
// Route low frequencies to Actuator 0 (LRA Bass)
actuators[0] = envelopes[0] * 1.6;

// Route mid frequencies to Actuator 1 (LRA Mid)
const midIndex = Math.floor(numChannels / 2);
actuators[1] = envelopes[midIndex] * 1.3;

// Route high frequencies to Actuator 2 (Solenoid) via threshold
const highIndex = numChannels - 1;
actuators[2] = envelopes[highIndex] > 0.4 ? 1.0 : 0.0;`,

  bassRumble: `// Low-Freq Core Rumble
// Aggregate energy of the lowest 3 bands
const lowEnergy = (envelopes[0] + envelopes[1] + envelopes[2]) / 3;

// Create a frequency modulated rumble on Actuator 0
actuators[0] = lowEnergy * (0.6 + Math.sin(t * 25) * 0.4);

// Actuator 1 tracks mid range transients
actuators[1] = envelopes[3] * 1.5;

// Actuator 2 is off
actuators[2] = 0.0;`,

  crossInterlocking: `// Overlapping Interlocking Waves
// Build a phase-offset rhythm driven by low energy
const lowEnergy = envelopes[0];

// Interlock Actuator 0 and Actuator 1 based on time waves
actuators[0] = lowEnergy * Math.max(0, Math.sin(t * 8));
actuators[1] = lowEnergy * Math.max(0, Math.cos(t * 8));

// Actuator 2 triggers on high frequency transients
actuators[2] = envelopes[numChannels - 1] > 0.3 ? 1.0 : 0.0;`,

  highFrequencyTap: `// High-Frequency Click/Tap
// Actuators 0 & 1 track audio envelopes directly
actuators[0] = envelopes[0] * 1.2;
actuators[1] = envelopes[2] * 1.2;

// Actuator 2 fires a brief 50ms click when high energy spikes
const highEnergy = envelopes[numChannels - 1];
if (highEnergy > 0.5) {
  // Rapid double pulse sequence
  actuators[2] = Math.sin(t * 40) > 0.0 ? 1.0 : 0.0;
} else {
  actuators[2] = 0.0;
}`,

  custom: `// Blank Canvas
// Inputs: envelopes[], numChannels, t
// Output: actuators[]

actuators[0] = 0.0;
actuators[1] = 0.0;
actuators[2] = 0.0;`
};

// ─── DOM ELEMENTS & UI BINDINGS ──────────────────────────────────────────
const audioSourceSelect = document.getElementById('audioSource');
const fileUploadRow = document.getElementById('fileUploadRow');
const audioFileInput = document.getElementById('audioFile');
const inputGainInput = document.getElementById('inputGain');
const inputGainVal = document.getElementById('inputGainVal');

const channelCountSelect = document.getElementById('channelCount');
const greenwoodMinInput = document.getElementById('greenwoodMin');
const greenwoodMinVal = document.getElementById('greenwoodMinVal');
const greenwoodMaxInput = document.getElementById('greenwoodMax');
const greenwoodMaxVal = document.getElementById('greenwoodMaxVal');
const envelopeCutoffInput = document.getElementById('envelopeCutoff');
const envelopeCutoffVal = document.getElementById('envelopeCutoffVal');

const vocoderTypeSelect = document.getElementById('vocoderType');
const vocoderVolumeInput = document.getElementById('vocoderVolume');
const vocoderVolumeVal = document.getElementById('vocoderVolumeVal');

const startAudioBtn = document.getElementById('startAudioBtn');
const stopAudioBtn = document.getElementById('stopAudioBtn');

const scriptPresetSelect = document.getElementById('scriptPreset');
const scriptTextarea = document.getElementById('scriptText');
const scriptStatusIndicator = document.getElementById('scriptStatusIndicator');
const errorConsole = document.getElementById('errorConsole');

const vibrateToggle = document.getElementById('vibrateToggle');
const freqBandList = document.getElementById('freqBandList');
const telemetryCanvas = document.getElementById('telemetryCanvas');
const telemetryCtx = telemetryCanvas.getContext('2d');

// Line numbering helper
const editorGutter = document.getElementById('editorGutter');
function updateLineNumbers() {
    const text = scriptTextarea.value;
    const lines = text.split('\n').length;
    let gutterHtml = '';
    for (let i = 1; i <= lines; i++) {
        gutterHtml += `<span>${i}</span>`;
    }
    editorGutter.innerHTML = gutterHtml;
}
scriptTextarea.addEventListener('input', () => {
    updateLineNumbers();
    compileScript(true);
});
updateLineNumbers();

// ─── CONTROL BINDINGS ───────────────────────────────────────────────────────
audioSourceSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    fileUploadRow.style.display = val === 'file' ? '' : 'none';
    if (isProcessing && audioCtx) {
        await switchAudioSource(val);
    }
});

audioFileInput.addEventListener('change', async () => {
    if (isProcessing && audioCtx) {
        await switchAudioSource('file');
    }
});

inputGainInput.addEventListener('input', (e) => {
    inputGainVal.textContent = (parseInt(e.target.value) / 10).toFixed(1) + 'x';
});

greenwoodMinInput.addEventListener('input', (e) => {
    greenwoodMinVal.textContent = e.target.value + ' Hz';
    rebuildFilterbankFrequencies();
});

greenwoodMaxInput.addEventListener('input', (e) => {
    greenwoodMaxVal.textContent = e.target.value + ' Hz';
    rebuildFilterbankFrequencies();
});

envelopeCutoffInput.addEventListener('input', (e) => {
    envelopeCutoffVal.textContent = e.target.value + ' Hz';
});

vocoderVolumeInput.addEventListener('input', (e) => {
    vocoderVolumeVal.textContent = e.target.value + '%';
    if (outputGainNode) {
        outputGainNode.gain.setValueAtTime(parseInt(e.target.value) / 100, audioCtx.currentTime);
    }
});

channelCountSelect.addEventListener('change', (e) => {
    channelCount = parseInt(e.target.value);
    envelopes = new Array(channelCount).fill(0);
    rebuildFilterbankFrequencies();
});

vocoderTypeSelect.addEventListener('change', () => {
    if (isProcessing && audioCtx) {
        setupFilterbankAudioNodes();
    }
});

scriptPresetSelect.addEventListener('change', (e) => {
    const presetCode = PRESETS[e.target.value];
    if (presetCode) {
        scriptTextarea.value = presetCode;
        updateLineNumbers();
        compileScript(false);
    }
});

startAudioBtn.addEventListener('click', startAudioProcessing);
stopAudioBtn.addEventListener('click', stopAudioProcessing);

// ─── GREENWOOD MAPPING FUNCTION ───────────────────────────────────────────
// Convert frequency to normalized cochlear position x (0 = Apex, 1 = Base)
function freqToCochlearPosition(f) {
    return (1 / a) * Math.log10((f / A) + k);
}

// Convert normalized cochlear position x to frequency
function cochlearPositionToFreq(x) {
    return A * (Math.pow(10, a * x) - k);
}

// Rebuild frequency tags under visualizer
function rebuildFilterbankFrequencies() {
    const fMin = parseFloat(greenwoodMinInput.value);
    const fMax = parseFloat(greenwoodMaxInput.value);
    
    // Map frequency limits to positions
    const xMin = freqToCochlearPosition(fMin);
    const xMax = freqToCochlearPosition(fMax);
    
    freqBandList.innerHTML = '';
    
    for (let i = 0; i < channelCount; i++) {
        // Linearly space electrodes in cochlear position space
        const x = xMin + (i / (channelCount - 1)) * (xMax - xMin);
        const freq = cochlearPositionToFreq(x);
        
        const tag = document.createElement('div');
        tag.className = 'freq-tag';
        tag.id = `freq-tag-${i}`;
        tag.innerHTML = `<span class="indicator">●</span> ${Math.round(freq)} Hz`;
        freqBandList.appendChild(tag);
    }
    
    // If active processing is running, we need to hot-rebuild the audio filters
    if (isProcessing && audioCtx) {
        setupFilterbankAudioNodes();
    }
}

// Initial build
rebuildFilterbankFrequencies();

// ─── HOXEL SCRIPT INTERPRETER ──────────────────────────────────────────────
function logToConsole(msg, isError = false) {
    const line = document.createElement('div');
    line.className = `console-line ${isError ? 'error-msg' : 'system-msg'}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    errorConsole.appendChild(line);
    errorConsole.scrollTop = errorConsole.scrollHeight;
}

function compileScript(isAuto = false) {
    const code = scriptTextarea.value;
    try {
        const testFunc = new Function('envelopes', 'numChannels', 't', 'actuators', `
            try {
                ${code}
            } catch (err) {
                throw err;
            }
        `);
        
        // Mock run to catch runtime variable spelling or structural errors
        const mockEnvelopes = new Array(channelCount).fill(0);
        const mockActuators = new Array(3).fill(0);
        testFunc(mockEnvelopes, channelCount, 0, mockActuators);

        currentScriptFunc = testFunc;
        scriptErrorOccurred = false;
        scriptStatusIndicator.textContent = '✓ Compiles OK';
        scriptStatusIndicator.className = 'status-indicator status-ok';
        if (!isAuto) {
            logToConsole('Script compiled successfully.');
        }
    } catch (err) {
        // Keep the old working script running if it is just an auto-compile typing error
        if (!isAuto) {
            currentScriptFunc = null;
            logToConsole(`Compile error: ${err.message}`, true);
        }
        scriptErrorOccurred = true;
        scriptStatusIndicator.textContent = '✗ ' + err.message;
        scriptStatusIndicator.className = 'status-indicator status-error';
    }
}

// Initial compile
compileScript(false);

// ─── PROCEDURAL SYNTHESIZER ───────────────────────────────────────────────
// Generates rhythmic clicks and rumbles for testing without inputs
let synthIntervalId = null;
function startProceduralSynth(destination) {
    const synthNode = audioCtx.createGain();
    synthNode.connect(destination);

    let step = 0;
    function playTick() {
        if (!isProcessing || !audioCtx) return;
        const t = audioCtx.currentTime;
        
        // 4/4 Beat pattern:
        // step 0: heavy kick (55Hz rumble)
        // step 2: snare hit (noise spike)
        // step 1, 3: high hat tick
        
        if (step % 4 === 0) {
            // Kick drum
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(synthNode);
            
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
            
            gain.gain.setValueAtTime(1.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
            
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (step % 4 === 2) {
            // Snare drum (bandpass filtered white noise)
            const noise = createNoiseBuffer();
            if (noise) {
                const bufferSource = audioCtx.createBufferSource();
                bufferSource.buffer = noise;
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1000, t);
                filter.Q.setValueAtTime(2.0, t);
                
                const gain = audioCtx.createGain();
                bufferSource.connect(filter);
                filter.connect(gain);
                gain.connect(synthNode);
                
                gain.gain.setValueAtTime(0.8, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
                
                bufferSource.start(t);
                bufferSource.stop(t + 0.3);
            }
        } else {
            // High hat tick
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(synthNode);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(8000, t);
            
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
            
            osc.start(t);
            osc.stop(t + 0.06);
        }
        
        step = (step + 1) % 16;
    }

    synthIntervalId = setInterval(playTick, 250); // 120 BPM (16th notes are 125ms, quarter notes 500ms, here we do eighth notes at 250ms)
    return synthNode;
}

function stopProceduralSynth() {
    if (synthIntervalId) {
        clearInterval(synthIntervalId);
        synthIntervalId = null;
    }
}

function createNoiseBuffer() {
    if (!audioCtx) return null;
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}
async function switchAudioSource(source) {
    if (!isProcessing || !audioCtx || !pipelineInputGainNode) return;
    
    logToConsole(`Switching audio source to: ${source}...`);
    
    // 1. Clean up old source
    stopProceduralSynth();
    
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    
    if (inputNode) {
        try {
            inputNode.stop();
        } catch (e) {}
        try {
            inputNode.disconnect();
        } catch (e) {}
        inputNode = null;
    }
    
    // 2. Set up new source
    try {
        if (source === 'synth') {
            inputNode = startProceduralSynth(pipelineInputGainNode);
        } else if (source === 'mic') {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            inputNode = audioCtx.createMediaStreamSource(micStream);
            inputNode.connect(pipelineInputGainNode);
        } else if (source === 'file') {
            const files = audioFileInput.files;
            if (files.length > 0) {
                const file = files[0];
                logToConsole(`Loading file: ${file.name}`);
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                
                const bufferSource = audioCtx.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.loop = true;
                bufferSource.start(0);
                
                inputNode = bufferSource;
                inputNode.connect(pipelineInputGainNode);
            } else {
                logToConsole("Please select an audio file to start playback.", true);
            }
        }
        
        // Re-setup routing
        setupFilterbankAudioNodes();
    } catch (err) {
        logToConsole(`Error switching audio source: ${err.message}`, true);
    }
}

// ─── AUDIO NODE PIPELINE SETUP ────────────────────────────────────────────
async function startAudioProcessing() {
    if (isProcessing) return;
    
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Output Node for Vocoder Audio Feedback
        outputGainNode = audioCtx.createGain();
        outputGainNode.gain.setValueAtTime(parseInt(vocoderVolumeInput.value) / 100, audioCtx.currentTime);
        outputGainNode.connect(audioCtx.destination);
        
        // Set up input gain node
        pipelineInputGainNode = audioCtx.createGain();
        const rawGain = parseInt(inputGainInput.value) / 10;
        pipelineInputGainNode.gain.setValueAtTime(rawGain, audioCtx.currentTime);

        const source = audioSourceSelect.value;
        logToConsole(`Initializing audio pipeline source: ${source}...`);

        if (source === 'synth') {
            inputNode = startProceduralSynth(pipelineInputGainNode);
        } else if (source === 'mic') {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            inputNode = audioCtx.createMediaStreamSource(micStream);
            inputNode.connect(pipelineInputGainNode);
        } else if (source === 'file') {
            const files = audioFileInput.files;
            if (files.length === 0) {
                alert("Please select an audio file first.");
                audioCtx.close();
                audioCtx = null;
                return;
            }
            const file = files[0];
            logToConsole(`Loading file: ${file.name}`);
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            const bufferSource = audioCtx.createBufferSource();
            bufferSource.buffer = audioBuffer;
            bufferSource.loop = true;
            bufferSource.start(0);
            
            inputNode = bufferSource;
            inputNode.connect(pipelineInputGainNode);
        }

        // We feed the gain node into the filterbank setup
        setupFilterbankAudioNodes();

        // Bind sliders for live gain adjustments
        inputGainInput.addEventListener('input', updateLiveInputGain);

        isProcessing = true;
        startAudioBtn.disabled = true;
        stopAudioBtn.disabled = false;
        
        logToConsole("Audio processing pipeline active.");
        
        // Start animation and math loops
        timeSec = 0;
        animate();
    } catch (err) {
        logToConsole(`Error starting audio: ${err.message}`, true);
        stopAudioProcessing();
    }
}

function updateLiveInputGain() {
    if (audioCtx && isProcessing) {
        // Since we are rebuilding, we don't hold global reference to inputGainNode. Let's find it or set it dynamically.
        // For simplicity, we just rebuild or scale in the envelope calculation
    }
}

// Build the array of filters and analysers based on Greenwood Bands
function setupFilterbankAudioNodes() {
    if (!audioCtx) return;
    
    // Manage A/B Normal Audio Bypass connection
    if (pipelineInputGainNode) {
        try { pipelineInputGainNode.disconnect(outputGainNode); } catch (e) {}
    }

    // Clear old filterbank nodes
    filterBank.forEach(b => {
        try { b.filter.disconnect(); } catch(e){}
        try { b.analyser.disconnect(); } catch(e){}
    });
    filterBank = [];
    
    // Clear old vocoder carriers
    vocoderCarrierNodes.forEach(c => {
        try { c.osc.stop(); } catch(e){}
        try { c.osc.disconnect(); } catch(e){}
        try { c.gain.disconnect(); } catch(e){}
    });
    vocoderCarrierNodes = [];

    const fMin = parseFloat(greenwoodMinInput.value);
    const fMax = parseFloat(greenwoodMaxInput.value);
    const xMin = freqToCochlearPosition(fMin);
    const xMax = freqToCochlearPosition(fMax);
    
    const vType = vocoderTypeSelect.value;
    let noiseSource = null;
    
    // If Bypass Mode is selected, connect original audio directly to output
    if (vType === 'bypass' && pipelineInputGainNode) {
        pipelineInputGainNode.connect(outputGainNode);
    }
    
    if (vType === 'noise') {
        const nBuffer = createNoiseBuffer();
        if (nBuffer) {
            noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = nBuffer;
            noiseSource.loop = true;
            noiseSource.start(0);
        }
    }

    for (let i = 0; i < channelCount; i++) {
        // 1. Greenwood Center Frequency
        const x = xMin + (i / (channelCount - 1)) * (xMax - xMin);
        const freq = cochlearPositionToFreq(x);
        
        // 2. Bandpass filter for analysis
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, audioCtx.currentTime);
        // Cascade filters to get a steeper roll-off resembling a cochlear filter
        filter.Q.setValueAtTime(4.0, audioCtx.currentTime); 
        
        // 3. Connect audio source to filter (always connected for telemetry/haptics)
        if (pipelineInputGainNode) {
            pipelineInputGainNode.connect(filter);
        }
        
        // 4. Analyser node for envelope extraction
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128; // small FFT buffer for rapid temporal envelope tracking
        filter.connect(analyser);
        
        filterBank.push({
            filter: filter,
            analyser: analyser,
            envelope: 0,
            freq: freq
        });
        
        // 5. Vocoder carrier synthesis
        if (vType === 'sine') {
            // Pure tone carrier centered at characteristic frequency
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            
            osc.connect(gain);
            gain.connect(outputGainNode);
            osc.start(0);
            
            vocoderCarrierNodes.push({ osc: osc, gain: gain });
        } else if (vType === 'noise' && noiseSource) {
            // Bandpass filtered noise modulated by the envelope
            const noiseBP = audioCtx.createBiquadFilter();
            noiseBP.type = 'bandpass';
            noiseBP.frequency.setValueAtTime(freq, audioCtx.currentTime);
            noiseBP.Q.setValueAtTime(3.0, audioCtx.currentTime);
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            
            noiseSource.connect(noiseBP);
            noiseBP.connect(gain);
            gain.connect(outputGainNode);
            
            vocoderCarrierNodes.push({ osc: noiseBP, gain: gain }); // save filter reference as osc for simplicity
        }
    }
}

function stopAudioProcessing() {
    isProcessing = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    stopProceduralSynth();

    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    
    // Clear filterbank nodes
    filterBank.forEach(b => {
        try { b.filter.disconnect(); } catch(e){}
        try { b.analyser.disconnect(); } catch(e){}
    });
    filterBank = [];
    
    // Clear vocoder carriers
    vocoderCarrierNodes.forEach(c => {
        try { c.osc.stop(); } catch(e){}
        try { c.osc.disconnect(); } catch(e){}
        try { c.gain.disconnect(); } catch(e){}
    });
    vocoderCarrierNodes = [];

    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    pipelineInputGainNode = null;

    startAudioBtn.disabled = false;
    stopAudioBtn.disabled = true;
    logToConsole("Audio pipeline stopped.");
}

// ─── TICK & ANIMATION LOOP ──────────────────────────────────────────────────
// RMS Amplitude calculator from AnalyserNode buffer
const timeDataArray = new Float32Array(128);
function getRMSAmplitude(analyserNode) {
    analyserNode.getFloatTimeDomainData(timeDataArray);
    let sum = 0;
    for (let i = 0; i < timeDataArray.length; i++) {
        sum += timeDataArray[i] * timeDataArray[i];
    }
    return Math.sqrt(sum / timeDataArray.length);
}

function animate() {
    if (!isProcessing) return;
    animationFrameId = requestAnimationFrame(animate);
    
    timeSec += 0.016; // Increment elapsed seconds (~60fps)
    
    const cutoff = parseFloat(envelopeCutoffInput.value);
    // Exponential smoothing constant based on cutoff frequency (tau = 1 / (2*pi*f_c))
    // alpha = dt / (tau + dt) where dt = 0.016
    const tau = 1 / (2 * Math.PI * cutoff);
    const alpha = 0.016 / (tau + 0.016);
    
    const gainFactor = parseFloat(inputGainInput.value) / 10;
    const vType = vocoderTypeSelect.value;

    // 1. Process envelopes & update active frequency tag indicators in UI
    for (let i = 0; i < channelCount; i++) {
        const node = filterBank[i];
        if (node) {
            const rawRMS = getRMSAmplitude(node.analyser) * gainFactor;
            // Smooth envelope filter (Low-pass)
            node.envelope = (1 - alpha) * node.envelope + alpha * rawRMS;
            
            // Map to dynamic array
            envelopes[i] = Math.min(1.0, node.envelope);
            
            // Visual indicator on tag (color-matched to waves, scales continuously)
            const tag = document.getElementById(`freq-tag-${i}`);
            if (tag) {
                const amp = envelopes[i];
                const hue = (i / channelCount) * 120 + 200; // Exact hue matching telemetry line
                
                tag.style.borderColor = `hsla(${hue}, 95%, 55%, ${0.2 + amp * 0.8})`;
                tag.style.backgroundColor = `hsla(${hue}, 95%, 55%, ${0.05 + amp * 0.38})`;
                tag.style.color = `hsla(${hue}, 85%, ${80 + amp * 20}%, ${0.7 + amp * 0.3})`;
                tag.style.textShadow = `0 0 ${amp * 6}px hsla(${hue}, 95%, 65%, ${amp})`;
                
                const indicator = tag.querySelector('.indicator');
                if (indicator) {
                    indicator.style.color = `hsla(${hue}, 95%, 60%, ${0.4 + amp * 0.6})`;
                    indicator.style.textShadow = `0 0 ${4 + amp * 8}px hsla(${hue}, 95%, 60%, ${0.4 + amp * 0.6})`;
                }
                
                if (amp > 0.03) {
                    tag.style.boxShadow = `0 0 ${10 + amp * 22}px hsla(${hue}, 95%, 55%, ${0.2 + amp * 0.65})`;
                } else {
                    tag.style.boxShadow = 'none';
                }
            }

            // 2. Modulate Vocoder Carrier gains
            if (vType !== 'none' && vocoderCarrierNodes[i]) {
                const targetGain = envelopes[i] * 0.35; // scale vocoder output to avoid clipping
                vocoderCarrierNodes[i].gain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.01);
            }
        }
    }

    // 3. Execute Hoxel Script
    actuators[0] = 0;
    actuators[1] = 0;
    actuators[2] = 0;

    if (currentScriptFunc && !scriptErrorOccurred) {
        try {
            // Run compiled function in sandboxed arguments
            currentScriptFunc(envelopes, channelCount, timeSec, actuators);
        } catch (err) {
            scriptErrorOccurred = true;
            logToConsole(`Runtime script error: ${err.message}`, true);
            scriptStatusIndicator.textContent = '✗ Runtime Error';
            scriptStatusIndicator.className = 'status-indicator status-error';
        }
    }

    // Clip actuators to [0, 1] range
    actuators[0] = Math.max(0, Math.min(1.0, actuators[0]));
    actuators[1] = Math.max(0, Math.min(1.0, actuators[1]));
    actuators[2] = Math.max(0, Math.min(1.0, actuators[2]));

    // Smooth actuator lines for visualizer
    for (let j = 0; j < 3; j++) {
        smoothedActuators[j] += (actuators[j] - smoothedActuators[j]) * 0.2;
    }

    // 4. Trigger Smartphone vibration (WebVibrate API)
    if (vibrateToggle.checked) {
        // Average the intensity of Actuator 0 and Actuator 1 (which are LRAs)
        const intensity = (actuators[0] + actuators[1]) / 2;
        const now = Date.now();
        // Vibrate only on pulses above threshold to save battery and avoid browser blocks
        if (intensity > 0.25) {
            // browser vib API doesn't support amplitude, so we pulse duration proportional to intensity
            const pulseDuration = Math.round(intensity * 40);
            if (pulseDuration > 10) {
                navigator.vibrate(pulseDuration);
            }
        }
    }

    // 5. Save History & Render Telemetry
    telemetryHistory.push({
        envelopes: [...envelopes],
        actuators: [...smoothedActuators]
    });
    if (telemetryHistory.length > historyLength) {
        telemetryHistory.shift();
    }

    drawTelemetryCanvas();
}

// ─── CANVAS DRAWING FUNCTIONS ─────────────────────────────────────────────
function drawTelemetryCanvas() {
    telemetryCtx.fillStyle = '#05070c';
    telemetryCtx.fillRect(0, 0, telemetryCanvas.width, telemetryCanvas.height);
    
    // Draw subgrids
    telemetryCtx.strokeStyle = 'rgba(99, 102, 241, 0.06)';
    telemetryCtx.lineWidth = 1;
    for (let x = 0; x < telemetryCanvas.width; x += 50) {
        telemetryCtx.beginPath();
        telemetryCtx.moveTo(x, 0);
        telemetryCtx.lineTo(x, telemetryCanvas.height);
        telemetryCtx.stroke();
    }
    for (let y = 0; y < telemetryCanvas.height; y += 40) {
        telemetryCtx.beginPath();
        telemetryCtx.moveTo(0, y);
        telemetryCtx.lineTo(telemetryCanvas.width, y);
        telemetryCtx.stroke();
    }

    if (telemetryHistory.length < 2) return;
    
    const step = telemetryCanvas.width / (historyLength - 1);
    
    // 1. Draw multi-channel envelopes (thin background lines)
    for (let ch = 0; ch < channelCount; ch++) {
        // Color hue shifts logarithmically per band
        const hue = (ch / channelCount) * 120 + 200; // Cyan-purple-pink range
        telemetryCtx.strokeStyle = `hsla(${hue}, 80%, 55%, 0.25)`;
        telemetryCtx.lineWidth = 1;
        telemetryCtx.beginPath();
        
        for (let i = 0; i < telemetryHistory.length; i++) {
            const h = telemetryHistory[i].envelopes[ch] * (telemetryCanvas.height - 30);
            const x = i * step;
            const y = telemetryCanvas.height - 15 - h;
            if (i === 0) telemetryCtx.moveTo(x, y);
            else telemetryCtx.lineTo(x, y);
        }
        telemetryCtx.stroke();
    }

    // 2. Draw Actuator outputs (Thick neon lines)
    const colors = [
        '#6366f1', // Actuator 0: Indigo
        '#0ea5e9', // Actuator 1: Sky Blue
        '#f43f5e'  // Actuator 2: Rose
    ];

    for (let act = 0; act < 3; act++) {
        telemetryCtx.strokeStyle = colors[act];
        telemetryCtx.lineWidth = 2.5;
        telemetryCtx.shadowBlur = 4;
        telemetryCtx.shadowColor = colors[act];
        telemetryCtx.beginPath();
        
        for (let i = 0; i < telemetryHistory.length; i++) {
            const h = telemetryHistory[i].actuators[act] * (telemetryCanvas.height - 30);
            const x = i * step;
            const y = telemetryCanvas.height - 15 - h;
            if (i === 0) telemetryCtx.moveTo(x, y);
            else telemetryCtx.lineTo(x, y);
        }
        telemetryCtx.stroke();
        telemetryCtx.shadowBlur = 0; // reset shadow
    }
}


