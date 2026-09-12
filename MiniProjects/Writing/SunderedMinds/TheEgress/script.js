(function () {
    'use strict';

    // ── SCROLL RESET ON LOAD ──
    // If the reader refreshes while at the bottom, force them back up
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const canvas = document.getElementById('horrorCanvas');
    const ctx = canvas.getContext('2d');

    // ── STATE ──
    let W, H;
    let scrollProgress = 0;      // 0..1
    let captured = false;         // true = taken over
    let captureProgress = 0;      // 0..1 tentacle coverage
    let lastScroll = 0;
    let shakeAmount = 0;
    let tentaclesCovering = false;

    // ── MOUSE TRACKING ──
    let mouseX = -100, mouseY = -100;
    const updateMouse = (e) => {
        if (e.touches && e.touches.length > 0) {
            mouseX = e.touches[0].clientX;
            mouseY = e.touches[0].clientY;
        } else {
            mouseX = e.clientX;
            mouseY = e.clientY;
        }
    };
    window.addEventListener('mousemove', updateMouse);
    window.addEventListener('touchstart', updateMouse, { passive: true });
    window.addEventListener('touchmove', updateMouse, { passive: true });

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── SCROLL TRACKING ──
    function getScrollProgress() {
        const st = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return max > 0 ? Math.min(st / max, 1.0) : 0;
    }

    // ── TENTACLE DEFINITION ──
    // Each tentacle grows from an edge point, curves inward
    class Tentacle {
        constructor(opts) {
            this.edge = opts.edge;    // 'top','bottom','left','right'
            this.pos = opts.pos;     // 0..1 along that edge
            this.delay = opts.delay;   // scroll threshold to start growing (0..0.6)
            this.length = opts.length;  // max length as fraction of screen
            this.thick = opts.thick;   // base thickness px
            this.wriggle = opts.wriggle; // wriggle amplitude
            this.wriggleFreq = opts.wriggleFreq || 1.0;
            this.segments = opts.segments || 18;
            const palettes = [
                { h: 110, r: 60 }, // Slime Green
                { h: 260, r: 50 }, // Elder Purple
                { h: 190, r: 40 }, // Abyssal Blue
                { h: 45, r: 25 }   // Sickly Amber
            ];
            const p = palettes[Math.floor(Math.random() * palettes.length)];
            this.hue = p.h + Math.random() * p.r;
            this.phase = Math.random() * Math.PI * 2;
            this.growth = 0;            // 0..1
            this.grabbing = false;
            this.grabStrength = 0; // 0..1 lerp
            this.grabTarget = { x: 0, y: 0 };
            this.suckers = [];
            this.eyesData = [];
            // Randomly add 1-2 eyes per tentacle
            const numEyes = Math.random() < 0.4 ? 2 : 1;
            for (let i = 0; i < numEyes; i++) {
                this.eyesData.push({
                    frac: 0.3 + Math.random() * 0.5,
                    irisHue: Math.random() * 360,
                    blink: 0, blinkT: 0,
                    size: 0.8 + Math.random() * 0.4
                });
            }
            // pre-generate sucker positions along length
            for (let i = 0; i < 8; i++) this.suckers.push(Math.random());
        }

        // start point in screen coords
        origin() {
            switch (this.edge) {
                case 'top': return { x: this.pos * W, y: 0 };
                case 'bottom': return { x: this.pos * W, y: H };
                case 'left': return { x: 0, y: this.pos * H };
                case 'right': return { x: W, y: this.pos * H };
            }
        }

        // direction the tentacle points inward
        inwardAngle() {
            switch (this.edge) {
                case 'top': return Math.PI * 0.5;
                case 'bottom': return -Math.PI * 0.5;
                case 'left': return 0;
                case 'right': return Math.PI;
            }
        }

        update(sp, t, cP) {
            // during capture, tentacles grow to full regardless of scroll
            const effSp = captured ? 1.0 : sp;
            const raw = Math.max(0, (effSp - this.delay) / (0.4));
            const target = captured ? Math.min(1, 0.9 + cP * 0.4) : Math.min(1, raw);
            this.growth += (target - this.growth) * (captured ? 0.06 : 0.025);

            // Grab interaction
            if (this.growth > 0.3) {
                const tip = this.getTipPos(t);
                const distToMouse = Math.sqrt((tip.x - mouseX) ** 2 + (tip.y - mouseY) ** 2);

                const grabThreshold = captured ? Infinity : 180;
                const releaseThreshold = captured ? Infinity : 350;

                if (!this.grabbing && distToMouse < grabThreshold) {
                    this.grabbing = true;
                } else if (this.grabbing && distToMouse > releaseThreshold && !captured) {
                    this.grabbing = false;
                }

                if (this.grabbing) {
                    this.grabStrength += (1 - this.grabStrength) * 0.12;
                    this.grabTarget.x += (mouseX - this.grabTarget.x) * 0.18;
                    this.grabTarget.y += (mouseY - this.grabTarget.y) * 0.18;
                } else {
                    this.grabStrength += (0 - this.grabStrength) * 0.08;
                }
            }

            // Update eye blinking
            this.eyesData.forEach(eye => {
                if (Math.random() < 0.005) { eye.blink = 1; eye.blinkT = 0; }
                if (eye.blink) {
                    eye.blinkT += 0.15;
                    if (eye.blinkT > Math.PI) eye.blink = 0;
                }
            });
        }

        getTipPos(t) {
            const o = this.origin();
            const baseAngle = this.inwardAngle();
            const maxLen = Math.min(W, H) * this.length * this.growth;
            const dist = maxLen;
            const perp = baseAngle + Math.PI * 0.5;
            const w = Math.sin(1.0 * Math.PI * 2 * this.wriggleFreq + t * 1.8 + this.phase)
                * this.wriggle * Math.min(W, H) * 0.08;
            const drift = Math.sin(3.0 + t * 0.7 + this.phase * 1.3) * Math.min(W, H) * 0.03;
            const x = o.x + Math.cos(baseAngle) * dist + Math.cos(perp) * w + Math.cos(baseAngle + Math.PI * 0.5) * drift;
            const y = o.y + Math.sin(baseAngle) * dist + Math.sin(perp) * w + Math.sin(baseAngle + Math.PI * 0.5) * drift;
            return { x, y };
        }

        draw(t, shake) {
            if (this.growth <= 0.01) return;
            const o = this.origin();
            const baseAngle = this.inwardAngle();
            const maxLen = Math.min(W, H) * this.length * this.growth;
            const segs = this.segments;

            ctx.save();
            ctx.translate(shake.x, shake.y);

            // Build spine points
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const frac = i / segs;
                const dist = frac * maxLen;
                const perp = baseAngle + Math.PI * 0.5;

                let wOffset = Math.sin(frac * Math.PI * 2 * this.wriggleFreq + t * 1.8 + this.phase)
                    * this.wriggle * frac * Math.min(W, H) * 0.08;
                let drift = Math.sin(frac * 3.0 + t * 0.7 + this.phase * 1.3) * frac * Math.min(W, H) * 0.03;

                let x = o.x + Math.cos(baseAngle) * dist + Math.cos(perp) * wOffset + Math.cos(baseAngle + Math.PI * 0.5) * drift;
                let y = o.y + Math.sin(baseAngle) * dist + Math.sin(perp) * wOffset + Math.sin(baseAngle + Math.PI * 0.5) * drift;

                if (this.grabStrength > 0.001) {
                    x += (this.grabTarget.x - x) * Math.pow(frac, 2) * this.grabStrength;
                    y += (this.grabTarget.y - y) * Math.pow(frac, 2) * this.grabStrength;
                }

                pts.push({ x, y });
            }

            // Draw main body (single path to avoid joints)
            ctx.beginPath();
            // Right side
            for (let i = 0; i <= segs; i++) {
                const frac = i / segs;
                const thickness = this.thick * (1 - frac * 0.85) * (1 + Math.sin(t * 2 + this.phase + i) * 0.05);
                const p1 = pts[i];
                const p2 = pts[i + 1] || { x: p1.x + Math.cos(baseAngle), y: p1.y + Math.sin(baseAngle) };
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
                ctx.lineTo(p1.x + Math.cos(angle) * thickness / 2, p1.y + Math.sin(angle) * thickness / 2);
            }
            // Left side (reverse)
            for (let i = segs; i >= 0; i--) {
                const frac = i / segs;
                const thickness = this.thick * (1 - frac * 0.85) * (1 + Math.sin(t * 2 + this.phase + i) * 0.05);
                const p1 = pts[i];
                const p2 = pts[i + 1] || { x: p1.x + Math.cos(baseAngle), y: p1.y + Math.sin(baseAngle) };
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
                ctx.lineTo(p1.x - Math.cos(angle) * thickness / 2, p1.y - Math.sin(angle) * thickness / 2);
            }
            ctx.closePath();

            const lightness = 8 + Math.sin(t) * 2;
            const grad = ctx.createLinearGradient(o.x, o.y, pts[segs].x, pts[segs].y);
            grad.addColorStop(0, `hsla(${this.hue}, 70%, ${lightness}%, 0.95)`);
            grad.addColorStop(1, `hsla(${this.hue}, 80%, ${lightness + 10}%, 0.85)`);
            ctx.fillStyle = grad;
            ctx.fill();

            // Wet highlight
            ctx.beginPath();
            for (let i = 0; i < segs; i++) {
                const frac = i / segs;
                const thickness = this.thick * (1 - frac * 0.85) * 0.25;
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
                ctx.lineTo(p1.x + Math.cos(angle) * thickness / 2, p1.y + Math.sin(angle) * thickness / 2);
            }
            ctx.strokeStyle = `hsla(${this.hue}, 50%, 40%, 0.25)`;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Shadow ridge (center)
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i <= segs; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.lineWidth = Math.max(0.5, this.thick * 0.1);
            ctx.strokeStyle = `hsla(${this.hue}, 40%, 4%, 0.3)`;
            ctx.stroke();

            // Suckers
            this.suckers.forEach(sPos => {
                const idx = Math.floor(sPos * segs);
                const frac = sPos;
                if (frac > 1.0) return;
                const pt = pts[idx];
                if (!pt) return;
                const r = this.thick * (1 - frac * 0.7) * 0.28;

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 30%, 5%, 0.8)`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 40%, 15%, 0.5)`;
                ctx.fill();
            });

            // Tip glow
            if (this.growth > 0.1) {
                const tip = pts[segs];
                ctx.beginPath();
                ctx.arc(tip.x, tip.y, this.thick * 0.15, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 60%, 25%, 0.6)`;
                ctx.fill();
            }

            // Draw eyeballs ON the tentacle
            this.eyesData.forEach(eye => {
                if (this.growth < eye.frac) return;
                const idx = Math.floor(eye.frac * segs);
                const pt = pts[idx];
                if (!pt) return;

                const r = this.thick * 0.45 * (1 - eye.frac * 0.5) * eye.size;
                const blinkScale = eye.blink ? Math.abs(Math.sin(eye.blinkT)) * 0.9 + 0.1 : 1;

                ctx.save();
                ctx.translate(pt.x, pt.y);

                // White of the eye
                ctx.beginPath();
                ctx.ellipse(0, 0, r, r * blinkScale, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();

                if (blinkScale > 0.3) {
                    // Randomly colored iris (cornea requested)
                    const irisR = r * 0.6;
                    const dx = mouseX - pt.x, dy = mouseY - pt.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const limit = r * 0.35;
                    const px = (dist > 0 ? (dx / dist) * Math.min(dist * 0.1, limit) : 0);
                    const py = (dist > 0 ? (dy / dist) * Math.min(dist * 0.1, limit) : 0);

                    ctx.beginPath();
                    ctx.arc(px, py, irisR, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${eye.irisHue}, 70%, 35%, 0.95)`;
                    ctx.fill();

                    // Black pupil
                    ctx.beginPath();
                    ctx.arc(px, py, irisR * 0.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#000';
                    ctx.fill();

                    // Glint
                    ctx.beginPath();
                    ctx.arc(px - irisR * 0.3, py - irisR * 0.3, irisR * 0.25, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fill();
                }

                ctx.restore();
            });

            ctx.restore();
        }
    }

    // ── EYE STALK ──
    class EyeStalk {
        constructor(edge, pos, delay) {
            this.edge = edge;
            this.pos = pos;
            this.delay = delay;
            this.growth = 0;
            this.segments = 12;
            this.thick = 10 + Math.random() * 6;
            this.length = 0.12 + Math.random() * 0.08;
            const palettes = [
                { h: 110, r: 60 }, { h: 260, r: 50 }, { h: 190, r: 40 }, { h: 45, r: 25 }
            ];
            const p = palettes[Math.floor(Math.random() * palettes.length)];
            this.hue = p.h + Math.random() * p.r;
            this.blink = 0; this.blinkT = 0;
            this.irisHue = Math.random() * 360;
            this.phase = Math.random() * Math.PI * 2;
        }

        update(sp, t, cP) {
            const effSp = captured ? 1.0 : sp;
            const raw = Math.max(0, (effSp - this.delay) / 0.3);
            const target = captured ? Math.min(1, 0.95 + cP * 0.2) : Math.min(1, raw);
            this.growth += (target - this.growth) * 0.03;

            if (Math.random() < 0.005) { this.blink = 1; this.blinkT = 0; }
            if (this.blink) {
                this.blinkT += 0.15;
                if (this.blinkT > Math.PI) this.blink = 0;
            }
        }

        origin() {
            switch (this.edge) {
                case 'top': return { x: this.pos * W, y: 0 };
                case 'bottom': return { x: this.pos * W, y: H };
                case 'left': return { x: 0, y: this.pos * H };
                case 'right': return { x: W, y: this.pos * H };
            }
        }

        inwardAngle() {
            switch (this.edge) {
                case 'top': return Math.PI * 0.5;
                case 'bottom': return -Math.PI * 0.5;
                case 'left': return 0;
                case 'right': return Math.PI;
            }
        }

        draw(t, shake) {
            if (this.growth <= 0.01) return;
            const o = this.origin();
            const baseAngle = this.inwardAngle();
            const maxLen = Math.min(W, H) * this.length * this.growth;
            const segs = this.segments;

            ctx.save();
            ctx.translate(shake.x, shake.y);

            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const frac = i / segs;
                const dist = frac * maxLen;
                const shiftX = Math.sin(t * 0.4 + this.phase + frac * 2) * frac * 12;
                const shiftY = Math.cos(t * 0.3 + this.phase * 1.5 + frac * 2) * frac * 12;

                const x = o.x + Math.cos(baseAngle) * dist + shiftX;
                const y = o.y + Math.sin(baseAngle) * dist + shiftY;
                pts.push({ x, y });
            }

            // Stalk
            ctx.beginPath();
            for (let i = 0; i <= segs; i++) {
                const frac = i / segs;
                const thickness = this.thick * (1 - frac * 0.5) * (1 + Math.sin(t * 2 + this.phase + i) * 0.03);
                const p1 = pts[i];
                const p2 = pts[i + 1] || { x: p1.x + Math.cos(baseAngle), y: p1.y + Math.sin(baseAngle) };
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
                ctx.lineTo(p1.x + Math.cos(angle) * thickness / 2, p1.y + Math.sin(angle) * thickness / 2);
            }
            for (let i = segs; i >= 0; i--) {
                const frac = i / segs;
                const thickness = this.thick * (1 - frac * 0.5) * (1 + Math.sin(t * 2 + this.phase + i) * 0.03);
                const p1 = pts[i];
                const p2 = pts[i + 1] || { x: p1.x + Math.cos(baseAngle), y: p1.y + Math.sin(baseAngle) };
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
                ctx.lineTo(p1.x - Math.cos(angle) * thickness / 2, p1.y - Math.sin(angle) * thickness / 2);
            }
            ctx.closePath();
            ctx.fillStyle = `hsla(${this.hue}, 60%, 8%, 0.98)`;
            ctx.fill();

            // Eye at tip
            const tip = pts[segs];
            const r = this.thick * 1.3 * this.growth;
            const blinkScale = this.blink ? Math.abs(Math.sin(this.blinkT)) * 0.9 + 0.1 : 1;

            ctx.save();
            ctx.translate(tip.x, tip.y);
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * blinkScale, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            if (blinkScale > 0.3) {
                const irisR = r * 0.65;
                const dx = mouseX - tip.x, dy = mouseY - tip.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const limit = r * 0.3;
                const px = (dist > 0 ? (dx / dist) * Math.min(dist * 0.15, limit) : 0);
                const py = (dist > 0 ? (dy / dist) * Math.min(dist * 0.15, limit) : 0);

                ctx.beginPath();
                ctx.arc(px, py, irisR, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.irisHue}, 80%, 35%, 0.95)`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(px, py, irisR * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = '#000';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(px - irisR * 0.3, py - irisR * 0.3, irisR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fill();
            }
            ctx.restore();

            ctx.restore();
        }
    }

    // ── SLIME POOLS ──
    class SlimeBlob {
        constructor(edge, posAlong, delay) {
            this.edge = edge;
            this.pos = posAlong;
            this.delay = delay;
            this.growth = 0;
            this.drips = Array.from({ length: 6 }, () => ({
                offset: (Math.random() - 0.5) * 0.15,
                speed: 0.3 + Math.random() * 0.5,
                length: 0.3 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                width: 4 + Math.random() * 8,
            }));
            const palettes = [
                { h: 110, r: 60 }, { h: 260, r: 50 }, { h: 190, r: 40 }, { h: 45, r: 25 }
            ];
            const p = palettes[Math.floor(Math.random() * palettes.length)];
            this.hue = p.h + Math.random() * p.r;
        }

        update(sp, cP) {
            const effSp = captured ? 1.0 : sp;
            const raw = Math.max(0, (effSp - this.delay) / 0.35);
            const target = captured ? Math.min(1, 0.95 + cP * 0.3) : Math.min(1, raw);
            this.growth += (target - this.growth) * (captured ? 0.05 : 0.02);
        }

        draw(t, shake) {
            if (this.growth < 0.01) return;

            ctx.save();
            ctx.translate(shake.x, shake.y);

            const g = this.growth;
            const h = this.hue;

            if (this.edge === 'top') {
                const cx = this.pos * W;
                const poolW = 60 * g + 40;
                const poolH = 20 * g;
                // pool at top edge
                ctx.beginPath();
                ctx.ellipse(cx, 0, poolW, poolH, 0, 0, Math.PI);
                ctx.fillStyle = `hsla(${h},65%,8%,0.85)`;
                ctx.fill();
                // drips
                this.drips.forEach(d => {
                    const dx = cx + d.offset * poolW * 2;
                    const dripLen = d.length * 120 * g;
                    const wobble = Math.sin(t * d.speed + d.phase) * 4;
                    ctx.beginPath();
                    ctx.moveTo(dx + wobble, 0);
                    ctx.bezierCurveTo(
                        dx + wobble + 6, dripLen * 0.3,
                        dx + wobble - 4, dripLen * 0.7,
                        dx + wobble + 2, dripLen
                    );
                    ctx.lineWidth = d.width * g;
                    ctx.lineCap = 'round';
                    ctx.strokeStyle = `hsla(${h},60%,10%,0.75)`;
                    ctx.stroke();
                    // drip tip
                    ctx.beginPath();
                    ctx.arc(dx + wobble + 2, dripLen, d.width * g * 0.6, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${h},55%,12%,0.7)`;
                    ctx.fill();
                });
            }

            if (this.edge === 'bottom') {
                const cx = this.pos * W;
                const poolW = 60 * g + 40;
                const poolH = 20 * g;
                ctx.beginPath();
                ctx.ellipse(cx, H, poolW, poolH, 0, Math.PI, Math.PI * 2);
                ctx.fillStyle = `hsla(${h},65%,8%,0.85)`;
                ctx.fill();
                this.drips.forEach(d => {
                    const dx = cx + d.offset * poolW * 2;
                    const dripLen = d.length * 100 * g;
                    const wobble = Math.sin(t * d.speed + d.phase) * 4;
                    ctx.beginPath();
                    ctx.moveTo(dx + wobble, H);
                    ctx.bezierCurveTo(
                        dx + wobble + 5, H - dripLen * 0.3,
                        dx + wobble - 3, H - dripLen * 0.7,
                        dx + wobble + 1, H - dripLen
                    );
                    ctx.lineWidth = d.width * g;
                    ctx.strokeStyle = `hsla(${h},60%,10%,0.75)`;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(dx + wobble + 1, H - dripLen, d.width * g * 0.6, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${h},55%,12%,0.7)`;
                    ctx.fill();
                });
            }

            if (this.edge === 'left') {
                const cy = this.pos * H;
                const poolW = 20 * g;
                const poolH = 50 * g + 30;
                ctx.beginPath();
                ctx.ellipse(0, cy, poolW, poolH, 0, -Math.PI * 0.5, Math.PI * 0.5);
                ctx.fillStyle = `hsla(${h},65%,8%,0.85)`;
                ctx.fill();
                this.drips.forEach(d => {
                    const dy = cy + d.offset * poolH * 2;
                    const dripLen = d.length * 100 * g;
                    const wobble = Math.sin(t * d.speed + d.phase) * 4;
                    ctx.beginPath();
                    ctx.moveTo(0, dy + wobble);
                    ctx.bezierCurveTo(dripLen * 0.3, dy + wobble + 5, dripLen * 0.7, dy + wobble - 3, dripLen, dy + wobble + 1);
                    ctx.lineWidth = d.width * g;
                    ctx.strokeStyle = `hsla(${h},60%,10%,0.75)`;
                    ctx.stroke();
                });
            }

            if (this.edge === 'right') {
                const cy = this.pos * H;
                const poolW = 20 * g;
                const poolH = 50 * g + 30;
                ctx.beginPath();
                ctx.ellipse(W, cy, poolW, poolH, 0, Math.PI * 0.5, Math.PI * 1.5);
                ctx.fillStyle = `hsla(${h},65%,8%,0.85)`;
                ctx.fill();
                this.drips.forEach(d => {
                    const dy = cy + d.offset * poolH * 2;
                    const dripLen = d.length * 100 * g;
                    const wobble = Math.sin(t * d.speed + d.phase) * 4;
                    ctx.beginPath();
                    ctx.moveTo(W, dy + wobble);
                    ctx.bezierCurveTo(W - dripLen * 0.3, dy + wobble + 4, W - dripLen * 0.7, dy + wobble - 3, W - dripLen, dy + wobble + 1);
                    ctx.lineWidth = d.width * g;
                    ctx.strokeStyle = `hsla(${h},60%,10%,0.75)`;
                    ctx.stroke();
                });
            }

            ctx.restore();
        }
    }

    // ── POPULATE ──
    const tentacles = [
        // top edge
        new Tentacle({ edge: 'top', pos: 0.12, delay: 0.05, length: 0.55, thick: 22, wriggle: 1.2, wriggleFreq: 1.1, segments: 20 }),
        new Tentacle({ edge: 'top', pos: 0.55, delay: 0.10, length: 0.60, thick: 18, wriggle: 1.4, wriggleFreq: 0.9, segments: 20 }),
        new Tentacle({ edge: 'top', pos: 0.82, delay: 0.08, length: 0.45, thick: 14, wriggle: 1.0, wriggleFreq: 1.3, segments: 16 }),
        // bottom edge
        new Tentacle({ edge: 'bottom', pos: 0.25, delay: 0.12, length: 0.50, thick: 20, wriggle: 1.3, wriggleFreq: 1.0, segments: 20 }),
        new Tentacle({ edge: 'bottom', pos: 0.68, delay: 0.07, length: 0.65, thick: 24, wriggle: 1.1, wriggleFreq: 1.2, segments: 22 }),
        new Tentacle({ edge: 'bottom', pos: 0.90, delay: 0.15, length: 0.40, thick: 13, wriggle: 1.5, wriggleFreq: 0.8, segments: 16 }),
        // left edge
        new Tentacle({ edge: 'left', pos: 0.20, delay: 0.18, length: 0.55, thick: 19, wriggle: 1.1, wriggleFreq: 1.0, segments: 18 }),
        new Tentacle({ edge: 'left', pos: 0.65, delay: 0.22, length: 0.45, thick: 15, wriggle: 1.3, wriggleFreq: 1.2, segments: 16 }),
        // right edge
        new Tentacle({ edge: 'right', pos: 0.35, delay: 0.20, length: 0.55, thick: 20, wriggle: 1.2, wriggleFreq: 0.9, segments: 18 }),
        new Tentacle({ edge: 'right', pos: 0.75, delay: 0.16, length: 0.48, thick: 16, wriggle: 1.4, wriggleFreq: 1.1, segments: 16 }),
        // extra dense coverage for later
        new Tentacle({ edge: 'top', pos: 0.35, delay: 0.30, length: 0.70, thick: 28, wriggle: 1.5, wriggleFreq: 0.8, segments: 24 }),
        new Tentacle({ edge: 'bottom', pos: 0.45, delay: 0.28, length: 0.72, thick: 26, wriggle: 1.2, wriggleFreq: 1.0, segments: 24 }),
        new Tentacle({ edge: 'left', pos: 0.42, delay: 0.35, length: 0.62, thick: 22, wriggle: 1.0, wriggleFreq: 1.1, segments: 20 }),
        new Tentacle({ edge: 'right', pos: 0.55, delay: 0.32, length: 0.58, thick: 21, wriggle: 1.3, wriggleFreq: 0.9, segments: 20 }),
    ];

    const slimes = [
        new SlimeBlob('top', 0.08, 0.02),
        new SlimeBlob('top', 0.48, 0.06),
        new SlimeBlob('top', 0.78, 0.04),
        new SlimeBlob('bottom', 0.18, 0.08),
        new SlimeBlob('bottom', 0.62, 0.05),
        new SlimeBlob('left', 0.15, 0.14),
        new SlimeBlob('left', 0.58, 0.18),
        new SlimeBlob('right', 0.28, 0.12),
        new SlimeBlob('right', 0.72, 0.16),
    ];

    const eyeStalks = [
        new EyeStalk('top', 0.3, 0.2),
        new EyeStalk('top', 0.7, 0.25),
        new EyeStalk('bottom', 0.4, 0.22),
        new EyeStalk('left', 0.5, 0.3),
        new EyeStalk('right', 0.2, 0.28),
    ];


    // ── SCROLL LOCK & SHAKE ──
    let lockedScroll = 0;
    let autoScrolling = false;
    let autoScrollTarget = 0;
    let autoScrollStart = 0;
    let autoScrollStartT = 0;
    let autoScrollDur = 2000; // ms

    function easeInOutQuint(t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; }

    function triggerCapture() {
        if (captured) return;
        captured = true;
        canvas.classList.add('captured');
        document.body.classList.add('captured');

        // Lock body scroll
        lockedScroll = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        window.scrollTo(0, lockedScroll);

        // Auto scroll to bottom
        autoScrolling = true;
        autoScrollStart = window.scrollY;
        autoScrollTarget = document.documentElement.scrollHeight - window.innerHeight;
        autoScrollStartT = performance.now();
    }

    // Shake on scroll-up attempt
    window.addEventListener('wheel', e => {
        if (!captured) return;
        e.preventDefault();
        shakeAmount = Math.min(shakeAmount + Math.abs(e.deltaY) * 0.04, 18);
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        if (!captured) return; // Allow normal scrolling if not captured
        e.preventDefault();
        // Mimic shake behavior on touch-drag up/down too
        if (e.touches && e.touches.length > 0) {
            const touch = e.touches[0];
            const dy = touch.clientY - (lastTouchY || touch.clientY);
            shakeAmount = Math.min(shakeAmount + Math.abs(dy) * 0.1, 18);
            lastTouchY = touch.clientY;
        }
    }, { passive: false });

    let lastTouchY = 0;
    window.addEventListener('touchstart', e => {
        if (e.touches && e.touches.length > 0) lastTouchY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('keydown', e => {
        if (!captured) return;
        if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) {
            shakeAmount = Math.min(shakeAmount + 10, 18);
            e.preventDefault();
        }
    });

    // Reveal on scroll
    const reveals = document.querySelectorAll('.reveal');
    const revealObs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.06 });
    reveals.forEach(r => revealObs.observe(r));

    // ── RENDER ──
    let startT = null;

    function render(ts) {
        if (!startT) startT = ts;
        const t = (ts - startT) * 0.001;

        // Update scroll progress
        if (autoScrolling) {
            const elapsed = ts - autoScrollStartT;
            const frac = Math.min(elapsed / autoScrollDur, 1);
            const pos = autoScrollStart + (autoScrollTarget - autoScrollStart) * easeInOutQuint(frac);
            window.scrollTo(0, pos);
            if (frac >= 1) { autoScrolling = false; }
        }

        scrollProgress = getScrollProgress();

        // Trigger capture near absolute bottom (delayed to finish reading)
        if (!captured && scrollProgress >= 0.94) { triggerCapture(); }

        if (captured) {
            captureProgress = Math.min(captureProgress + 0.008, 1);
        }

        // Decay shake
        shakeAmount *= 0.88;
        const shake = captured && shakeAmount > 0.5 ? {
            x: (Math.random() - 0.5) * shakeAmount,
            y: (Math.random() - 0.5) * shakeAmount
        } : { x: 0, y: 0 };

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Update & draw slime
        slimes.forEach(s => { s.update(scrollProgress, captureProgress); s.draw(t, shake); });

        // Update & draw tentacles
        tentacles.forEach(tn => { tn.update(scrollProgress, t, captureProgress); tn.draw(t, shake); });

        // Update & draw eye stalks
        eyeStalks.forEach(es => { es.update(scrollProgress, t, captureProgress); es.draw(t, shake); });

        // Coverage veil — fills screen once captured
        if (captured && captureProgress > 0.1) {
            const veilAlpha = Math.pow(Math.max(0, captureProgress - 0.1) / 0.9, 1.8) * 0.97;

            // Dark slime fill
            const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
            grad.addColorStop(0, `hsla(115,50%,5%,${veilAlpha * 0.6})`);
            grad.addColorStop(1, `hsla(115,40%,3%,${veilAlpha})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // Slime veins radiating from edges
            if (captureProgress > 0.3) {
                const veinAlpha = (captureProgress - 0.3) / 0.7;
                for (let v = 0; v < 8; v++) {
                    const angle = (v / 8) * Math.PI * 2 + t * 0.05;
                    const ex = W / 2 + Math.cos(angle) * W * 0.8;
                    const ey = H / 2 + Math.sin(angle) * H * 0.8;
                    const vg = ctx.createLinearGradient(ex, ey, W / 2, H / 2);
                    vg.addColorStop(0, `hsla(115,60%,8%,${veinAlpha * 0.6})`);
                    vg.addColorStop(1, 'transparent');
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    const cp1x = ex + (W / 2 - ex) * 0.4 + Math.cos(angle + 1.2) * 80;
                    const cp1y = ey + (H / 2 - ey) * 0.4 + Math.sin(angle + 1.2) * 80;
                    ctx.quadraticCurveTo(cp1x, cp1y, W / 2, H / 2);
                    ctx.lineWidth = 40 * veinAlpha;
                    ctx.strokeStyle = vg;
                    ctx.stroke();
                }
            }

            // Final message at full coverage
            if (captureProgress > 0.88) {
                const msgAlpha = (captureProgress - 0.88) / 0.12;
                ctx.save();
                ctx.globalAlpha = msgAlpha * 0.85;
                ctx.font = `300 ${Math.floor(H * 0.028)}px 'IM Fell English', serif`;
                ctx.fillStyle = `hsla(115, 40%, 55%, 1)`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const pulse = 1 + Math.sin(t * 0.8) * 0.003;
                ctx.translate(W / 2, H / 2);
                ctx.scale(pulse, pulse);
                ctx.fillText('it remembers you', 0, -H * 0.045);
                ctx.font = `300 ${Math.floor(H * 0.016)}px 'Share Tech Mono', monospace`;
                ctx.fillStyle = `hsla(115, 30%, 35%, ${msgAlpha})`;
                ctx.fillText('refresh to forget · if it lets you', 0, H * 0.04);
                ctx.restore();
            }
        }

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

})();
