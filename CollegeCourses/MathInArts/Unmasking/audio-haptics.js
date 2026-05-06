/**
 * Audio Haptics Script
 * 
 * This script listens for audio activity on the page (both Web Audio API and HTML5 Media Elements)
 * and triggers smartphone haptic feedback (vibration) based on the audio intensity (bass).
 * 
 * Instructions:
 * 1. Include this script in your HTML file: <script src="audio-haptics.js"></script>
 * 2. Interact with the page (click/tap) to enable the haptic feedback engine.
 */

(function() {
    console.log("Initializing Audio Haptics (High Intensity Mode)...");

    // TWEAKED PARAMETERS FOR STRONGER HAPTICS
    const HAPTIC_THRESHOLD = 20;   // Lower threshold to catch more sounds (0-255)
    const VIBRATION_DURATION = 200; // Significantly increased duration for better perceptibility
    const VIBRATION_INTERVAL = 150; // Debounce interval to prevent "muddled" vibration signals
    
    let lastVibrationTime = 0;
    let isHapticsEnabled = false;

    // Store active analysers to process
    const activeAnalysers = new Set();

    // ---------------------------------------------------------
    // 1. Web Audio API Interception (Monkey Patching)
    // ---------------------------------------------------------
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    const originalConnect = AudioNode.prototype.connect;

    if (OriginalAudioContext) {
        // Intercept AudioContext creation
        window.AudioContext = window.webkitAudioContext = function(...args) {
            const ctx = new OriginalAudioContext(...args);
            setupContextHaptics(ctx);
            return ctx;
        };
        // Restore prototype chain
        window.AudioContext.prototype = OriginalAudioContext.prototype;
    }

    function setupContextHaptics(context) {
        try {
            const analyser = context.createAnalyser();
            analyser.fftSize = 256; 
            analyser.smoothingTimeConstant = 0.3; // Less smoothing for quicker reaction
            
            // Tag this analyser as belonging to this context
            context._hapticsAnalyser = analyser;
            activeAnalysers.add(analyser);

            console.log("Haptics analyser attached to AudioContext");
        } catch (e) {
            console.error("Failed to setup haptics for context", e);
        }
    }

    // Intercept AudioNode.connect to tap into the audio graph
    AudioNode.prototype.connect = function(destination, ...args) {
        const result = originalConnect.apply(this, [destination, ...args]);

        // If connecting to the context's destination, also connect to our haptics analyser
        if (destination && destination === this.context.destination) {
            if (this.context._hapticsAnalyser) {
                try {
                    // Connect this node to the haptics analyser as well
                    originalConnect.apply(this, [this.context._hapticsAnalyser]);
                } catch (err) {
                    // Ignore errors
                }
            }
        }
        return result;
    };

    // ---------------------------------------------------------
    // 2. HTML5 Media Element Interception (<audio>, <video>)
    // ---------------------------------------------------------
    function attachToMediaElement(element) {
        if (element._hapticsAttached) return;
        
        try {
            const HapticCtx = window.AudioContext || window.webkitAudioContext;
            if (!HapticCtx) return;

            // Reuse existing context if available in a global scope, otherwise create new
            // Creating too many contexts can be an issue, but for now this is safe for simple apps.
            const ctx = new HapticCtx();
            const source = ctx.createMediaElementSource(element);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            
            source.connect(analyser);
            source.connect(ctx.destination);
            
            activeAnalysers.add(analyser);
            element._hapticsAttached = true;
            
            if (ctx.state === 'suspended') {
                const resume = () => ctx.resume();
                ['click', 'touchstart', 'keydown'].forEach(evt => 
                    document.addEventListener(evt, resume, { once: true })
                );
            }

        } catch (e) {
            // console.warn("Could not attach haptics to media element:", e);
        }
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
                    attachToMediaElement(node);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll('audio, video').forEach(attachToMediaElement);
                }
            });
        });
    });

    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('audio, video').forEach(attachToMediaElement);


    // ---------------------------------------------------------
    // 3. Vibration Logic Loop
    // ---------------------------------------------------------
    const dataArray = new Uint8Array(128); 

    function processHaptics() {
        if (!isHapticsEnabled) {
            requestAnimationFrame(processHaptics);
            return;
        }

        let maxBass = 0; // Use max instead of average for better peak detection

        for (const analyser of activeAnalysers) {
            analyser.getByteFrequencyData(dataArray);
            
            // Scan bass frequencies (approx 0-350Hz with fft 256 @ 44.1k)
            // Bins 0-20
            for (let i = 0; i < 20; i++) {
                if (dataArray[i] > maxBass) {
                    maxBass = dataArray[i];
                }
            }
        }

        const now = Date.now();
        if (maxBass > HAPTIC_THRESHOLD && (now - lastVibrationTime > VIBRATION_INTERVAL)) {
            if (navigator.vibrate) {
                // Dynamic duration based on intensity?
                // Let's stick to a strong pulse for now to ensure visibility/feeling
                // or scale it: 
                // Low bass (20-100) -> 50ms
                // High bass (100-255) -> 200ms
                
                let duration = VIBRATION_DURATION;
                if (maxBass < 100) {
                    duration = 50; 
                } else {
                    duration = 200;
                }

                // console.log(`Triggering Haptics! Intensity: ${maxBass}, Duration: ${duration}ms`);
                navigator.vibrate(duration);
                lastVibrationTime = now;
            }
        }

        requestAnimationFrame(processHaptics);
    }

    // ---------------------------------------------------------
    // 4. Initialization & Permissions
    // ---------------------------------------------------------
    function enableHaptics() {
        if (isHapticsEnabled) return;
        isHapticsEnabled = true;
        console.log("Audio Haptics Enabled. (Touch detected)");
        
        // Try a tiny vibration to 'unlock' the motor on some browsers?
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    }

    const userEvents = ['click', 'touchstart', 'keydown', 'mousedown'];
    userEvents.forEach(evt => {
        document.addEventListener(evt, enableHaptics, { once: true });
    });

    processHaptics();

})();