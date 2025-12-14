document.addEventListener('DOMContentLoaded', () => {
    const startMicHapticsBtn = document.getElementById('startMicHapticsBtn');
    const stopMicHapticsBtn = document.getElementById('stopMicHapticsBtn');
    const micThresholdInput = document.getElementById('micThreshold');
    const micThresholdVal = document.getElementById('micThresholdVal');
    const micSensitivityInput = document.getElementById('micSensitivity');
    const micSensitivityVal = document.getElementById('micSensitivityVal');
    const micIntensityCapInput = document.getElementById('micIntensityCap');
    const micIntensityCapVal = document.getElementById('micIntensityCapVal');
    const micPatternSelect = document.getElementById('micPatternSelect');
    const statusText = document.getElementById('statusText');
    const micLevelBar = document.getElementById('micLevelBar');
    const currentMicLevelSpan = document.getElementById('currentMicLevel');

    let audioContext;
    let analyser;
    let microphone;
    let javascriptNode;
    let isMicHapticsActive = false;
    let animationFrameId;
    let lastVibrationTime = 0;
    const MIN_VIBRATION_INTERVAL = 50; // ms between vibrations

    // --- Feature Detection ---
    const hasVibrate = "vibrate" in navigator;
    const hasGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    if (!hasVibrate || !hasGetUserMedia) {
        let msg = "Your browser/device does not fully support required APIs:\n";
        if (!hasVibrate) msg += "- Web Vibration API\n";
        if (!hasGetUserMedia) msg += "- navigator.mediaDevices.getUserMedia (Microphone access)\n";
        alert(msg + "Please use a modern browser (e.g., Chrome, Firefox, Edge) that supports these features.");
        statusText.innerHTML = "Error: Missing API support.<br>Check console for details.";
        statusText.style.color = "#ff4757";
        console.error(msg);
        startMicHapticsBtn.disabled = true;
        return;
    }

    // --- Audio Processing ---
    async function startMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            microphone = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.smoothingTimeConstant = 0.3;
            analyser.fftSize = 1024; // Smaller for quicker response

            javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

            microphone.connect(analyser);
            analyser.connect(javascriptNode);
            javascriptNode.connect(audioContext.destination);

            javascriptNode.onaudioprocess = () => {
                if (!isMicHapticsActive) return;

                const array = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(array);
                
                let sum = 0;
                for (let i = 0; i < array.length; i++) {
                    sum += array[i];
                }
                let average = sum / array.length;
                let normalizedLevel = average / 256; // Normalize to 0-1

                currentMicLevelSpan.textContent = normalizedLevel.toFixed(2);
                micLevelBar.style.width = `${normalizedLevel * 100}%`;

                processMicHaptics(normalizedLevel);
            };

            statusText.textContent = "Microphone started.";
            isMicHapticsActive = true;
            startMicHapticsBtn.disabled = true;
            stopMicHapticsBtn.disabled = false;
        } catch (err) {
            statusText.innerHTML = `Error accessing microphone: ${err.message}`;
            statusText.style.color = "#ff4757";
            console.error("Error accessing microphone:", err);
            startMicHapticsBtn.disabled = false;
            stopMicHapticsBtn.disabled = true;
        }
    }

    function stopMicrophone() {
        if (microphone && microphone.mediaStream) {
            microphone.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        isMicHapticsActive = false;
        navigator.vibrate(0); // Stop any ongoing vibration
        statusText.textContent = "Microphone stopped. Haptics inactive.";
        startMicHapticsBtn.disabled = false;
        stopMicHapticsBtn.disabled = true;
        currentMicLevelSpan.textContent = '0.00';
        micLevelBar.style.width = '0%';
    }

    // --- Haptic Processing Logic ---
    function processMicHaptics(level) {
        if (!isMicHapticsActive) return;

        const threshold = parseFloat(micThresholdInput.value);
        const sensitivity = parseFloat(micSensitivityInput.value);
        const intensityCap = parseFloat(micIntensityCapInput.value);
        const selectedPattern = micPatternSelect.value;

        if (level < threshold) {
            navigator.vibrate(0); // Stop vibration if below threshold
            return;
        }

        const now = Date.now();
        if (now - lastVibrationTime < MIN_VIBRATION_INTERVAL && selectedPattern !== 'continuous') {
            return; // Don't vibrate too frequently for non-continuous patterns
        }

        let effectiveLevel = (level - threshold) * sensitivity;
        let intensity = effectiveLevel * 1000; // Scale to vibration duration (ms)
        intensity = Math.min(intensity, intensityCap); // Apply intensity cap
        intensity = Math.max(0, intensity); // Ensure non-negative

        let pattern = [];
        if (intensity > 0) {
            switch (selectedPattern) {
                case 'single':
                    pattern = [intensity];
                    break;
                case 'continuous':
                    // Continuous needs to be managed externally if duration is always changing
                    // For now, we'll make it a short pulse that can be repeated
                    pattern = [Math.max(10, Math.min(200, intensity))]; 
                    break;
                case 'pulse_dynamic':
                    const pulseDuration = Math.max(10, Math.min(intensity, 500));
                    const pauseDuration = Math.max(50, 500 - pulseDuration); // Shorter pause for stronger pulses
                    pattern = [pulseDuration, pauseDuration];
                    break;
                default:
                    pattern = [intensity];
            }
            navigator.vibrate(pattern);
            lastVibrationTime = now;
        } else {
            navigator.vibrate(0);
        }
    }

    // --- Event Listeners ---
    micThresholdInput.addEventListener('input', (e) => {
        micThresholdVal.textContent = parseFloat(e.target.value).toFixed(2);
    });

    micSensitivityInput.addEventListener('input', (e) => {
        micSensitivityVal.textContent = parseFloat(e.target.value).toFixed(1);
    });

    micIntensityCapInput.addEventListener('input', (e) => {
        micIntensityCapVal.textContent = parseInt(e.target.value, 10);
    });

    micPatternSelect.addEventListener('change', () => {
        // No direct action needed on change, processMicHaptics will pick it up
    });

    startMicHapticsBtn.addEventListener('click', startMicrophone);
    stopMicHapticsBtn.addEventListener('click', stopMicrophone);

    // Initial state
    stopMicHapticsBtn.disabled = true;
    micThresholdVal.textContent = micThresholdInput.value;
    micSensitivityVal.textContent = micSensitivityInput.value;
    micIntensityCapVal.textContent = micIntensityCapInput.value;
});
