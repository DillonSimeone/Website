document.addEventListener('DOMContentLoaded', () => {
    const triggerBtn = document.getElementById('triggerBtn');
    const stopBtn = document.getElementById('stopBtn');
    const durationInput = document.getElementById('duration');
    const durationVal = document.getElementById('durationVal');
    const customPatternInput = document.getElementById('customPattern');
    const statusText = document.getElementById('statusText');
    const presetBtns = document.querySelectorAll('.preset-buttons button');

    // State
    let currentPattern = [200];

    // Check support
    if (!("vibrate" in navigator)) {
        statusText.innerHTML = "Error: Vibration API not found.<br>Try Chrome/Firefox on Android.";
        statusText.style.color = "#ff4757";
        return;
    }

    // Utility: Update Pattern from Inputs
    function updatePatternFromInputs() {
        const customText = customPatternInput.value.trim();
        
        if (customText) {
            // Parse custom pattern
            try {
                const parts = customText.split(',').map(p => parseInt(p.trim(), 10));
                // Filter out NaNs
                const cleanParts = parts.filter(n => !isNaN(n) && n > 0);
                if (cleanParts.length > 0) {
                    currentPattern = cleanParts;
                    statusText.textContent = `Pattern: Custom (${cleanParts.length} steps)`;
                    return;
                }
            } catch (e) {
                console.error("Invalid pattern");
            }
        }

        // Fallback to slider duration
        const dur = parseInt(durationInput.value, 10);
        currentPattern = [dur];
        statusText.textContent = `Pattern: Single Pulse (${dur}ms)`;
    }

    // Event: Duration Slider
    durationInput.addEventListener('input', (e) => {
        durationVal.textContent = e.target.value;
        // Clear custom input to indicate we are using slider
        customPatternInput.value = '';
        updatePatternFromInputs();
    });

    // Event: Custom Input
    customPatternInput.addEventListener('input', () => {
        updatePatternFromInputs();
    });

    // Event: Presets
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const patternStr = btn.getAttribute('data-pattern');
            customPatternInput.value = patternStr;
            updatePatternFromInputs();
            // Optional: Provide instant feedback
            try {
                navigator.vibrate(50); 
            } catch(e) { console.log(e); }
        });
    });

    // Event: Trigger
    triggerBtn.addEventListener('click', () => {
        updatePatternFromInputs(); // Ensure latest
        
        statusText.innerHTML = "Processing...";
        
        if (!window.isSecureContext) {
            statusText.innerHTML = "Warning: Not Secure Context (HTTPS needed?)";
        }

        if (currentPattern.length > 0) {
            try {
                // navigator.vibrate returns boolean: true if successful, false if failed
                const success = navigator.vibrate(currentPattern);
                
                if (success) {
                    statusText.textContent = `Vibrating... (Success: true)`;
                    
                    // Reset text after approximate duration
                    const totalTime = currentPattern.reduce((a, b) => a + b, 0);
                    setTimeout(() => {
                        statusText.textContent = "Ready";
                    }, totalTime);
                } else {
                    statusText.innerHTML = "Vibrate returned <b>FALSE</b>.<br>Check user gesture or settings.";
                }
            } catch (e) {
                statusText.innerHTML = `Exception: ${e.message}`;
            }
        }
    });

    // Event: Stop
    stopBtn.addEventListener('click', () => {
        navigator.vibrate(0);
        statusText.textContent = "Stopped";
    });

    // Initialize
    updatePatternFromInputs();
});
