import { tokenize, Parser, Evaluator, pnoise1 } from './compiler.js';
import { addSerialLog } from './emulator.js';

// IDs MUST match firmware PatternRegistry (Patterns.cpp) exactly — case sensitive.
export const PATTERNS = [
    {
        id: "Pulse",
        name: "Pulse Wave",
        category: "pulse",
        desc: "Square on/off click with adjustable duty.",
        code: "square(frac(t * 2.0), 0.35)",
        func: (t) => ((t * 2.0) % 1.0) < 0.35 ? 1.0 : 0.0
    },
    {
        id: "Sine",
        name: "Sine Wave",
        category: "pulse",
        desc: "Smooth sinusoidal envelope.",
        code: "0.5 + 0.5 * sin(t * 6.283)",
        func: (t) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
    },
    {
        id: "Breath",
        name: "Breath",
        category: "pulse",
        desc: "Slow inhale/exhale. Default boot calibration pattern.",
        code: "ph = frac(t / 4.0);\nph < 0.5 ? 0.5 - 0.5 * cos(ph * 6.283) : 0.5 + 0.5 * cos((ph - 0.5) * 6.283)",
        func: (t) => {
            const ph = (t / 4.0) % 1.0;
            return ph < 0.5
                ? 0.5 - 0.5 * Math.cos(ph * Math.PI * 2)
                : 0.5 + 0.5 * Math.cos((ph - 0.5) * Math.PI * 2);
        }
    },
    {
        id: "Heartbeat",
        name: "Heartbeat",
        category: "rhythm",
        desc: "Biometric lub-dub double pulse.",
        code: "p = t % 0.833;\nlub = pow(2.718, -p / 0.062);\ndub = p < 0.25 ? 0 : 0.85 * pow(2.718, -(p - 0.25) / 0.05);\nv = max(lub, dub);\nv < 0.05 ? 0 : v",
        func: (t) => {
            const p = t % 0.833;
            const lub = Math.exp(-p / 0.062);
            const dub = p < 0.25 ? 0 : 0.85 * Math.exp(-(p - 0.25) / 0.05);
            const v = Math.max(lub, dub);
            return v < 0.05 ? 0 : v;
        }
    },
    {
        id: "Rumble",
        name: "Rumble",
        category: "alert",
        desc: "High-frequency warning vibration.",
        code: "0.55 + 0.45 * sin(t * 45)",
        func: (t) => 0.55 + 0.45 * Math.sin(t * 45)
    },
    {
        id: "Tap",
        name: "Tap",
        category: "pulse",
        desc: "Short confirmation taps.",
        code: "(t % 1.0 < 0.08) ? 1.0 : 0.0",
        func: (t) => (t % 1.0 < 0.08) ? 1.0 : 0.0
    },
    {
        id: "Ramp",
        name: "Ramp",
        category: "rhythm",
        desc: "Linear rise then drop.",
        code: "frac(t / 1.5)",
        func: (t) => (t / 1.5) % 1.0
    },
    {
        id: "Staccato",
        name: "Staccato",
        category: "pulse",
        desc: "Tiny micro-clicks with wide gaps.",
        code: "(t % 0.8 < 0.04) ? 1.0 : 0.0",
        func: (t) => (t % 0.8 < 0.04) ? 1.0 : 0.0
    },
    {
        id: "Ocean",
        name: "Ocean",
        category: "music",
        desc: "Gentle rolling waves.",
        code: "0.35 + 0.25 * sin(t * 1.2) + 0.15 * sin(t * 0.4)",
        func: (t) => Math.max(0, Math.min(1, 0.35 + 0.25 * Math.sin(t * 1.2) + 0.15 * Math.sin(t * 0.4)))
    },
    { id: "Triangle", name: "Triangle", category: "pulse", desc: "Linear ramp up and down.",
      code: "ph = frac(t); ph < 0.5 ? ph * 2 : 2 - ph * 2",
      func: (t) => { const ph = t % 1; return ph < 0.5 ? ph * 2 : 2 - ph * 2; } },
    { id: "Throb", name: "Throb", category: "pulse", desc: "Two layered organic sines.",
      code: "(0.5 + 0.5 * sin(t * 25.13)) * (0.5 + 0.5 * sin(t * 4.4))",
      func: (t) => (0.5 + 0.5 * Math.sin(t * Math.PI * 8)) * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.4)) },
    { id: "Click", name: "Click", category: "pulse", desc: "Ultra-short spike click.",
      code: "(t % 0.5 < 0.01) ? 1.0 : 0.0",
      func: (t) => (t % 0.5 < 0.01) ? 1.0 : 0.0 },
    { id: "DoubleTap", name: "Double Tap", category: "pulse", desc: "Confirmation double buzz.",
      code: "(t % 1.5 < 0.08 || (t % 1.5 > 0.16 && t % 1.5 < 0.24)) ? 1.0 : 0.0",
      func: (t) => { const c = t % 1.5; return (c < 0.08 || (c > 0.16 && c < 0.24)) ? 1.0 : 0.0; } },
    { id: "SOS", name: "S.O.S.", category: "alert", desc: "Morse SOS beacon.",
      code: "c=t%4; (c<0.1||(c>0.2&&c<0.3)||(c>0.4&&c<0.5)||(c>0.8&&c<1.1)||(c>1.2&&c<1.5)||(c>1.6&&c<1.9)||(c>2.2&&c<2.3)||(c>2.4&&c<2.5)||(c>2.6&&c<2.7))?1:0",
      func: (t) => {
        const c = t % 4;
        if (c < 0.1 || (c > 0.2 && c < 0.3) || (c > 0.4 && c < 0.5)) return 1;
        if ((c > 0.8 && c < 1.1) || (c > 1.2 && c < 1.5) || (c > 1.6 && c < 1.9)) return 1;
        if ((c > 2.2 && c < 2.3) || (c > 2.4 && c < 2.5) || (c > 2.6 && c < 2.7)) return 1;
        return 0;
      } },
    { id: "EngineRev", name: "Engine Rev", category: "alert", desc: "Frequency-modulated accel pulse.",
      code: "abs(0.4 + 0.6 * sin(t * (15 + (t % 2) * 45)))",
      func: (t) => Math.abs(0.4 + 0.6 * Math.sin(t * (15 + (t % 2) * 45))) },
    { id: "Crescendo", name: "Crescendo", category: "rhythm", desc: "Smooth rise to maximum.",
      code: "frac(t / 1.8)",
      func: (t) => (t / 1.8) % 1.0 },
    { id: "Lighthouse", name: "Lighthouse", category: "ambient", desc: "Slow sweeping beam peak.",
      code: "pow(max(0, sin(t * 1.5)), 6)",
      func: (t) => Math.pow(Math.max(0, Math.sin(t * 1.5)), 6) },
    { id: "AmbientHum", name: "Ambient Hum", category: "ambient", desc: "Gentle background pulse.",
      code: "0.3 + 0.15 * sin(t * 12)",
      func: (t) => 0.3 + 0.15 * Math.sin(t * 12) },
    { id: "ModRumble", name: "Mod Rumble", category: "alert", desc: "AM high-speed buzz.",
      code: "(0.5+0.5*sin(t*3))*(0.5+0.5*sin(t*60))",
      func: (t) => (0.5 + 0.5 * Math.sin(t * 3)) * (0.5 + 0.5 * Math.sin(t * 60)) },
    { id: "ChaosWave", name: "Chaos Wave", category: "pulse", desc: "Semi-random noise impulses.",
      code: "max(0, noise(t * 15) * 2 - 0.8)",
      func: (t) => Math.max(0, pnoise1(t * 15) * 2 - 0.8) },
    { id: "Metronome", name: "Metronome", category: "rhythm", desc: "Precise BPM click.",
      code: "(t % 1.0 < 0.05) ? 1.0 : 0.0",
      func: (t) => (t % 1.0 < 0.05) ? 1.0 : 0.0 },
    { id: "Cascade", name: "Cascade", category: "rhythm", desc: "Multi-channel phase cascade.",
      code: "0.5 + 0.5 * sin(t * 5.236)",
      func: (t) => 0.5 + 0.5 * Math.sin(t * Math.PI * 5 / 3) },
    {
        id: "EnvelopeFollow",
        name: "Envelope Follow",
        category: "music",
        desc: "Audio amplitude follower (needs mic).",
        usesAudio: true,
        code: "0.2 + 0.6 * (0.5 + 0.5 * sin(t * 8))",
        func: (t) => 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 8))
    },
    {
        id: "BassPunch",
        name: "Bass Punch",
        category: "music",
        desc: "Bass-band punch (needs mic).",
        usesAudio: true,
        code: "(t % 0.9 < 0.12) ? 1.0 : 0.15",
        func: (t) => (t % 0.9 < 0.12) ? 1.0 : 0.15
    },
    {
        id: "SpectrumPulse",
        name: "Spectrum Pulse",
        category: "music",
        desc: "FFT spectrum mapped intensity (needs mic).",
        usesAudio: true,
        code: "0.3 + 0.5 * abs(sin(t * 3))",
        func: (t) => 0.3 + 0.5 * Math.abs(Math.sin(t * 3))
    },
    {
        id: "BeatSync",
        name: "Beat Sync",
        category: "music",
        desc: "Beat-synced pulses (needs mic).",
        usesAudio: true,
        code: "(t % 0.5 < 0.1) ? 1.0 : 0.0",
        func: (t) => (t % 0.5 < 0.1) ? 1.0 : 0.0
    },
    { id: "TrebleSpark", name: "Treble Spark", category: "music", desc: "High-band FFT flutter (needs mic).",
      usesAudio: true, code: "noise(t*40)*(0.5+0.5*sin(t*12))",
      func: (t) => pnoise1(t * 40) * (0.5 + 0.5 * Math.sin(t * 12)) },
    { id: "MidPresence", name: "Mid Presence", category: "music", desc: "Mid-band vocal follower (needs mic).",
      usesAudio: true, code: "0.35+0.45*abs(sin(t*5))",
      func: (t) => 0.35 + 0.45 * Math.abs(Math.sin(t * 5)) },
    { id: "AcceleratingBuzz", name: "Accelerating Buzz", category: "time",
      desc: "Buzz frequency accelerates over a cycle.",
      code: "modTime = t % 5.0;\nsin(t * (10 + modTime * 20)) * 0.5 + 0.5",
      func: (t) => { const m = t % 5; return Math.sin(t * (10 + m * 20)) * 0.5 + 0.5; } },
    { id: "BouncingDecay", name: "Bouncing Decay", category: "time",
      desc: "Bounce gaps that decay like a dropped ball.",
      code: "cycle = t % 4.0;\ndecay = 1.0 - (cycle / 4.0);\nbounce = frac(cycle * (2.5 + cycle * 1.5));\nsquare(bounce, 0.25) * decay",
      func: (t) => {
        const c = t % 4; const decay = 1 - c / 4;
        const bounce = (c * (2.5 + c * 1.5)) % 1;
        return (bounce < 0.25 ? 1 : 0) * decay;
      } },
    { id: "TimeSwell", name: "Time Swell", category: "time",
      desc: "Slow breathing swell over a long window.",
      code: "abs(sin(t * (3.1415 / 6.0))) * 0.8",
      func: (t) => Math.abs(Math.sin(t * (Math.PI / 6))) * 0.8 },
    { id: "LinearFade", name: "Linear Fade", category: "time",
      desc: "Starts full and fades to zero each cycle.",
      code: "max(0, 1.0 - (t % 3.0) / 3.0) * (0.5 + 0.5 * sin(t * 188.5))",
      func: (t) => Math.max(0, 1 - (t % 3) / 3) * (0.5 + 0.5 * Math.sin(t * 30 * Math.PI * 2)) },
    { id: "DeceleratingPulse", name: "Decelerating Pulse", category: "time",
      desc: "Pulse rate slows across each cycle.",
      code: "cycle = t % 4.0;\nrate = 1.0 + (3.0 * (1.0 - cycle / 4.0));\nsin(t * rate * 5.0) > 0.5 ? 1.0 : 0.0",
      func: (t) => {
        const c = t % 4; const rate = 1 + 3 * (1 - c / 4);
        return Math.sin(t * rate * 5) > 0.5 ? 1 : 0;
      } },
    { id: "DopplerSweep", name: "Doppler Sweep", category: "time",
      desc: "Passing-source freq + volume shift.",
      code: "cycle = t % 3.0 - 1.5;\nvolume = 1.0 / (1.0 + cycle * cycle * 4.0);\nfreq = 150.0 - cycle * 80.0;\nabs(sin(t * freq * 0.1)) * volume",
      func: (t) => {
        const c = (t % 3) - 1.5;
        const volume = 1 / (1 + c * c * 4);
        const freq = 150 - c * 80;
        return Math.abs(Math.sin(t * freq * 0.1)) * volume;
      } },
    { id: "FibonacciBeat", name: "Fibonacci Beat", category: "time",
      desc: "Hits spaced by Fibonacci intervals.",
      code: "cycle = t % 5.0;\n(cycle < 0.1 || (cycle > 0.2 && cycle < 0.3) || (cycle > 0.5 && cycle < 0.6) || (cycle > 1.0 && cycle < 1.1) || (cycle > 2.1 && cycle < 2.2) || (cycle > 3.4 && cycle < 3.5)) ? 1.0 : 0.0",
      func: (t) => {
        const c = t % 5;
        return (c < 0.1 || (c > 0.2 && c < 0.3) || (c > 0.5 && c < 0.6) || (c > 1.0 && c < 1.1) || (c > 2.1 && c < 2.2) || (c > 3.4 && c < 3.5)) ? 1 : 0;
      } },
    { id: "SawTremolo", name: "Saw Tremolo", category: "time",
      desc: "Fast carrier AM'd by a slow saw.",
      code: "(0.5 + 0.5 * sin(t * 80 * 6.283)) * ((t % 2.0) / 2.0)",
      func: (t) => (0.5 + 0.5 * Math.sin(t * 80 * Math.PI * 2)) * ((t % 2) / 2) },
    {
        id: "External",
        name: "External",
        category: "alert",
        desc: "External sample injection path.",
        code: "0.5",
        func: () => 0.5
    },
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
            hapticsStatusText.style.color = "#e23b24";
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
        setEnabled: (v) => { isPhoneHapticsEnabled = !!v; },
        setVibrateActive: (v) => { phoneVibrateActive = v; },
        isVibrateActive: () => phoneVibrateActive
    };
}
