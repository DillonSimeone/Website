document.addEventListener('DOMContentLoaded', () => {
    const startGestureHapticsBtn = document.getElementById('startGestureHapticsBtn');
    const stopGestureHapticsBtn = document.getElementById('stopGestureHapticsBtn');
    const deadzoneInput = document.getElementById('deadzone');
    const deadzoneVal = document.getElementById('deadzoneVal');
    const sensitivityInput = document.getElementById('sensitivity');
    const sensitivityVal = document.getElementById('sensitivityVal');
    const intensityCapInput = document.getElementById('intensityCap');
    const intensityCapVal = document.getElementById('intensityCapVal');
    const patternSelect = document.getElementById('patternSelect');
    const statusText = document.getElementById('statusText');
    const accelX = document.getElementById('accelX');
    const accelY = document.getElementById('accelY');
    const accelZ = document.getElementById('accelZ');
    const combinedAccel = document.getElementById('combinedAccel');

    let audioCtx;
    let isHapticsActive = false;
    let currentAcceleration = { x: 0, y: 0, z: 0 };
    let lastVibrationTime = 0;
    const MIN_VIBRATION_INTERVAL = 100; // ms between vibrations

    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
    }

    // --- Feature Detection ---
    const hasVibrate = "vibrate" in navigator;
    const hasDeviceMotionEvent = "DeviceMotionEvent" in window;

    if (!hasVibrate || !hasDeviceMotionEvent) {
        let msg = "Your browser/device does not fully support required APIs:\n";
        if (!hasVibrate) msg += "- Web Vibration API\n";
        if (!hasDeviceMotionEvent) msg += "- Device Motion API\n";
        alert(msg + "Please use a modern mobile browser (e.g., Chrome on Android).");
        statusText.innerHTML = "Error: Missing API support.<br>Check console for details.";
        statusText.style.color = "#ff4757";
        console.error(msg);
        startGestureHapticsBtn.disabled = true;
        return;
    }

    // --- MPU Reading Functionality ---
    let sensor;

    function startSensor() {
        if (typeof Accelerometer === 'function') {
            sensor = new Accelerometer({ frequency: 60 });
            sensor.addEventListener('reading', handleAccelerometerReading);
            sensor.addEventListener('error', handleSensorError);
            sensor.start();
            statusText.textContent = "Accelerometer started.";
        } else if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleDeviceMotionReading);
            statusText.textContent = "DeviceMotion started.";
        } else {
            statusText.innerHTML = "Error: No Accelerometer or DeviceMotion API available.";
            statusText.style.color = "#ff4757";
            startGestureHapticsBtn.disabled = true;
            return;
        }
        isHapticsActive = true;
        startGestureHapticsBtn.disabled = true;
        stopGestureHapticsBtn.disabled = false;
    }

    function stopSensor() {
        if (sensor) {
            sensor.removeEventListener('reading', handleAccelerometerReading);
            sensor.removeEventListener('error', handleSensorError);
            sensor.stop();
            sensor = null;
        } else if (window.DeviceMotionEvent) {
            window.removeEventListener('devicemotion', handleDeviceMotionReading);
        }
        isHapticsActive = false;
        navigator.vibrate(0); // Stop any ongoing vibration
        statusText.textContent = "Sensors stopped. Haptics inactive.";
        startGestureHapticsBtn.disabled = false;
        stopGestureHapticsBtn.disabled = true;
        // Reset MPU readouts
        accelX.textContent = '0.00';
        accelY.textContent = '0.00';
        accelZ.textContent = '0.00';
        combinedAccel.textContent = '0.00';
    }

    function handleAccelerometerReading() {
        currentAcceleration.x = sensor.x;
        currentAcceleration.y = sensor.y;
        currentAcceleration.z = sensor.z;
        updateMPUDisplay();
        processHaptics();
    }

    function handleDeviceMotionReading(event) {
        if (event.accelerationIncludingGravity) {
            currentAcceleration.x = event.accelerationIncludingGravity.x;
            currentAcceleration.y = event.accelerationIncludingGravity.y;
            currentAcceleration.z = event.accelerationIncludingGravity.z;
            updateMPUDisplay();
            processHaptics();
        }
    }

    function handleSensorError(event) {
        if (event.error.name === 'NotAllowedError') {
            statusText.innerHTML = "Error: Sensor access blocked. Please allow motion sensor access in browser settings.";
            statusText.style.color = "#ff4757";
        } else {
            statusText.innerHTML = `Error: ${event.error.message}`;
            statusText.style.color = "#ff4757";
        }
        console.error("Sensor error:", event.error);
        stopSensor(); // Attempt to stop to reset state
    }

    function updateMPUDisplay() {
        accelX.textContent = currentAcceleration.x ? currentAcceleration.x.toFixed(2) : '0.00';
        accelY.textContent = currentAcceleration.y ? currentAcceleration.y.toFixed(2) : '0.00';
        accelZ.textContent = currentAcceleration.z ? currentAcceleration.z.toFixed(2) : '0.00';

        const combined = Math.sqrt(
            Math.pow(currentAcceleration.x || 0, 2) +
            Math.pow(currentAcceleration.y || 0, 2) +
            Math.pow(currentAcceleration.z || 0, 2)
        );
        combinedAccel.textContent = combined.toFixed(2);
    }

    // --- Haptic Processing Logic ---
    function processHaptics() {
        if (!isHapticsActive) return;

        const deadzone = parseFloat(deadzoneInput.value);
        const sensitivity = parseFloat(sensitivityInput.value);
        const intensityCap = parseFloat(intensityCapInput.value);
        const selectedPattern = patternSelect.value;

        const combined = parseFloat(combinedAccel.textContent);
        
        let effectiveAcceleration = Math.max(0, combined - 9.81 - deadzone); // Subtract gravity (approx 9.81) and deadzone
        
        if (effectiveAcceleration <= 0) {
            navigator.vibrate(0); // Stop vibration if below deadzone
            return;
        }

        const now = Date.now();
        if (now - lastVibrationTime < MIN_VIBRATION_INTERVAL) {
            return; // Don't vibrate too frequently
        }

        let intensity = effectiveAcceleration * sensitivity * 100; // Scale acceleration to intensity
        intensity = Math.min(intensity, intensityCap); // Apply intensity cap
        intensity = Math.max(10, intensity); // Ensure a minimum intensity for feeling

        let pattern = [];
        switch (selectedPattern) {
            case 'single':
                pattern = [intensity];
                break;
            case 'double':
                pattern = [intensity, intensity / 2, intensity]; // Vibrate, pause, vibrate
                break;
            case 'ramp_up':
                pattern = [intensity * 0.5, intensity * 0.2, intensity]; // Light, pause, strong
                break;
            case 'ramp_down':
                pattern = [intensity, intensity * 0.2, intensity * 0.5]; // Strong, pause, light
                break;
            default:
                pattern = [intensity];
        }

        if (intensity > 0) {
            unlockAudioAndVibrate(pattern);
            lastVibrationTime = now;
        } else {
            navigator.vibrate(0);
        }
    }

    async function unlockAudioAndVibrate(pattern) {
        try {
            initAudio();
            if (audioCtx && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            navigator.vibrate(pattern);
            statusText.innerHTML = `Vibrating: ${pattern[0]}ms...`;
        } catch (e) {
            statusText.innerHTML = `Vibration Error: ${e.message}`;
            console.error("Vibration unlock/trigger error:", e);
        }
    }

    // --- Event Listeners ---
    deadzoneInput.addEventListener('input', (e) => {
        deadzoneVal.textContent = parseFloat(e.target.value).toFixed(2);
    });

    sensitivityInput.addEventListener('input', (e) => {
        sensitivityVal.textContent = parseFloat(e.target.value).toFixed(1);
    });

    intensityCapInput.addEventListener('input', (e) => {
        intensityCapVal.textContent = parseInt(e.target.value, 10);
    });

    patternSelect.addEventListener('change', () => {
        // No direct action needed on change, processHaptics will pick it up
    });

    startGestureHapticsBtn.addEventListener('click', () => {
        // Request permission if needed (iOS)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    startSensor();
                } else {
                    statusText.innerHTML = "Error: Motion sensor permission denied.";
                    statusText.style.color = "#ff4757";
                    startGestureHapticsBtn.disabled = false;
                    stopGestureHapticsBtn.disabled = true;
                }
            }).catch(console.error);
        } else {
            // Handle for non-iOS browsers
            startSensor();
        }
    });

    stopGestureHapticsBtn.addEventListener('click', stopSensor);

    // Initial state
    stopGestureHapticsBtn.disabled = true;
    deadzoneVal.textContent = deadzoneInput.value;
    sensitivityVal.textContent = sensitivityInput.value;
    intensityCapVal.textContent = intensityCapInput.value;
});
