// Ultra-High-Performance Offscreen Sprite Soul Engine for APOTHEOSIS

// Pre-rendered Soul Face Sprite Cache
const SPRITE_WIDTH = 64;
const SPRITE_HEIGHT = 120;
const soulSpriteCache = [];

function generateSoulSprite(type, hue) {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_WIDTH;
    canvas.height = SPRITE_HEIGHT;
    const ctx = canvas.getContext('2d');

    const centerX = SPRITE_WIDTH / 2;
    const headY = 32;
    const headSize = 22;

    const mainColor = `hsl(${hue}, 90%, 70%)`;
    const glowColor = `hsl(${hue}, 95%, 55%)`;
    const eyeColor = `hsl(${hue}, 100%, 94%)`;

    // 1. Pre-render Tail (Pointing straight down along +y)
    const tailLength = 65;
    const grad = ctx.createLinearGradient(0, headY, 0, headY + tailLength);
    grad.addColorStop(0, mainColor);
    grad.addColorStop(0.4, glowColor);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(centerX - headSize * 0.35, headY + 5);
    ctx.quadraticCurveTo(centerX + 8, headY + tailLength * 0.5, centerX, headY + tailLength);
    ctx.quadraticCurveTo(centerX - 8, headY + tailLength * 0.5, centerX + headSize * 0.35, headY + 5);
    ctx.closePath();
    ctx.fill();

    // 2. Pre-render Head Contour
    ctx.fillStyle = 'rgba(4, 3, 8, 0.88)';
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.2;

    ctx.beginPath();
    if (type === 0) {
        // Human Skull
        ctx.ellipse(centerX, headY, headSize * 0.45, headSize * 0.6, 0, 0, Math.PI * 2);
    } else if (type === 1) {
        // Horned Demon
        ctx.moveTo(centerX - headSize * 0.35, headY);
        ctx.quadraticCurveTo(centerX - headSize * 0.8, headY - headSize * 0.8, centerX - headSize * 0.35, headY - headSize * 0.9);
        ctx.quadraticCurveTo(centerX - headSize * 0.2, headY - headSize * 0.55, centerX, headY - headSize * 0.45);
        ctx.quadraticCurveTo(centerX + headSize * 0.2, headY - headSize * 0.55, centerX + headSize * 0.35, headY - headSize * 0.9);
        ctx.quadraticCurveTo(centerX + headSize * 0.8, headY - headSize * 0.8, centerX + headSize * 0.35, headY);
        ctx.quadraticCurveTo(centerX + headSize * 0.3, headY + headSize * 0.6, centerX, headY + headSize * 0.65);
        ctx.quadraticCurveTo(centerX - headSize * 0.3, headY + headSize * 0.6, centerX - headSize * 0.35, headY);
    } else if (type === 2) {
        // Screaming Phantom
        ctx.ellipse(centerX, headY, headSize * 0.4, headSize * 0.68, 0, 0, Math.PI * 2);
    } else if (type === 3) {
        // Beast / Avian Skull
        ctx.moveTo(centerX, headY - headSize * 0.6);
        ctx.quadraticCurveTo(centerX + headSize * 0.5, headY - headSize * 0.2, centerX + headSize * 0.25, headY + 0.1);
        ctx.lineTo(centerX, headY + headSize * 0.75);
        ctx.lineTo(centerX - headSize * 0.25, headY + 0.1);
        ctx.quadraticCurveTo(centerX - headSize * 0.5, headY - headSize * 0.2, centerX, headY - headSize * 0.6);
    } else if (type === 4) {
        // Vanguard Visage
        ctx.moveTo(centerX, headY - headSize * 0.65);
        ctx.lineTo(centerX + headSize * 0.45, headY - headSize * 0.25);
        ctx.lineTo(centerX + headSize * 0.4, headY + headSize * 0.35);
        ctx.lineTo(centerX, headY + headSize * 0.55);
        ctx.lineTo(centerX - headSize * 0.4, headY + headSize * 0.35);
        ctx.lineTo(centerX - headSize * 0.45, headY - headSize * 0.25);
        ctx.closePath();
    } else {
        // Mask of Torment
        ctx.moveTo(centerX, headY - headSize * 0.6);
        ctx.bezierCurveTo(centerX + headSize * 0.6, headY - headSize * 0.4, centerX + headSize * 0.4, headY + headSize * 0.4, centerX, headY + headSize * 0.6);
        ctx.bezierCurveTo(centerX - headSize * 0.4, headY + headSize * 0.4, centerX - headSize * 0.6, headY - headSize * 0.4, centerX, headY - headSize * 0.6);
    }

    ctx.fill();
    ctx.stroke();

    // 3. Pre-render Eyes
    ctx.fillStyle = eyeColor;
    const eyeOffset = headSize * 0.18;
    const eyeY = headY - headSize * 0.12;
    const eyeR = headSize * 0.09;

    if (type === 4) {
        ctx.fillRect(centerX - headSize * 0.25, eyeY - 2, headSize * 0.5, 4);
    } else {
        ctx.beginPath();
        ctx.arc(centerX - eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
        ctx.arc(centerX + eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
        if (type === 1) {
            ctx.arc(centerX, eyeY - headSize * 0.18, eyeR * 0.75, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    // 4. Pre-render Screaming Mouth
    ctx.fillStyle = 'rgba(2, 2, 5, 0.95)';
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(centerX, headY + headSize * 0.22, headSize * 0.14, headSize * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    return canvas;
}

function initSpriteCache() {
    const hues = [195, 42, 275, 348]; // Cyan, Gold, Violet, Crimson
    soulSpriteCache.length = 0;

    for (let type = 0; type < 6; type++) {
        soulSpriteCache[type] = [];
        for (let h = 0; h < hues.length; h++) {
            soulSpriteCache[type][h] = generateSoulSprite(type, hues[h]);
        }
    }
}

class SoulFace {
    constructor(w, h, scroll) {
        this.reset(w, h, scroll, true);
    }

    reset(w, h, scroll, initial = false) {
        this.x = Math.random() * w;
        this.y = initial ? Math.random() * h : h + 80;
        this.scale = 0.75 + Math.random() * 0.55;
        this.speedY = 1.4 + Math.random() * 2.8 + scroll * 3.8;
        this.driftFreq = 0.02 + Math.random() * 0.035;
        this.phase = Math.random() * Math.PI * 2;

        this.type = Math.floor(Math.random() * 6);
        this.colorIdx = Math.floor(Math.random() * 3);
        if (scroll > 0.5 && Math.random() > 0.35) {
            this.colorIdx = 3;
        }

        this.baseBrightness = 0.35 + Math.random() * 0.55;
        this.alpha = 0;
    }

    update(w, h, scroll) {
        this.y -= this.speedY * (1 + scroll * 1.5);
        this.phase += this.driftFreq;
        this.x += Math.sin(this.phase) * 0.85;

        const pulse = 1 + Math.sin(this.phase * 2.5) * 0.15;
        const currentMaxAlpha = Math.min(1.0, this.baseBrightness * pulse);

        if (this.y > h - 140) {
            this.alpha = Math.min(currentMaxAlpha, ((h - this.y) / 140) * currentMaxAlpha);
        } else if (this.y < 150) {
            this.alpha = Math.max(0, (this.y / 150) * currentMaxAlpha);
        } else {
            this.alpha = currentMaxAlpha;
        }

        if (this.y < -100) {
            this.reset(w, h, scroll, false);
        }
    }

    draw(ctx) {
        if (this.alpha <= 0.01) return;

        const sprite = soulSpriteCache[this.type][this.colorIdx];
        if (!sprite) return;

        const renderW = SPRITE_WIDTH * this.scale;
        const renderH = SPRITE_HEIGHT * this.scale;

        ctx.globalAlpha = this.alpha;
        ctx.drawImage(sprite, this.x - renderW / 2, this.y - 30 * this.scale, renderW, renderH);
    }
}

class ApotheosisEngine {
    constructor() {
        this.canvas = document.getElementById('story-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.progressFill = document.getElementById('progress-fill');

        // HUD Elements
        this.hudLevel = document.getElementById('hud-level');
        this.hudStr = document.getElementById('hud-str');
        this.hudVit = document.getElementById('hud-vit');
        this.hudMass = document.getElementById('hud-mass');
        this.hudSouls = document.getElementById('hud-souls');

        this.scrollProgress = 0;
        this.smoothScroll = 0;
        this.souls = [];

        // Real-Time Soul Accumulator State
        this.totalSoulsAbsorbed = 0;
        this.lastFrameTime = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        initSpriteCache();
        this.initSouls();
        this.initScroll();
        this.animate(0);
    }

    resize() {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.canvas.width = this.w;
        this.canvas.height = this.h;
    }

    initSouls() {
        this.souls = [];
        const maxSouls = 220;
        for (let i = 0; i < maxSouls; i++) {
            this.souls.push(new SoulFace(this.w, this.h, 0));
        }
    }

    initScroll() {
        const handleScroll = () => {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = Math.max(0, Math.min(1, window.scrollY / (totalHeight || 1)));
            this.scrollProgress = scrolled;
            this.progressFill.style.height = `${scrolled * 100}%`;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    }

    updateRealtimeStats(dt, scroll) {
        // Calculate soul absorption rate per second based on story position (scroll)
        // Chapter 1 (0.0): ~8 souls/sec (subterranean micro-fauna)
        // Chapter 4 (0.5): ~300 souls/sec (flood of departing spirits)
        // Chapter 5 (0.85): ~3,200 souls/sec (Oakhaven valley collapse!)
        // Chapter 6 (1.0): ~480 souls/sec (eternal quiet standstill)
        let ratePerSec = 8;
        if (scroll < 0.3) {
            ratePerSec = 8 + (scroll / 0.3) * 40;
        } else if (scroll < 0.7) {
            ratePerSec = 48 + Math.pow((scroll - 0.3) / 0.4, 2.0) * 450;
        } else if (scroll < 0.9) {
            ratePerSec = 500 + Math.pow((scroll - 0.7) / 0.2, 2.5) * 3200;
        } else {
            ratePerSec = 3700 - ((scroll - 0.9) / 0.1) * 3200; // Recedes into heavy quiet standstill
        }

        // Increment real-time total souls absorbed over time
        this.totalSoulsAbsorbed += ratePerSec * dt;
        const currentSouls = Math.floor(this.totalSoulsAbsorbed);

        // Stats scale dynamically with real-time absorbed souls & scroll depth!
        const baseLevel = 142;
        const levelInc = Math.floor(this.totalSoulsAbsorbed * 0.04 + Math.pow(scroll, 1.8) * 400);
        const currentLevel = baseLevel + levelInc;

        const currentStr = Math.floor(48200 + this.totalSoulsAbsorbed * 45 + Math.pow(scroll, 2.0) * 350000);
        const currentVit = Math.floor(52900 + this.totalSoulsAbsorbed * 50 + Math.pow(scroll, 2.0) * 380000);
        const currentMass = Math.floor(1420 + this.totalSoulsAbsorbed * 2.2 + Math.pow(scroll, 2.2) * 40000);

        this.hudLevel.textContent = currentLevel >= 999 ? '999+ (OVERFLOW)' : currentLevel.toLocaleString();
        this.hudStr.textContent = currentStr >= 900000 ? 'OVERFLOW' : currentStr.toLocaleString();
        this.hudVit.textContent = currentVit >= 950000 ? 'OVERFLOW' : currentVit.toLocaleString();
        this.hudMass.textContent = `${currentMass.toLocaleString()} kg`;
        this.hudSouls.textContent = currentSouls.toLocaleString();
    }

    animate(now) {
        requestAnimationFrame((t) => this.animate(t));

        // Calculate delta time in seconds
        if (!this.lastFrameTime) this.lastFrameTime = now;
        const dt = Math.min(0.1, (now - this.lastFrameTime) * 0.001);
        this.lastFrameTime = now;

        // Smooth scroll interpolation
        this.smoothScroll += (this.scrollProgress - this.smoothScroll) * 0.08;
        const scroll = this.smoothScroll;

        // Real-Time continuous stat update
        this.updateRealtimeStats(dt, scroll);

        // Clear canvas
        this.ctx.fillStyle = '#040307';
        this.ctx.fillRect(0, 0, this.w, this.h);

        // Active soul density
        const activeCount = Math.floor(40 + scroll * 180);

        // Render souls
        for (let i = 0; i < activeCount; i++) {
            const soul = this.souls[i];
            if (soul) {
                soul.update(this.w, this.h, scroll);
                soul.draw(this.ctx);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ApotheosisEngine();
});
