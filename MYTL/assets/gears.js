(function () {
    const canvas = document.getElementById("shop-gears");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let angle = 0;
    let last = start;
    let onScreen = true;
    let flickerUntil = 0;
    let nextFlicker = 800;
    let running = true;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function gearPath(radius, teeth) {
        const step = (Math.PI * 2) / teeth;
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a = i * step - Math.PI / 2;
            const valley = radius * 0.78;
            const tip = radius;
            const pts = [
                a,
                a + step * 0.16,
                a + step * 0.46,
                a + step * 0.62
            ];
            const radii = [valley, tip, tip, valley];
            for (let p = 0; p < pts.length; p++) {
                const x = Math.cos(pts[p]) * radii[p];
                const y = Math.sin(pts[p]) * radii[p];
                if (i === 0 && p === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
    }

    function drawGear(x, y, pitch, teeth, rotation, fill) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        gearPath(pitch, teeth);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = "rgba(232, 214, 180, 0.45)";
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, pitch * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = "#141210";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, pitch * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = "#6d6458";
        ctx.fill();
        ctx.restore();
    }

    function drawBulb(x, y, scale, intensity) {
        ctx.save();
        ctx.translate(x, y);
        const glow = ctx.createRadialGradient(0, 6 * scale, 2, 0, 6 * scale, 78 * scale);
        glow.addColorStop(0, "rgba(255, 210, 120, " + (0.08 + intensity * 0.42) + ")");
        glow.addColorStop(1, "rgba(255, 210, 120, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 6 * scale, 78 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(196, 184, 164, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -78 * scale);
        ctx.lineTo(0, -36 * scale);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(0, 0, 18 * scale, 26 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 236, 196, " + (0.08 + intensity * 0.5) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 228, 186, 0.85)";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-6 * scale, 10 * scale);
        ctx.quadraticCurveTo(0, -6 * scale, 6 * scale, 10 * scale);
        ctx.strokeStyle = "rgba(255, " + Math.round(170 + intensity * 70) + ", 90, " + (0.35 + intensity * 0.65) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#8a7d68";
        ctx.fillRect(-8 * scale, 24 * scale, 16 * scale, 8 * scale);
        ctx.fillStyle = "#5c5348";
        ctx.fillRect(-7 * scale, 32 * scale, 14 * scale, 4 * scale);
        ctx.restore();
    }

    function frame(now) {
        if (!running) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const spin = reduced ? 1 : Math.min(1, (now - start) / 2400);
        const rpm = 1 - Math.pow(1 - spin, 3);
        if (!onScreen) {
            if (!reduced) requestAnimationFrame(frame);
            return;
        }
        angle += dt * 0.85 * rpm;

        if (!reduced && rpm > 0.35 && now > nextFlicker) {
            flickerUntil = now + 80;
            const gap = 360 + (1 - rpm) * 1100;
            nextFlicker = now + gap;
        }
        const dip = now < flickerUntil ? 0.42 : 1;
        const intensity = (0.18 + rpm * 0.78) * dip;

        ctx.clearRect(0, 0, width, height);

        const unit = Math.min(width, height);
        const module = unit * (height > width ? 0.009 : 0.0105);
        const t1 = 12;
        const t2 = 18;
        const t3 = 9;
        const p1 = t1 * module;
        const p2 = t2 * module;
        const p3 = t3 * module;
        const portrait = height > width;
        const c1 = {
            x: width * (portrait ? 0.58 : 0.66),
            y: height * (portrait ? 0.32 : 0.5)
        };
        const line2 = -0.7;
        const line3 = 2.25;
        const mesh = 0.84;
        const c2 = {
            x: c1.x + Math.cos(line2) * (p1 + p2) * mesh,
            y: c1.y + Math.sin(line2) * (p1 + p2) * mesh
        };
        const c3 = {
            x: c1.x + Math.cos(line3) * (p1 + p3) * mesh,
            y: c1.y + Math.sin(line3) * (p1 + p3) * mesh
        };

        drawGear(c2.x, c2.y, p2, t2, -angle * (t1 / t2) - line2, "#3c362f");
        drawGear(c3.x, c3.y, p3, t3, -angle * (t1 / t3) - line3, "#2a2622");
        drawGear(c1.x, c1.y, p1, t1, angle, "#4a433b");
        drawBulb(width * (portrait ? 0.72 : 0.8), height * (portrait ? 0.14 : 0.2), portrait ? 0.85 : 1, intensity);

        if (!reduced) requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", function () {
        resize();
        if (reduced) frame(performance.now());
    });

    if ("IntersectionObserver" in window) {
        const watcher = new IntersectionObserver(function (entries) {
            onScreen = entries[0].isIntersecting;
        });
        watcher.observe(canvas);
    }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            running = false;
            return;
        }
        if (!running) {
            running = true;
            last = performance.now();
            if (!reduced) requestAnimationFrame(frame);
        }
    });

    requestAnimationFrame(frame);
})();
