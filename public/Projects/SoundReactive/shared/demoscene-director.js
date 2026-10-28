/**
 * demoscene-director.js - 64Kb Demoscene Cinematography & Storyboard Director
 * 
 * Features:
 * - 3D Catmull-Rom Camera Spline evaluator (Pos, Target, Roll, FOV)
 * - Audio-reactive camera shake & transient field-of-view kicks
 * - Multi-act timeline sequencer with smooth crossfades and beat quantization
 * - High-tech Neo-Noir transport bar (scrubbing, bookmarks, telemetry, fullscreen)
 */

export class SplineCamera {
  constructor(keyframes = []) {
    this.keyframes = keyframes;
    this.currentPos = [0, 0, 10];
    this.currentTarget = [0, 0, 0];
    this.currentUp = [0, 1, 0];
    this.currentFov = 60.0;
    this.currentRoll = 0.0;
  }

  setKeyframes(keyframes) {
    this.keyframes = keyframes;
  }

  // Catmull-Rom 1D interpolation
  catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  // Catmull-Rom 3D interpolation
  catmullRom3(p0, p1, p2, p3, t) {
    return [
      this.catmullRom(p0[0], p1[0], p2[0], p3[0], t),
      this.catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      this.catmullRom(p0[2], p1[2], p2[2], p3[2], t)
    ];
  }

  evaluate(time, audioShake = 0.0) {
    if (!this.keyframes || this.keyframes.length === 0) {
      return {
        pos: this.currentPos,
        target: this.currentTarget,
        up: this.currentUp,
        fov: this.currentFov,
        roll: this.currentRoll
      };
    }

    if (this.keyframes.length === 1) {
      const kf = this.keyframes[0];
      return {
        pos: [...kf.pos],
        target: [...kf.target],
        up: [0, 1, 0],
        fov: kf.fov || 60,
        roll: kf.roll || 0
      };
    }

    // Find surrounding keyframe indices
    let idx = 0;
    while (idx < this.keyframes.length - 1 && this.keyframes[idx + 1].t <= time) {
      idx++;
    }

    const kf1 = this.keyframes[idx];
    const kf2 = this.keyframes[Math.min(idx + 1, this.keyframes.length - 1)];

    const kf0 = this.keyframes[Math.max(0, idx - 1)];
    const kf3 = this.keyframes[Math.min(this.keyframes.length - 1, idx + 2)];

    let localT = 0;
    const dt = kf2.t - kf1.t;
    if (dt > 0.0001) {
      localT = Math.max(0, Math.min(1, (time - kf1.t) / dt));
    }

    // Interpolate Position and Target
    let pos = this.catmullRom3(kf0.pos, kf1.pos, kf2.pos, kf3.pos, localT);
    let target = this.catmullRom3(kf0.target, kf1.target, kf2.target, kf3.target, localT);

    // Interpolate Roll & FOV
    const r0 = kf0.roll || 0, r1 = kf1.roll || 0, r2 = kf2.roll || 0, r3 = kf3.roll || 0;
    let roll = this.catmullRom(r0, r1, r2, r3, localT);

    const f0 = kf0.fov || 60, f1 = kf1.fov || 60, f2 = kf2.fov || 60, f3 = kf3.fov || 60;
    let fov = this.catmullRom(f0, f1, f2, f3, localT);

    // Audio Kick-Shake injection
    if (audioShake > 0.001) {
      const shakeX = (Math.sin(time * 80.0) + Math.cos(time * 110.0)) * 0.5 * audioShake;
      const shakeY = (Math.cos(time * 95.0) + Math.sin(time * 135.0)) * 0.5 * audioShake;
      pos[0] += shakeX;
      pos[1] += shakeY;
      fov -= audioShake * 3.5;
    }

    // Compute Up vector with roll
    const fwd = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
    const fLen = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1.0;
    const cw = [fwd[0] / fLen, fwd[1] / fLen, fwd[2] / fLen];

    let baseUp = [0, 1, 0];
    if (Math.abs(cw[1]) > 0.99) baseUp = [0, 0, 1];

    // Right vector cu = normalize(cross(cw, baseUp))
    let cu = [
      cw[1] * baseUp[2] - cw[2] * baseUp[1],
      cw[2] * baseUp[0] - cw[0] * baseUp[2],
      cw[0] * baseUp[1] - cw[1] * baseUp[0]
    ];
    const cuLen = Math.hypot(cu[0], cu[1], cu[2]) || 1.0;
    cu = [cu[0] / cuLen, cu[1] / cuLen, cu[2] / cuLen];

    // Up vector cv = cross(cu, cw)
    let cv = [
      cu[1] * cw[2] - cu[2] * cw[1],
      cu[2] * cw[0] - cu[0] * cw[2],
      cu[0] * cw[1] - cu[1] * cw[0]
    ];

    // Apply Roll
    if (Math.abs(roll) > 0.0001) {
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);
      const rolledUp = [
        cv[0] * cosR + cu[0] * sinR,
        cv[1] * cosR + cu[1] * sinR,
        cv[2] * cosR + cu[2] * sinR
      ];
      this.currentUp = rolledUp;
    } else {
      this.currentUp = cv;
    }

    this.currentPos = pos;
    this.currentTarget = target;
    this.currentFov = fov;
    this.currentRoll = roll;

    return {
      pos: this.currentPos,
      target: this.currentTarget,
      up: this.currentUp,
      fov: this.currentFov,
      roll: this.currentRoll
    };
  }
}

export class TimelineDirector {
  constructor(acts = [], options = {}) {
    this.acts = acts;
    this.options = Object.assign({
      loop: true,
      onActChange: null,
      onTimeUpdate: null
    }, options);

    this.currentTime = 0;
    this.isPlaying = true;
    this.playbackSpeed = 1.0;
    this.currentActIndex = 0;
    this.totalDuration = acts.length > 0 ? acts[acts.length - 1].endTime : 120;
    this.camera = new SplineCamera();
  }

  init() {
    this.updateCurrentAct();
  }

  update(dt, audioTelemetry = null) {
    if (this.isPlaying) {
      this.currentTime += dt * this.playbackSpeed;
      if (this.currentTime >= this.totalDuration) {
        if (this.options.loop) {
          this.currentTime = this.currentTime % this.totalDuration;
        } else {
          this.currentTime = this.totalDuration;
          this.isPlaying = false;
        }
      }
    }

    this.updateCurrentAct();

    const act = this.getCurrentAct();
    if (act && act.cameraKeyframes) {
      this.camera.setKeyframes(act.cameraKeyframes);
    }

    const shake = audioTelemetry ? (audioTelemetry.transientAttack * 0.15 + audioTelemetry.subBass * 0.08) : 0;
    const camState = this.camera.evaluate(this.currentTime, shake);

    return {
      time: this.currentTime,
      act: act,
      actIndex: this.currentActIndex,
      actProgress: act ? (this.currentTime - act.startTime) / Math.max(0.001, act.endTime - act.startTime) : 0,
      camera: camState
    };
  }

  updateCurrentAct() {
    let oldIndex = this.currentActIndex;
    let found = 0;
    for (let i = 0; i < this.acts.length; i++) {
      if (this.currentTime >= this.acts[i].startTime && this.currentTime < this.acts[i].endTime) {
        found = i;
        break;
      }
    }
    if (this.currentTime >= this.totalDuration && this.acts.length > 0) {
      found = this.acts.length - 1;
    }
    this.currentActIndex = found;
    if (oldIndex !== this.currentActIndex && this.options.onActChange) {
      this.options.onActChange(this.acts[this.currentActIndex], this.currentActIndex);
    }
  }

  getCurrentAct() {
    return this.acts[this.currentActIndex] || null;
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
    this.updateCurrentAct();
  }

  seekToAct(index) {
    if (index >= 0 && index < this.acts.length) {
      this.seek(this.acts[index].startTime + 0.01);
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }
}

export class DemosceneHUD {
  constructor(director, audioEngine, title = '64KB DEMOSCENE SHOW') {
    this.director = director;
    this.audioEngine = audioEngine;
    this.title = title;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.isVisible = true;

    this.createDOM();
    this.bindEvents();
  }

  createDOM() {
    const hud = document.createElement('div');
    hud.className = 'demoscene-hud';
    hud.id = 'demoscene-hud';

    hud.innerHTML = `
      <!-- Top Status Header -->
      <div class="hud-top-bar">
        <div class="hud-left">
          <a href="../../index.html" class="hud-back-btn">/// RETURN_HUB</a>
          <span class="hud-title">${this.title}</span>
          <span class="hud-badge" id="hud-act-badge">ACT 01 // GENESIS</span>
        </div>
        <div class="hud-right">
          <span class="hud-telemetry-chip" id="hud-fps">FPS: 60</span>
          <span class="hud-telemetry-chip" id="hud-timecode">00:00 / 02:00</span>
          <button class="hud-btn" id="btn-hud-toggle" title="Toggle HUD [H]">HUD [H]</button>
          <button class="hud-btn" id="btn-fullscreen" title="Fullscreen [F]">EXPAND [F]</button>
        </div>
      </div>

      <!-- Center Sub-bass Transient Flash -->
      <div class="hud-flash" id="hud-flash"></div>

      <!-- Bottom Cinematic Transport Bar -->
      <div class="hud-bottom-bar">
        <div class="hud-controls-row">
          <button class="hud-ctrl-btn" id="btn-play-pause">PAUSE</button>
          <button class="hud-ctrl-btn" id="btn-prev-act">&lt;&lt; ACT</button>
          <button class="hud-ctrl-btn" id="btn-next-act">ACT &gt;&gt;</button>
          
          <div class="hud-act-name" id="hud-act-name">01 // INITIALIZING FRACTAL VOID</div>

          <div class="hud-audio-group">
            <button class="hud-ctrl-btn active" id="btn-audio-demo">DEMO SYNTH</button>
            <button class="hud-ctrl-btn" id="btn-audio-mic">MIC IN</button>
            <label class="hud-ctrl-btn" for="file-audio-input" style="cursor:pointer; margin-bottom:0;">
              FILE DROP
              <input type="file" id="file-audio-input" accept="audio/*" style="display:none;">
            </label>
          </div>
        </div>

        <!-- Scrubber with Act Bookmarks -->
        <div class="hud-timeline-container" id="hud-timeline-track">
          <div class="hud-timeline-fill" id="hud-timeline-fill"></div>
          <div class="hud-timeline-scrubber" id="hud-timeline-scrubber"></div>
          <div class="hud-act-markers" id="hud-act-markers"></div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    // Create Act Markers on Timeline
    const markersContainer = hud.querySelector('#hud-act-markers');
    const totalDur = this.director.totalDuration;
    this.director.acts.forEach((act, idx) => {
      const marker = document.createElement('div');
      marker.className = 'hud-marker';
      const pct = (act.startTime / totalDur) * 100;
      marker.style.left = `${pct}%`;
      marker.title = `${act.name} (${Math.floor(act.startTime)}s)`;
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        this.director.seekToAct(idx);
      });
      markersContainer.appendChild(marker);
    });

    this.dom = {
      hud,
      actBadge: hud.querySelector('#hud-act-badge'),
      actName: hud.querySelector('#hud-act-name'),
      timecode: hud.querySelector('#hud-timecode'),
      fps: hud.querySelector('#hud-fps'),
      timelineFill: hud.querySelector('#hud-timeline-fill'),
      timelineScrubber: hud.querySelector('#hud-timeline-scrubber'),
      timelineTrack: hud.querySelector('#hud-timeline-track'),
      btnPlayPause: hud.querySelector('#btn-play-pause'),
      btnPrevAct: hud.querySelector('#btn-prev-act'),
      btnNextAct: hud.querySelector('#btn-next-act'),
      btnFullscreen: hud.querySelector('#btn-fullscreen'),
      btnHudToggle: hud.querySelector('#btn-hud-toggle'),
      btnAudioDemo: hud.querySelector('#btn-audio-demo'),
      btnAudioMic: hud.querySelector('#btn-audio-mic'),
      fileAudioInput: hud.querySelector('#file-audio-input'),
      flash: hud.querySelector('#hud-flash')
    };
  }

  bindEvents() {
    this.dom.btnPlayPause.addEventListener('click', () => {
      const playing = this.director.togglePlay();
      this.dom.btnPlayPause.textContent = playing ? 'PAUSE' : 'PLAY';
    });

    this.dom.btnPrevAct.addEventListener('click', () => {
      this.director.seekToAct(this.director.currentActIndex - 1);
    });

    this.dom.btnNextAct.addEventListener('click', () => {
      this.director.seekToAct(this.director.currentActIndex + 1);
    });

    this.dom.timelineTrack.addEventListener('click', (e) => {
      const rect = this.dom.timelineTrack.getBoundingClientRect();
      const clickT = (e.clientX - rect.left) / rect.width;
      this.director.seek(clickT * this.director.totalDuration);
    });

    this.dom.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.dom.btnHudToggle.addEventListener('click', () => this.toggleHUD());

    // Audio Selectors
    this.dom.btnAudioDemo.addEventListener('click', () => {
      this.audioEngine.startDemoSynth();
      this.dom.btnAudioDemo.classList.add('active');
      this.dom.btnAudioMic.classList.remove('active');
    });

    this.dom.btnAudioMic.addEventListener('click', async () => {
      const res = await this.audioEngine.init(true);
      if (res.success && res.mode === 'mic') {
        this.dom.btnAudioMic.classList.add('active');
        this.dom.btnAudioDemo.classList.remove('active');
      }
    });

    this.dom.fileAudioInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.audioEngine.loadFile(file);
        this.dom.btnAudioDemo.classList.remove('active');
        this.dom.btnAudioMic.classList.remove('active');
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const playing = this.director.togglePlay();
        this.dom.btnPlayPause.textContent = playing ? 'PAUSE' : 'PLAY';
      } else if (e.code === 'KeyF') {
        this.toggleFullscreen();
      } else if (e.code === 'KeyH') {
        this.toggleHUD();
      } else if (e.code === 'ArrowLeft') {
        this.director.seek(this.director.currentTime - 5);
      } else if (e.code === 'ArrowRight') {
        this.director.seek(this.director.currentTime + 5);
      }
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  toggleHUD() {
    this.isVisible = !this.isVisible;
    this.dom.hud.style.opacity = this.isVisible ? '1' : '0';
    this.dom.hud.style.pointerEvents = this.isVisible ? 'all' : 'none';
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  update(state, audioTelemetry) {
    // FPS counter
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      this.dom.fps.textContent = `FPS: ${this.fps}`;
    }

    // Timecode & Progress
    const pct = (state.time / this.director.totalDuration) * 100;
    this.dom.timelineFill.style.width = `${pct}%`;
    this.dom.timelineScrubber.style.left = `${pct}%`;
    this.dom.timecode.textContent = `${this.formatTime(state.time)} / ${this.formatTime(this.director.totalDuration)}`;

    // Act info
    if (state.act) {
      this.dom.actBadge.textContent = `ACT 0${state.actIndex + 1} // ${state.act.name}`;
      this.dom.actName.textContent = state.act.desc || state.act.name;
    }

    // Sub-bass transient screen flash
    if (audioTelemetry && audioTelemetry.transientAttack > 0.4) {
      this.dom.flash.style.opacity = (audioTelemetry.transientAttack * 0.35).toString();
    } else {
      this.dom.flash.style.opacity = '0';
    }
  }
}
