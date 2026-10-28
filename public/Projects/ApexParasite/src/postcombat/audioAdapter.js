/**
 * Apex Parasite - Post-Combat Audio Adapter
 * Implements the Section 5.4 Audio Interface:
 * audio = { heartbeat(bpm, strength), flatline(), cut(), tear(), chime(rarity), lap(), clamp(), stop() }
 * Uses native Web Audio procedural synthesis with zero external dependencies.
 */

export function createAudioAdapter({ enabled = true, onLog = null, externalBioAudio = null } = {}) {
  let ctx = null;
  let isMuted = !enabled;
  let heartbeatTimer = null;
  let heartbeatActive = false;
  let currentBpm = 60;
  let currentStrength = 0.5;

  function ensureContext() {
    if (isMuted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    } else if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function log(name, ...args) {
    if (onLog) {
      onLog(`[Audio] ${name}`, ...args);
    }
  }

  const adapter = {
    setMuted(muted) {
      isMuted = muted;
      if (isMuted) {
        this.stop();
      }
    },

    isMuted() {
      return isMuted;
    },

    heartbeat(bpm = 60, strength = 0.5) {
      currentBpm = Math.max(30, Math.min(180, bpm));
      currentStrength = Math.max(0.1, Math.min(1.0, strength));
      log('heartbeat', { bpm: currentBpm, strength: currentStrength });

      if (isMuted) return;
      heartbeatActive = true;

      if (!heartbeatTimer) {
        const beat = () => {
          if (!heartbeatActive || isMuted) {
            heartbeatTimer = null;
            return;
          }
          const audioCtx = ensureContext();
          if (audioCtx && audioCtx.state === 'running') {
            const now = audioCtx.currentTime;
            // Primary 'lub'
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(65, now);
            osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

            const vol = 0.25 * currentStrength;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.13);

            // Secondary 'dub'
            setTimeout(() => {
              if (!heartbeatActive || isMuted || !ctx) return;
              const t = ctx.currentTime;
              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.type = 'sine';
              osc2.frequency.setValueAtTime(55, t);
              osc2.frequency.exponentialRampToValueAtTime(28, t + 0.1);
              gain2.gain.setValueAtTime(vol * 0.7, t);
              gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.start(t);
              osc2.stop(t + 0.11);
            }, 120);
          }
          const intervalMs = (60 / currentBpm) * 1000;
          heartbeatTimer = setTimeout(beat, intervalMs);
        };
        beat();
      }
    },

    flatline() {
      log('flatline');
      this.stop();
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // 880Hz monitor flatline tone
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.25);
    },

    cut() {
      log('cut');
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.09);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(600, now);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    },

    tear() {
      log('tear');
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      // Filtered noise burst for tearing flesh / breaking organ
      const bufferSize = audioCtx.sampleRate * 0.2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.Q.setValueAtTime(2.0, now);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
    },

    chime(rarity = 'common') {
      log('chime', rarity);
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      const pitchMap = {
        common: [440, 554],
        uncommon: [523, 659],
        rare: [587, 740, 880],
        epic: [659, 830, 987, 1318],
        legendary: [523, 659, 783, 1046, 1318]
      };

      const notes = pitchMap[rarity] || pitchMap.common;
      notes.forEach((freq, idx) => {
        const now = audioCtx.currentTime + idx * 0.06;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.36);
      });
    },

    lap() {
      log('lap');
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      // Wet, deep biomass devouring slurps
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    },

    clamp() {
      log('clamp');
      if (isMuted) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      // Metallic ratchet snap
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    },

    stop() {
      heartbeatActive = false;
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  };

  return adapter;
}
