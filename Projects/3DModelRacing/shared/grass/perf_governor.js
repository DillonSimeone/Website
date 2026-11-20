/**
 * shared/grass/perf_governor.js — Hardware Detection & Real-Time 60 FPS Governor
 *
 * Allocates an aggressive VRAM pool scaled to device memory, core count, and GPU class,
 * then dynamically tunes GrassField.instanceCount, DPR, and outer ring culling every
 * 0.25s to lock 60 FPS on weaker hardware while saturating available VRAM/GPU headroom.
 */

export const PERF_MODE_STORAGE_KEY = 'model3d_perf_mode';

export const PERF_PRESET_SCALES = {
    ultra: 1.0,
    high: 0.78,
    medium: 0.50,
    low: 0.25
};

/**
 * Probes WebGL & device capabilities to size the instanced grass VRAM pool.
 */
export function detectHardwareProfile(renderer = null) {
    let gpuName = 'Standard WebGL';
    let maxTexSize = 4096;

    if (renderer) {
        try {
            const gl = renderer.getContext();
            if (gl) {
                maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) {
                    gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gpuName;
                }
            }
        } catch (_) {}
    }

    const deviceMemoryGB = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 8;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
        || (typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768 && ('ontouchstart' in window));

    const lowerGpu = gpuName.toLowerCase();
    const isSoftware = /swiftshader|llvmpipe|software|microsoft basic/i.test(lowerGpu);
    const isDedicatedDesktop = !isMobile && !isSoftware && /(rtx|gtx|radeon rx|radeon pro|arc a|titan|quadro|vega)/i.test(lowerGpu);
    const isIntegrated = /intel|uhd|iris|mali|adreno|powervr/i.test(lowerGpu);

    let tier = 'mid';
    if (isSoftware || isMobile || deviceMemoryGB <= 4 || cores <= 2) {
        tier = isMobile && deviceMemoryGB >= 6 && cores >= 6 ? 'mid' : 'low';
    } else if (isDedicatedDesktop || (deviceMemoryGB >= 8 && cores >= 8 && !isIntegrated && maxTexSize >= 8192)) {
        tier = 'high';
    }

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    if (tier === 'high') {
        return {
            tier: 'high',
            maxTotalBlades: 4000000,
            initialDensityScale: 0.88,
            maxDpr: Math.min(dpr, 2.0),
            shadowMapSize: 2048,
            isMobile,
            gpuName,
            deviceMemoryGB,
            cores
        };
    }
    if (tier === 'mid') {
        return {
            tier: 'mid',
            maxTotalBlades: 2000000,
            initialDensityScale: 0.58,
            maxDpr: Math.min(dpr, 1.5),
            shadowMapSize: 1024,
            isMobile,
            gpuName,
            deviceMemoryGB,
            cores
        };
    }
    return {
        tier: 'low',
        maxTotalBlades: 900000,
        initialDensityScale: 0.35,
        maxDpr: 1.0,
        shadowMapSize: 1024,
        isMobile,
        gpuName,
        deviceMemoryGB,
        cores
    };
}

export function loadSavedPerfMode() {
    try {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(PERF_MODE_STORAGE_KEY);
            if (saved && (saved === 'auto' || PERF_PRESET_SCALES[saved] !== undefined)) {
                return saved;
            }
        }
    } catch (_) {}
    return 'auto';
}

export function savePerfMode(mode) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PERF_MODE_STORAGE_KEY, mode);
        }
    } catch (_) {}
}

export class PerformanceGovernor {
    constructor(options = {}) {
        this.renderer = options.renderer || null;
        this.grassField = options.grassField || null;
        this.hardwareProfile = options.hardwareProfile || detectHardwareProfile(this.renderer);
        this.targetFps = options.targetFps || 60;
        this.targetFrameMs = 1000.0 / this.targetFps;
        this.onQualityChange = options.onQualityChange || null;

        this.mode = options.mode || loadSavedPerfMode();
        this.densityScale = this.mode === 'auto'
            ? (this.hardwareProfile.initialDensityScale || 0.75)
            : (PERF_PRESET_SCALES[this.mode] || 0.75);

        this.currentDpr = this.hardwareProfile.maxDpr || 1.0;
        this.activeRingLimit = 6;

        this.emaFrameMs = this.targetFrameMs;
        this.warmupTimer = 0.0;
        this.evalTimer = 0.0;
        this.evalInterval = 0.25;
        this.enabled = true;

        this.applyImmediate();
    }

    setTargets({ renderer, grassField, onQualityChange }) {
        if (renderer) this.renderer = renderer;
        if (grassField) this.grassField = grassField;
        if (onQualityChange) this.onQualityChange = onQualityChange;
        this.applyImmediate();
    }

    setMode(mode, persist = true) {
        if (mode !== 'auto' && PERF_PRESET_SCALES[mode] === undefined) return;
        this.mode = mode;
        if (persist) savePerfMode(mode);

        if (mode !== 'auto') {
            this.densityScale = PERF_PRESET_SCALES[mode];
            this.currentDpr = mode === 'low' ? 1.0 : this.hardwareProfile.maxDpr;
            this.activeRingLimit = mode === 'low' ? 5 : 6;
        } else {
            this.warmupTimer = 0.0;
            this.evalTimer = 0.0;
            this.emaFrameMs = this.targetFrameMs;
        }
        this.applyImmediate();
    }

    cycleMode() {
        const order = ['auto', 'ultra', 'high', 'medium', 'low'];
        const idx = order.indexOf(this.mode);
        const next = order[(idx + 1) % order.length];
        this.setMode(next, true);
        return next;
    }

    applyImmediate() {
        if (this.grassField) {
            this.grassField.setDensityScale(this.densityScale);
            if (typeof this.grassField.setActiveRingLimit === 'function') {
                this.grassField.setActiveRingLimit(this.activeRingLimit);
            }
        }
        if (this.renderer && typeof this.renderer.setPixelRatio === 'function') {
            if (Math.abs(this.renderer.getPixelRatio() - this.currentDpr) > 0.02) {
                this.renderer.setPixelRatio(this.currentDpr);
            }
        }
        if (this.onQualityChange) {
            this.onQualityChange(this.getStatus());
        }
    }

    reset() {
        this.emaFrameMs = this.targetFrameMs;
        this.warmupTimer = 0.0;
        this.evalTimer = 0.0;
    }

    update(deltaSec) {
        if (!this.enabled || deltaSec <= 0) return;

        const frameMs = Math.min(deltaSec * 1000.0, 120.0);
        this.emaFrameMs = this.emaFrameMs * 0.88 + frameMs * 0.12;

        if (this.mode !== 'auto') return;

        this.warmupTimer += deltaSec;
        if (this.warmupTimer < 0.6) return;

        this.evalTimer += deltaSec;
        if (this.evalTimer < this.evalInterval) return;
        this.evalTimer = 0.0;

        let changed = false;
        const maxDpr = this.hardwareProfile.maxDpr || 1.0;

        // Deadband [14.5ms, 17.8ms] prevents oscillation around 60 FPS
        if (this.emaFrameMs > 17.8) {
            // Below ~56 FPS: dial back smoothly
            const overage = this.emaFrameMs - this.targetFrameMs;
            const stepDown = Math.min(0.14, Math.max(0.03, overage * 0.011));
            const nextScale = Math.max(0.12, this.densityScale - stepDown);
            if (Math.abs(nextScale - this.densityScale) > 0.004) {
                this.densityScale = nextScale;
                changed = true;
            }

            if (this.densityScale < 0.35 && this.emaFrameMs > 19.2) {
                const targetDpr = this.emaFrameMs > 23.5 ? 0.85 : 1.0;
                const nextDpr = Math.min(this.currentDpr, targetDpr);
                if (nextDpr < this.currentDpr - 0.02) {
                    this.currentDpr = nextDpr;
                    changed = true;
                }
            }

            if (this.emaFrameMs > 23.8 && this.activeRingLimit > 5) {
                this.activeRingLimit = 5;
                changed = true;
            }
        } else if (this.emaFrameMs < 14.5) {
            // Headroom above ~69 FPS: restore DPR, full ring count, and ramp density up to 100% of VRAM pool
            if (this.activeRingLimit < 6) {
                this.activeRingLimit = 6;
                changed = true;
            } else if (this.currentDpr < maxDpr - 0.02) {
                this.currentDpr = Math.min(maxDpr, this.currentDpr + 0.25);
                changed = true;
            } else if (this.densityScale < 0.999) {
                const stepUp = this.emaFrameMs < 11.0 ? 0.06 : 0.035;
                const nextScale = Math.min(1.0, this.densityScale + stepUp);
                if (nextScale > this.densityScale + 0.004) {
                    this.densityScale = nextScale;
                    changed = true;
                }
            }
        }

        if (changed) {
            this.applyImmediate();
        }
    }

    getStatus() {
        return {
            mode: this.mode,
            densityScale: this.densityScale,
            densityPercent: Math.round(this.densityScale * 100),
            dpr: this.currentDpr,
            activeRingLimit: this.activeRingLimit,
            emaFps: Math.round(1000.0 / Math.max(1.0, this.emaFrameMs)),
            tier: this.hardwareProfile.tier
        };
    }
}
