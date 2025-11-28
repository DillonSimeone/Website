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
    console.log("Initializing Audio Haptics...");

    const HAPTIC_THRESHOLD = 50; // Amplitude threshold (0-255) to trigger vibration
    const VIBRATION_DURATION = 15; // ms
    const VIBRATION_INTERVAL = 30; // ms (debounce)
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
            
            // Attach our logic to this context
            setupContextHaptics(ctx);
            
            return ctx;
        };
        // Restore prototype chain
        window.AudioContext.prototype = OriginalAudioContext.prototype;
    }

    function setupContextHaptics(context) {
        try {
            const analyser = context.createAnalyser();
            analyser.fftSize = 256; // Small FFT size for performance and broad bass detection
            
            // We need to tap into the destination.
            // Since we can't easily read FROM destination, we rely on the 'connect' override
            // to link nodes to this analyser when they connect to destination.
            
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
                    // Use a gain node to prevent feedback loops if necessary, 
                    // though parallel connection usually is fine.
                    originalConnect.apply(this, [this.context._hapticsAnalyser]);
                } catch (err) {
                    // Ignore errors (e.g., already connected)
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
            // We need a context to process media element audio
            // We'll reuse a global one or create one if needed, 
            // but we must be careful about CORS and strict browser policies.
            // Note: createMediaElementSource usually requires the element to be playing
            // or ready, and can only be called ONCE per element.
            
            // A safer bet for existing pages that might already use createMediaElementSource
            // is to skip this if we detect it might conflict, but we can't easily know.
            // We'll try to create a separate context for haptics.
            
            const HapticCtx = window.AudioContext || window.webkitAudioContext;
            if (!HapticCtx) return;

            const ctx = new HapticCtx();
            const source = ctx.createMediaElementSource(element);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            
            source.connect(analyser);
            source.connect(ctx.destination); // Ensure audio still plays through this context if needed
            
            activeAnalysers.add(analyser);
            element._hapticsAttached = true;
            
            // Resume context if suspended
            if (ctx.state === 'suspended') {
                ['click', 'touchstart', 'keydown'].forEach(evt => 
                    document.addEventListener(evt, () => ctx.resume(), { once: true })
                );
            }

        } catch (e) {
            // Typically fails if CORS issues or already connected
            // console.warn("Could not attach haptics to media element:", e);
        }
    }

    // Observer to watch for new media elements
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

    // Start observing
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    
    // Attach to existing elements
    document.querySelectorAll('audio, video').forEach(attachToMediaElement);


    // ---------------------------------------------------------
    // 3. Vibration Logic Loop
    // ---------------------------------------------------------
    const dataArray = new Uint8Array(128); // Half of fftSize

    function processHaptics() {
        if (!isHapticsEnabled) {
            requestAnimationFrame(processHaptics);
            return;
        }

        let totalBass = 0;
        let activeSources = 0;

        for (const analyser of activeAnalysers) {
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate average energy in the lower frequencies (Bass)
            // Bins 0-10 roughly correspond to sub-bass/bass depending on sample rate
            let bassSum = 0;
            const bassBins = 10;
            
            for (let i = 0; i < bassBins; i++) {
                bassSum += dataArray[i];
            }
            
            totalBass += (bassSum / bassBins);
            activeSources++;
        }

        if (activeSources > 0) {
            const avgBass = totalBass / activeSources;
            const now = Date.now();

            if (avgBass > HAPTIC_THRESHOLD && (now - lastVibrationTime > VIBRATION_INTERVAL)) {
                // Check if Vibration API is supported
                if (navigator.vibrate) {
                    // Vibrate based on intensity? 
                    // Simple pulse for now
                    navigator.vibrate(VIBRATION_DURATION);
                    lastVibrationTime = now;
                }
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
        console.log("Audio Haptics Enabled via user interaction.");
        
        // Resume all contexts we know about
        // (This is handled by individual context creation/element attachment usually, but good to ensure)
    }

    // Auto-enable on first interaction
    const userEvents = ['click', 'touchstart', 'keydown'];
    userEvents.forEach(evt => {
        document.addEventListener(evt, enableHaptics, { once: true });
    });

    // Start the loop
    processHaptics();

})();
