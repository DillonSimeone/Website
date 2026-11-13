// Procedural Web Audio synth + spring animation helpers for tactile UI juice

class SoundEngine {
    constructor() {
        this.enabled = true;
        this.ctx = null;
    }

    _ensureCtx() {
        if (!this.enabled) return null;
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    playPop(pitch = 420) {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch * 0.65, now);
        osc.frequency.exponentialRampToValueAtTime(pitch * 1.45, now + 0.06);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playClick(freq = 680) {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.045);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    playDelete() {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playExport() {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const now = ctx.currentTime + i * 0.055;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.19);
        });
    }
}

export const sound = new SoundEngine();

/**
 * Damped spring step for 1D value: returns { val, vel }
 */
export function stepSpring(val, vel, target, dt, stiffness = 260, damping = 18) {
    const force = (target - val) * stiffness;
    vel = (vel + force * dt) * Math.exp(-damping * dt);
    val += vel * dt;
    return { val, vel };
}
