import { tokenize, Parser, Evaluator, pnoise1 } from './compiler.js';
import { addSerialLog, triggerI2CBlink } from './emulator.js';

export const PATTERNS = [
    { 
        id: "pulse", 
        name: "Pulse Wave", 
        category: "pulse", 
        desc: "Classic sharp on/off click sequences.", 
        code: "wave(t * 1.27) > 0.3 ? 1.0 : 0.0",
        func: (t) => Math.sin(t * 8) > 0.3 ? 1.0 : 0.0 
    },
    { 
        id: "tap2", 
        name: "Double Tap", 
        category: "pulse", 
        desc: "Tactile confirmation double buzz.", 
        code: "(t % 1.5 < 0.15 || (t % 1.5 > 0.25 && t % 1.5 < 0.4)) ? 1.0 : 0.0",
        func: (t) => (t % 1.5 < 0.15 || (t % 1.5 > 0.25 && t % 1.5 < 0.4)) ? 1.0 : 0.0 
    },
    { 
        id: "heartbeat", 
        name: "Heartbeat Pulse", 
        category: "rhythm", 
        desc: "Biometric double pulse with exponential decay.", 
        code: "exp(-pow((t % 1.2) * 10 - 2, 2)) * 0.8 + exp(-pow((t % 1.2) * 10 - 4.5, 2)) * 0.5",
        func: (t) => Math.exp(-Math.pow((t % 1.2) * 10 - 2, 2)) * 0.8 + Math.exp(-Math.pow((t % 1.2) * 10 - 4.5, 2)) * 0.5 
    },
    { 
        id: "rumble", 
        name: "Rumble Alert", 
        category: "alert", 
        desc: "High-frequency warning vibrations.", 
        code: "sin(t * 45) * 0.6 + 0.4",
        func: (t) => Math.sin(t * 45) * 0.6 + 0.4 
    },
    { 
        id: "crescendo", 
        name: "Crescendo Rise", 
        category: "rhythm", 
        desc: "Smooth intensity sweep rising to maximum.", 
        code: "(t % 1.8) / 1.8",
        func: (t) => (t % 1.8) / 1.8 
    },
    { 
        id: "enginerev", 
        name: "Engine Rev", 
        category: "alert", 
        desc: "Frequency-modulated acceleration pulse.", 
        code: "0.4 + sin(t * (15 + (t % 2.0) * 45)) * 0.6",
        func: (t) => 0.4 + Math.sin(t * (15 + (t % 2.0) * 45)) * 0.6 
    },
    { 
        id: "sos", 
        name: "S.O.S. Beacon", 
        category: "alert", 
        desc: "Morse code emergency SOS sequence.", 
        code: "cycle = t % 4.0;\ns1 = (cycle < 0.1 || (cycle > 0.2 && cycle < 0.3) || (cycle > 0.4 && cycle < 0.5)) ? 1.0 : 0.0;\no1 = ((cycle > 0.8 && cycle < 1.1) || (cycle > 1.2 && cycle < 1.5) || (cycle > 1.6 && cycle < 1.9)) ? 1.0 : 0.0;\ns2 = ((cycle > 2.2 && cycle < 2.3) || (cycle > 2.4 && cycle < 2.5) || (cycle > 2.6 && cycle < 2.7)) ? 1.0 : 0.0;\ns1 + o1 + s2",
        func: (t) => {
            const cycle = t % 4.0;
            if (cycle < 0.1 || (cycle > 0.2 && cycle < 0.3) || (cycle > 0.4 && cycle < 0.5)) return 1.0;
            if ((cycle > 0.8 && cycle < 1.1) || (cycle > 1.2 && cycle < 1.5) || (cycle > 1.6 && cycle < 1.9)) return 1.0;
            if ((cycle > 2.2 && cycle < 2.3) || (cycle > 2.4 && cycle < 2.5) || (cycle > 2.6 && cycle < 2.7)) return 1.0;
            return 0.0;
        }
    },
    { 
        id: "ambient", 
        name: "Ambient Hum", 
        category: "music", 
        desc: "Gentle low-intensity background pulse.", 
        code: "0.3 + sin(t * 12) * 0.15",
        func: (t) => 0.3 + Math.sin(t * 12) * 0.15 
    },
    { 
        id: "sawtooth_sweep", 
        name: "Sawtooth Sweep", 
        category: "rhythm", 
        desc: "Continuous rising pitch saw sweeps.", 
        code: "t % 1.0",
        func: (t) => (t % 1.0) 
    },
    { 
        id: "mod_rumble", 
        name: "Modulated Rumble", 
        category: "alert", 
        desc: "Amplitude modulated high speed buzz.", 
        code: "(sin(t * 3) * 0.5 + 0.5) * (sin(t * 60) * 0.5 + 0.5)",
        func: (t) => (Math.sin(t * 3) * 0.5 + 0.5) * (Math.sin(t * 60) * 0.5 + 0.5) 
    },
    { 
        id: "chaos_wave", 
        name: "Chaos Waveform", 
        category: "pulse", 
        desc: "Semi-random tactile noise impulses.", 
        code: "max(0, noise(t * 15) * 2.0 - 0.8)",
        func: (t) => Math.max(0, pnoise1(t * 15) * 2.0 - 0.8) 
    },
    { 
        id: "staccato", 
        name: "Staccato Tick", 
        category: "pulse", 
        desc: "Tiny micro-clicks with wide gap intervals.", 
        code: "(t % 0.8 < 0.04) ? 1.0 : 0.0",
        func: (t) => (t % 0.8 < 0.04) ? 1.0 : 0.0 
    },
    // Time-based patterns:
    {
        id: "accelerating_buzz",
        name: "Accelerating Buzz",
        category: "rhythm",
        desc: "A vibration frequency that accelerates over time.",
        code: "modTime = t % 5.0;\nsin(t * (10 + modTime * 20)) * 0.5 + 0.5",
        func: (t) => {
            const modTime = t % 5.0;
            return Math.sin(t * (10 + modTime * 20)) * 0.5 + 0.5;
        }
    },
    {
        id: "bouncing_decay",
        name: "Bouncing Decay",
        category: "pulse",
        desc: "Pulse gaps decay over time to simulate a bouncing ball.",
        code: "cycle = t % 4.0;\ndecay = 1.0 - (cycle / 4.0);\nbounce = frac(cycle * (2.5 + cycle * 1.5));\nsquare(bounce, 0.25) * decay",
        func: (t) => {
            const cycle = t % 4.0;
            const decay = 1.0 - (cycle / 4.0);
            const bounce = (cycle * (2.5 + cycle * 1.5)) % 1.0;
            return (bounce < 0.25 ? 1.0 : 0.0) * decay;
        }
    }
];

export function loadCustomPatterns(frequencyShift, playbackSpeed, masterIntensity, startupFloor) {
    const raw = localStorage.getItem("HAXEL_CUSTOM_PATTERNS");
    if (!raw) return;
    try {
        const list = JSON.parse(raw);
        list.forEach(p => {
            try {
                const ast = new Parser(tokenize(p.code)).parseProgram();
                const evalr = new Evaluator(ast);
                PATTERNS.push({
                    id: p.id,
                    name: p.name,
                    category: "custom",
                    desc: "User defined JavaScript math pattern.",
                    isCustom: true,
                    code: p.code,
                    func: (t) => evalr.run(t, frequencyShift, playbackSpeed, masterIntensity, startupFloor)
                });
            } catch (err) {
                console.error("Failed to load saved pattern:", err);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

// ─── PHONE HAPTICS MODAL LOGIC ───────────────────────────────────────────────
export function initPhoneHaptics(addLog) {
    const phoneHapticsToggle = document.getElementById("phoneHapticsToggle");
    const hapticsStatusText = document.getElementById("hapticsStatusText");
    let isPhoneHapticsEnabled = "vibrate" in navigator;
    let phoneVibrateActive = false;

    if (!("vibrate" in navigator)) {
        if (phoneHapticsToggle) {
            phoneHapticsToggle.checked = false;
            phoneHapticsToggle.disabled = true;
        }
        if (hapticsStatusText) {
            hapticsStatusText.textContent = "Not Supported";
            hapticsStatusText.style.color = "#e23b24"; // Bauhaus Red
        }
        isPhoneHapticsEnabled = false;
    } else {
        if (phoneHapticsToggle) {
            phoneHapticsToggle.addEventListener("change", (e) => {
                isPhoneHapticsEnabled = e.target.checked;
                if (hapticsStatusText) {
                    hapticsStatusText.textContent = isPhoneHapticsEnabled ? "Enabled" : "Disabled";
                    hapticsStatusText.style.color = isPhoneHapticsEnabled ? "#111111" : "#666666";
                }
                if (!isPhoneHapticsEnabled) {
                    navigator.vibrate(0);
                    phoneVibrateActive = false;
                }
                addLog(`[CONFIG] Phone haptics toggled to ${isPhoneHapticsEnabled}`);
            });
        }
    }

    const hapticsModal = document.getElementById("haptics-modal");
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const canControlHaptics = "vibrate" in navigator;

    if (isMobile && !canControlHaptics && hapticsModal) {
        hapticsModal.classList.add("active");
    }

    if (hapticsModal) {
        hapticsModal.addEventListener("click", () => {
            hapticsModal.classList.remove("active");
        });
    }

    return {
        isEnabled: () => isPhoneHapticsEnabled,
        setVibrateActive: (v) => { phoneVibrateActive = v; },
        isVibrateActive: () => phoneVibrateActive
    };
}
