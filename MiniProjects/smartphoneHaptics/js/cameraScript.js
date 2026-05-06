document.addEventListener('DOMContentLoaded', () => {
    const startCameraHapticsBtn = document.getElementById('startCameraHapticsBtn');
    const stopCameraHapticsBtn = document.getElementById('stopCameraHapticsBtn');
    const cameraSelect = document.getElementById('cameraSelect');
    const processingModeSelect = document.getElementById('processingModeSelect');
    const camThresholdInput = document.getElementById('camThreshold');
    const camThresholdVal = document.getElementById('camThresholdVal');
    const camSensitivityInput = document.getElementById('camSensitivity');
    const camSensitivityVal = document.getElementById('camSensitivityVal');
    const camIntensityCapInput = document.getElementById('camIntensityCap');
    const camIntensityCapVal = document.getElementById('camIntensityCapVal');
    const camPatternSelect = document.getElementById('camPatternSelect');
    const statusText = document.getElementById('statusText');
    const cameraFeed = document.getElementById('cameraFeed');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const processedLevelBar = document.getElementById('processedLevelBar');
    const currentProcessedLevelSpan = document.getElementById('currentProcessedLevel');
    const canvasCtx = cameraCanvas.getContext('2d');

    let currentStream;
    let isCameraHapticsActive = false;
    let animationFrameId;
    let lastVibrationTime = 0;
    const MIN_VIBRATION_INTERVAL = 50; // ms between vibrations
    let previousFrameData = null; // For motion detection

    // --- Feature Detection ---
    const hasVibrate = "vibrate" in navigator;
    const hasGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    if (!hasVibrate || !hasGetUserMedia) {
        let msg = "Your browser/device does not fully support required APIs:\n";
        if (!hasVibrate) msg += "- Web Vibration API\n";
        if (!hasGetUserMedia) msg += "- navigator.mediaDevices.getUserMedia (Camera access)\n";
        alert(msg + "Please use a modern browser (e.g., Chrome, Firefox, Edge) that supports these features.");
        statusText.innerHTML = "Error: Missing API support.<br>Check console for details.";
        statusText.style.color = "#ff4757";
        console.error(msg);
        startCameraHapticsBtn.disabled = true;
        return;
    }

    // --- Camera Enumeration and Selection ---
    async function getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            cameraSelect.innerHTML = ''; // Clear existing options
            if (videoDevices.length === 0) {
                cameraSelect.innerHTML = '<option>No camera found</option>';
                startCameraHapticsBtn.disabled = true;
                statusText.innerHTML = "Error: No camera devices found.";
                statusText.style.color = "#ff4757";
                return;
            }

            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
                cameraSelect.appendChild(option);
            });
            statusText.textContent = "Cameras loaded.";
        } catch (err) {
            statusText.innerHTML = `Error enumerating devices: ${err.message}`;
            statusText.style.color = "#ff4757";
            console.error("Error enumerating devices:", err);
            startCameraHapticsBtn.disabled = true;
        }
    }

    // --- Camera Stream Management ---
    async function startCamera(deviceId) {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        previousFrameData = null; // Reset for motion detection

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 128 }, // Process smaller frames for performance
                height: { ideal: 96 }
            }
        };

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraFeed.srcObject = currentStream;
            cameraFeed.play();
            statusText.textContent = "Camera started.";

            cameraFeed.onloadedmetadata = () => {
                cameraCanvas.width = cameraFeed.videoWidth;
                cameraCanvas.height = cameraFeed.videoHeight;
                if (!isCameraHapticsActive) { // Only start processing loop once
                    isCameraHapticsActive = true;
                    processCameraFrames();
                }
            };
            startCameraHapticsBtn.disabled = true;
            stopCameraHapticsBtn.disabled = false;
        } catch (err) {
            statusText.innerHTML = `Error accessing camera: ${err.message}`;
            statusText.style.color = "#ff4757";
            console.error("Error accessing camera:", err);
            startCameraHapticsBtn.disabled = false;
            stopCameraHapticsBtn.disabled = true;
        }
    }

    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        cameraFeed.srcObject = null;
        isCameraHapticsActive = false;
        cancelAnimationFrame(animationFrameId);
        navigator.vibrate(0); // Stop any ongoing vibration
        statusText.textContent = "Camera stopped. Haptics inactive.";
        startCameraHapticsBtn.disabled = false;
        stopCameraHapticsBtn.disabled = true;
        currentProcessedLevelSpan.textContent = '0.00';
        processedLevelBar.style.width = '0%';
        previousFrameData = null;
    }

    // --- Frame Processing and Haptics ---
    function processCameraFrames() {
        if (!isCameraHapticsActive) return;

        animationFrameId = requestAnimationFrame(processCameraFrames);

        if (cameraFeed.readyState === cameraFeed.HAVE_ENOUGH_DATA) {
            canvasCtx.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);
            const imageData = canvasCtx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
            const data = imageData.data; // R, G, B, A bytes

            let processedValue = 0;
            const mode = processingModeSelect.value;

            if (mode === 'brightness') {
                processedValue = calculateAverageBrightness(data);
            } else if (mode === 'motion') {
                processedValue = detectMotion(data, cameraCanvas.width, cameraCanvas.height);
            }
            // else if (mode === 'edge') { /* TODO: Implement edge detection */ }

            currentProcessedLevelSpan.textContent = processedValue.toFixed(2);
            processedLevelBar.style.width = `${processedValue * 100}%`;

            processHaptics(processedValue);
        }
    }

    function calculateAverageBrightness(data) {
        let brightnessSum = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Simple luminosity calculation
            brightnessSum += (0.2126 * r + 0.7152 * g + 0.0722 * b);
        }
        return (brightnessSum / (data.length / 4)) / 255; // Normalize to 0-1
    }

    function detectMotion(currentFrameData, width, height) {
        if (!previousFrameData) {
            previousFrameData = new Uint8ClampedArray(currentFrameData);
            return 0;
        }

        let diffSum = 0;
        // Compare only luminance for simplicity
        for (let i = 0; i < currentFrameData.length; i += 4) {
            const currentBrightness = (0.2126 * currentFrameData[i] + 0.7152 * currentFrameData[i + 1] + 0.0722 * currentFrameData[i + 2]);
            const previousBrightness = (0.2126 * previousFrameData[i] + 0.7152 * previousFrameData[i + 1] + 0.0722 * previousFrameData[i + 2]);
            diffSum += Math.abs(currentBrightness - previousBrightness);
        }
        
        // Update previous frame for next comparison
        previousFrameData = new Uint8ClampedArray(currentFrameData);

        return (diffSum / (currentFrameData.length / 4)) / 255; // Normalize to 0-1
    }


    function processHaptics(level) {
        if (!isCameraHapticsActive) return;

        const threshold = parseFloat(camThresholdInput.value);
        const sensitivity = parseFloat(camSensitivityInput.value);
        const intensityCap = parseFloat(camIntensityCapInput.value);
        const selectedPattern = camPatternSelect.value;

        if (level < threshold) {
            navigator.vibrate(0); // Stop vibration if below threshold
            return;
        }

        const now = Date.now();
        if (now - lastVibrationTime < MIN_VIBRATION_INTERVAL && selectedPattern !== 'continuous') {
            return; // Don't vibrate too frequently for non-continuous patterns
        }

        let effectiveLevel = (level - threshold) * sensitivity;
        effectiveLevel = Math.max(0, effectiveLevel); // Ensure non-negative

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
                    pattern = [Math.max(10, Math.min(200, intensity))]; // Short pulse that repeats
                    break;
                case 'pulse_dynamic':
                    const pulseDuration = Math.max(10, Math.min(intensity, 500));
                    const pauseDuration = Math.max(50, 500 - pulseDuration);
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
    cameraSelect.addEventListener('change', () => {
        if (isCameraHapticsActive) {
            startCamera(cameraSelect.value); // Restart camera with new selection
        }
    });

    camThresholdInput.addEventListener('input', (e) => {
        camThresholdVal.textContent = parseFloat(e.target.value).toFixed(2);
    });

    camSensitivityInput.addEventListener('input', (e) => {
        camSensitivityVal.textContent = parseFloat(e.target.value).toFixed(1);
    });

    camIntensityCapInput.addEventListener('input', (e) => {
        camIntensityCapVal.textContent = parseInt(e.target.value, 10);
    });

    camPatternSelect.addEventListener('change', () => {
        // No direct action needed on change, processHaptics will pick it up
    });

    startCameraHapticsBtn.addEventListener('click', () => {
        logInteraction();
        startCamera(cameraSelect.value);
    });
    stopCameraHapticsBtn.addEventListener('click', stopCamera);

    // Initial setup
    stopCameraHapticsBtn.disabled = true;
    camThresholdVal.textContent = camThresholdInput.value;
    camSensitivityVal.textContent = camSensitivityInput.value;
    camIntensityCapVal.textContent = camIntensityCapInput.value;
    getCameras(); // Populate camera selection initially
});
