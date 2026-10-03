/**
 * Apex Parasite: Chimera Odyssey - Start Menu & Awakening Module
 * Implements Step 1 of the Codex: High-contrast Persona 5 aesthetics,
 * pulsating Worm Core (@), scanline canvas, Bio-Essence Sanctuary (Meta),
 * Codex & Mutation Records, and cinematic screen shatter burrowing transition.
 */

export class StartMenu {
  constructor(game, onStartGame) {
    this.game = game;
    this.onStartGame = onStartGame;
    this.overlay = document.getElementById('start-menu-overlay');
    this.canvas = document.getElementById('start-menu-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.panel = document.querySelector('.start-menu-content');

    // Modals
    this.sanctuaryModal = document.getElementById('start-sanctuary-modal');
    this.codexModal = document.getElementById('start-codex-modal');

    // Meta Progression Key
    this.META_STORAGE_KEY = 'apex_parasite_meta_v1';
    this.metaData = this.loadMeta();

    // Canvas animation loop
    this.animId = null;
    this.particles = [];
    this.pulsePhase = 0;

    this.init();
  }

  loadMeta() {
    try {
      const saved = localStorage.getItem(this.META_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load meta progression:', e);
    }
    return {
      primordialSlurry: 150,
      upgrades: {
        chitinSclerosis: 0,
        metabolicThrift: 0,
        parasiticGrip: 0,
        synapticOverdrive: 0,
        hydraResonance: 0
      }
    };
  }

  saveMeta() {
    try {
      localStorage.setItem(this.META_STORAGE_KEY, JSON.stringify(this.metaData));
    } catch (e) {
      console.warn('Could not save meta progression:', e);
    }
  }

  init() {
    if (!this.overlay) return;

    this.initCanvas();
    this.initControls();
    this.init3DTilt();
    this.renderSanctuaryTree();
    this.renderCodexTabs();
    this.startCanvasLoop();
  }

  initCanvas() {
    if (!this.canvas) return;
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Seed spore particles
    this.particles = [];
    for (let i = 0; i < 45; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        radius: 1 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.6,
        color: Math.random() > 0.4 ? 'rgba(0, 240, 255, ' : 'rgba(244, 63, 94, '
      });
    }
  }

  startCanvasLoop() {
    const render = () => {
      if (!this.overlay.classList.contains('hidden')) {
        this.drawCanvas();
        this.animId = requestAnimationFrame(render);
      }
    };
    this.animId = requestAnimationFrame(render);
  }

  drawCanvas() {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Dark bio-void with scanline grid
    this.ctx.fillStyle = '#05070a';
    this.ctx.fillRect(0, 0, w, h);

    // Volumetric gradient center
    const cx = w * 0.5;
    const cy = h * 0.45;
    const radGrd = this.ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.7);
    radGrd.addColorStop(0, 'rgba(15, 23, 42, 0.85)');
    radGrd.addColorStop(0.5, 'rgba(8, 12, 20, 0.95)');
    radGrd.addColorStop(1, 'rgba(5, 7, 10, 1)');
    this.ctx.fillStyle = radGrd;
    this.ctx.fillRect(0, 0, w, h);

    // Glowing organic nerve fibers (procedural curves)
    this.pulsePhase += 0.02;
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = i % 2 === 0 
        ? `rgba(0, 240, 255, ${0.08 + Math.sin(this.pulsePhase + i) * 0.04})` 
        : `rgba(244, 63, 94, ${0.08 + Math.cos(this.pulsePhase + i) * 0.04})`;
      
      const startY = (h / 6) * (i + 1);
      this.ctx.moveTo(0, startY);
      this.ctx.bezierCurveTo(
        w * 0.3, startY + Math.sin(this.pulsePhase + i) * 60,
        w * 0.7, startY - Math.cos(this.pulsePhase + i) * 60,
        w, startY
      );
      this.ctx.stroke();
    }

    // Drifting bio-particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) p.y = h + 10;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color + p.alpha + ')';
      this.ctx.shadowColor = p.color === 'rgba(0, 240, 255, ' ? '#00f0ff' : '#f43f5e';
      this.ctx.shadowBlur = 6;
      this.ctx.fill();
    }
    this.ctx.shadowBlur = 0;

    // Scanlines
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 0; y < h; y += 4) {
      this.ctx.fillRect(0, y, w, 1);
    }
  }

  init3DTilt() {
    if (!this.panel) return;
    window.addEventListener('mousemove', (e) => {
      if (this.overlay.classList.contains('hidden')) return;
      const xPct = (e.clientX / window.innerWidth) - 0.5;
      const yPct = (e.clientY / window.innerHeight) - 0.5;

      const rotX = -yPct * 8; // degrees
      const rotY = xPct * 10;  // degrees
      this.panel.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) skewX(-4deg)`;
    });
  }

  initControls() {
    // Primary Action: Initiate Host Infestation
    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
      btnStart.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
      btnStart.addEventListener('click', () => this.handleStartInfestation());
    }

    // Bio-Essence Sanctuary (Meta)
    const btnSanctuary = document.getElementById('btn-open-sanctuary');
    if (btnSanctuary) {
      btnSanctuary.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
      btnSanctuary.addEventListener('click', () => {
        this.game.audio.playSlice();
        this.openSanctuary();
      });
    }

    const btnCloseSanctuary = document.getElementById('btn-close-sanctuary');
    if (btnCloseSanctuary) {
      btnCloseSanctuary.addEventListener('click', () => {
        this.sanctuaryModal.classList.add('hidden');
      });
    }

    // Codex & Mutation Records
    const btnCodex = document.getElementById('btn-open-codex');
    if (btnCodex) {
      btnCodex.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
      btnCodex.addEventListener('click', () => {
        this.game.audio.playSlice();
        this.openCodex();
      });
    }

    const btnCloseCodex = document.getElementById('btn-close-codex');
    if (btnCloseCodex) {
      btnCloseCodex.addEventListener('click', () => {
        this.codexModal.classList.add('hidden');
      });
    }

    // Sound toggle from start menu
    const btnAudio = document.getElementById('btn-start-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        const isMuted = this.game.audio.toggleMute();
        btnAudio.textContent = isMuted ? '🔇 AUDIO: MUTED' : '🔊 AUDIO: ACTIVE';
      });
    }
  }

  handleStartInfestation() {
    // 1. Visceral Audio Trigger
    this.game.audio.ensureContext();
    this.game.audio.playBurrow();

    // 2. Visual Screen Shatter & chromatic aberration
    this.overlay.classList.add('awakening-shatter');

    // 3. Apply active meta upgrades to the new game
    this.applyMetaToGame();

    // 4. Shatter transition timing
    setTimeout(() => {
      this.overlay.classList.add('hidden');
      this.overlay.classList.remove('awakening-shatter');
      if (this.animId) cancelAnimationFrame(this.animId);

      // Start gameplay orchestrator
      if (this.onStartGame) {
        this.onStartGame();
      }
    }, 700);
  }

  applyMetaToGame() {
    const up = this.metaData.upgrades;
    if (up.chitinSclerosis > 0) {
      const bonusBlood = up.chitinSclerosis * 15;
      this.game.maxBlood += bonusBlood;
      this.game.blood += bonusBlood;
    }
    if (up.metabolicThrift > 0) {
      this.game.calorieMod = Math.max(0.5, 1.0 - up.metabolicThrift * 0.12);
    }
    if (up.parasiticGrip > 0) {
      this.game.extractionBonus = up.parasiticGrip * 15;
    }
    if (up.synapticOverdrive > 0) {
      this.game.bandwidthBonus = up.synapticOverdrive * 1;
    }
    if (up.hydraResonance > 0) {
      this.game.hydraResonance = true;
    }
  }

  openSanctuary() {
    this.renderSanctuaryTree();
    this.sanctuaryModal.classList.remove('hidden');
  }

  renderSanctuaryTree() {
    const slurryEl = document.getElementById('sanctuary-slurry-val');
    if (slurryEl) slurryEl.textContent = this.metaData.primordialSlurry;

    const listEl = document.getElementById('sanctuary-upgrades-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const upgradeDefs = [
      {
        id: 'chitinSclerosis',
        name: 'Chitin Sclerotization',
        desc: 'Reinforces the host vascular tissue with calcified chitin. +15 Max Blood Volume per rank.',
        cost: 40,
        maxRank: 5
      },
      {
        id: 'metabolicThrift',
        name: 'Metabolic Thrift',
        desc: 'Optimizes organ caloric burn. Reduces movement & exploration calorie costs by 12% per rank.',
        cost: 50,
        maxRank: 4
      },
      {
        id: 'parasiticGrip',
        name: 'Parasitic Clamping Grip',
        desc: 'Sharpens bio-tendril surgical control. Increases clean limb extraction chance in surgery by +15% per rank.',
        cost: 45,
        maxRank: 4
      },
      {
        id: 'synapticOverdrive',
        name: 'Synaptic Overdrive',
        desc: 'Expands parasitical neural capacity. +1 Max Mental Bandwidth for auxiliary weapons.',
        cost: 75,
        maxRank: 3
      },
      {
        id: 'hydraResonance',
        name: 'False Hydra Resonance',
        desc: 'Allows the Chimera to graft secondary cranial heads without motor coordination penalty.',
        cost: 100,
        maxRank: 1
      }
    ];

    upgradeDefs.forEach(def => {
      const currentRank = this.metaData.upgrades[def.id] || 0;
      const isMaxed = currentRank >= def.maxRank;
      const canAfford = this.metaData.primordialSlurry >= def.cost && !isMaxed;

      const card = document.createElement('div');
      card.className = 'sanctuary-card';
      card.innerHTML = `
        <div class="sanctuary-card-info">
          <div class="card-title-row">
            <span class="card-name">${def.name}</span>
            <span class="card-rank">RANK ${currentRank}/${def.maxRank}</span>
          </div>
          <p class="card-desc">${def.desc}</p>
        </div>
        <div class="sanctuary-card-action">
          <button class="hud-btn ${canAfford ? 'p5-btn-gold' : 'p5-btn'}" ${!canAfford ? 'disabled' : ''}>
            ${isMaxed ? 'MAX RANK' : `EVOLVE [${def.cost} SLURRY]`}
          </button>
        </div>
      `;

      const btn = card.querySelector('button');
      if (btn && canAfford) {
        btn.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
        btn.addEventListener('click', () => {
          this.metaData.primordialSlurry -= def.cost;
          this.metaData.upgrades[def.id] = currentRank + 1;
          this.saveMeta();
          this.game.audio.playSquelch();
          this.renderSanctuaryTree();
        });
      }

      listEl.appendChild(card);
    });
  }

  openCodex() {
    this.codexModal.classList.remove('hidden');
  }

  renderCodexTabs() {
    const tabs = document.querySelectorAll('.codex-tab-btn');
    const sections = {
      taxonomy: document.getElementById('codex-sec-taxonomy'),
      bestiary: document.getElementById('codex-sec-bestiary'),
      mechanics: document.getElementById('codex-sec-mechanics')
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.game.audio.playSlice();
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.dataset.target;
        Object.keys(sections).forEach(k => {
          if (sections[k]) {
            if (k === target) sections[k].classList.remove('hidden');
            else sections[k].classList.add('hidden');
          }
        });
      });
    });
  }

  showMenu() {
    this.overlay.classList.remove('hidden');
    this.startCanvasLoop();
  }
}
