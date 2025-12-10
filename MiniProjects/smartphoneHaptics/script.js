document.addEventListener('DOMContentLoaded', () => {
    const triggerBtn = document.getElementById('triggerBtn');
    const stopBtn = document.getElementById('stopBtn');
    const durationInput = document.getElementById('duration');
    const durationVal = document.getElementById('durationVal');
    const customPatternInput = document.getElementById('customPattern');
    const statusText = document.getElementById('statusText');
    const presetBtns = document.querySelectorAll('.preset-buttons button');

    let audioCtx;

    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
    }

    let currentPattern = [200];

    // Check support
    const ua = navigator.userAgent;
    
    // Detect supported engines but EXCLUDE DuckDuckGo (which masquerades as Chrome but lacks haptics)
    const isTargetBrowser = /Chrome|Edg|OPR/i.test(ua);
    const isDuckDuckGo = /DuckDuckGo/i.test(ua);
    const hasVibrate = "vibrate" in navigator;

    if (!hasVibrate || !isTargetBrowser || isDuckDuckGo) {
        const msg = "Your browser does not support the Vibration API.\nSupported: Chrome, Edge, Opera.\n(DuckDuckGo and iOS are not supported)";
        alert(msg);
        statusText.innerHTML = "Error: Browser not supported.<br>Use Chrome, Edge, or Opera.";
        statusText.style.color = "#ff4757";
        return;
    }

    function updatePatternFromInputs() {
        const customText = customPatternInput.value.trim();
        
        if (customText) {
            try {
                const parts = customText.split(',').map(p => parseInt(p.trim(), 10));
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

        const dur = parseInt(durationInput.value, 10);
        currentPattern = [dur];
        statusText.textContent = `Pattern: Single Pulse (${dur}ms)`;
    }

    async function unlockAudioAndVibrate(pattern) {
        statusText.innerHTML = "Requesting...";
        
        try {
            initAudio();
            if (audioCtx && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            if (audioCtx) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                gain.gain.value = 0.001; 
                osc.start(0);
                osc.stop(audioCtx.currentTime + 0.1);
            }

            const success = navigator.vibrate(pattern);
            
            if (success) {
                statusText.innerHTML = `Vibrating... (Audio: ${audioCtx ? audioCtx.state : 'N/A'})`;
                const totalTime = pattern.length ? pattern.reduce((a, b) => a + b, 0) : 0;
                setTimeout(() => statusText.textContent = "Ready", totalTime || 1000);
            } else {
                statusText.innerHTML = "Vibrate returned <b>FALSE</b>";
            }

        } catch (e) {
            statusText.innerHTML = `Error: ${e.message}`;
        }
    }

    durationInput.addEventListener('input', (e) => {
        durationVal.textContent = e.target.value;
        customPatternInput.value = '';
        updatePatternFromInputs();
    });

    customPatternInput.addEventListener('input', () => {
        updatePatternFromInputs();
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const patternStr = btn.getAttribute('data-pattern');
            customPatternInput.value = patternStr;
            updatePatternFromInputs();
            unlockAudioAndVibrate(50);
        });
    });

    triggerBtn.addEventListener('click', () => {
        updatePatternFromInputs();
        if (currentPattern.length > 0) {
            unlockAudioAndVibrate(currentPattern);
        }
    });

    stopBtn.addEventListener('click', () => {
        navigator.vibrate(0);
        statusText.textContent = "Stopped";
    });

    document.getElementById('simpleTestBtn').addEventListener('click', () => {
        unlockAudioAndVibrate([200]);
    });

    updatePatternFromInputs();
});