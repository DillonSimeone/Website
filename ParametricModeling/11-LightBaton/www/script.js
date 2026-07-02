document.addEventListener('DOMContentLoaded', () => {
    const numLeds = 24;
    const ledStrip = document.getElementById('led-strip');
    const handleRing = document.getElementById('handle-ring');
    const energyVal = document.getElementById('energy-val');
    const chargePad = document.getElementById('charge-pad');
    const motorStatus = document.getElementById('motor-status');
    const followerTargetVal = document.getElementById('follower-target-val');
    const followerCurrentVal = document.getElementById('follower-current-val');

    // --- State variables ---
    let energyLevel = 0.0;
    let chargeRate = 0.2;      // ADJUSTED: Halved to 0.2 (four times harder than original 0.8)
    let decayRate = 0.25;      // Energy decay per second
    let targetCharge = 0.0;
    let currentCharge = 0.0;
    let easingFactor = 6.0;    // Easing coefficient for delta math
    let baseHue = 0;
    
    // Position tracking for motion detection
    let lastX = null;
    let lastY = null;
    let lastMoveTime = Date.now();
    let isCharging = false;
    let chargingTimeout = null;

    // --- Generate virtual LEDs ---
    const pixels = [];
    for (let i = 0; i < numLeds; i++) {
        const pixel = document.createElement('div');
        pixel.classList.add('led-pixel');
        ledStrip.appendChild(pixel);
        pixels.push(pixel);
    }

    // --- Generic Motion Tracker ---
    function detectMotion(e) {
        const now = Date.now();
        const dt = (now - lastMoveTime) / 1000.0;
        lastMoveTime = now;

        const rect = chargePad.getBoundingClientRect();
        const width = rect.width || 1;
        const height = rect.height || 1;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (lastX !== null && lastY !== null && dt > 0) {
            // Calculate movement speed normalized by the element's dimensions
            const dx = (x - lastX) / width;
            const dy = (y - lastY) / height;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const speed = distance / dt; // Speed in "widths" per second

            // Trigger charge based on relative movement (25% of pad size per second)
            if (speed > 0.25) {
                // Add energy scaled by normalized speed
                energyLevel += speed * 0.05 * chargeRate;
                if (energyLevel > 1.0) energyLevel = 1.0;
                
                // Visual feedback for pad
                chargePad.classList.add('charging');
                isCharging = true;
                
                clearTimeout(chargingTimeout);
                chargingTimeout = setTimeout(() => {
                    chargePad.classList.remove('charging');
                    isCharging = false;
                }, 150);
            }
        }

        lastX = x;
        lastY = y;
    }

    // Mouse Listeners
    chargePad.addEventListener('mousemove', detectMotion);
    chargePad.addEventListener('mouseleave', () => {
        lastX = null;
        lastY = null;
    });

    // Touch Listeners (Mobile Friendliness)
    chargePad.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
            e.preventDefault(); // Prevent standard page scroll behavior while swiping
            detectMotion(e.touches[0]);
        }
    }, { passive: false });
    
    chargePad.addEventListener('touchend', () => {
        lastX = null;
        lastY = null;
    });

    // --- Main Simulation Loop ---
    let lastFrameTime = performance.now();

    function updateSim(time) {
        const dt = (time - lastFrameTime) / 1000.0;
        lastFrameTime = time;

        // 1. Decay energy level over time
        if (energyLevel > 0) {
            energyLevel -= decayRate * dt;
            if (energyLevel < 0) energyLevel = 0.0;
        }

        // 2. Update Handle circular progress ring
        // Ring dash array is 314.16 on desktop, handle dimensions scale with mobile styles
        const circleRadius = parseFloat(handleRing.getAttribute('r'));
        const circleCircumference = 2 * Math.PI * circleRadius;
        
        // Dynamic ring dashoffset calculation based on SVG properties
        handleRing.style.strokeDasharray = circleCircumference;
        const dashOffset = circleCircumference - (circleCircumference * energyLevel);
        handleRing.style.strokeDashoffset = dashOffset;
        energyVal.textContent = Math.round(energyLevel * 100);

        // 3. Update Haptic Motor Status State Machine
        if (energyLevel < 0.05) {
            motorStatus.textContent = 'OFF';
            motorStatus.className = 'status-value motor-off';
        } else if (energyLevel < 0.3) {
            motorStatus.textContent = 'HEARTBEAT';
            motorStatus.className = 'status-value motor-pulse';
        } else if (energyLevel < 0.7) {
            motorStatus.textContent = 'GALLOP';
            motorStatus.className = 'status-value motor-pulse';
        } else {
            motorStatus.textContent = 'SHIMMER / BUZZ';
            motorStatus.className = 'status-value motor-shimmer';
        }

        // 4. Simulate ESP-NOW broadcast:
        // Handle continuously broadcasts energyLevel.
        targetCharge = energyLevel;

        // 5. Follower receives targetCharge and runs Delta Math
        const diff = targetCharge - currentCharge;
        currentCharge += diff * easingFactor * dt;

        // Clamp & snapping
        if (Math.abs(diff) < 0.001) {
            currentCharge = targetCharge;
        }
        if (currentCharge < 0.0) currentCharge = 0.0;
        if (currentCharge > 1.0) currentCharge = 1.0;

        // Display charge values
        followerTargetVal.textContent = targetCharge.toFixed(2);
        followerCurrentVal.textContent = currentCharge.toFixed(2);

        // 6. Render virtual LEDs
        const ledsToLight = Math.round(currentCharge * numLeds);
        baseHue = (baseHue + 1) % 360;

        for (let i = 0; i < numLeds; i++) {
            if (i < ledsToLight) {
                const pixelHue = (baseHue + (i * 12)) % 360;
                pixels[i].style.background = `hsl(${pixelHue}, 100%, 50%)`;
                pixels[i].style.boxShadow = `0 0 10px hsl(${pixelHue}, 100%, 60%)`;
            } else {
                pixels[i].style.background = '#12131a';
                pixels[i].style.boxShadow = 'none';
            }
        }

        requestAnimationFrame(updateSim);
    }

    requestAnimationFrame(updateSim);
});
