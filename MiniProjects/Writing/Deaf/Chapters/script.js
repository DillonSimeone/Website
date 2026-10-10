/* ============================================================
   THE FREQUENCY BELOW — Chapter Script
   Chapter One: Passing
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    initProgressBar();
    initHeaderCanvas();
    initScrollReveal();
    initReadingTime();
});

/* ────────────────────────────────────────────────────────────
   Reading Progress Bar
   ──────────────────────────────────────────────────────────── */
function initProgressBar() {
    const bar = document.getElementById('progressBar');
    if (!bar) return;

    const update = () => {
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        const pct  = docH > 0 ? window.scrollY / docH : 0;
        bar.style.transform = `scaleX(${Math.min(pct, 1)})`;
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
}

/* ────────────────────────────────────────────────────────────
   Header Canvas: Frequency Wave Visualization
   Three layered sine waves — a quiet pulse, always present.
   ──────────────────────────────────────────────────────────── */
function initHeaderCanvas() {
    const canvas = document.getElementById('freqCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Wave layers: amplitude as fraction of half-height, speed in radians/frame
    const waves = [
        { amp: 0.16,  freq: 1.3,  speed: 0.0055, phase: 0,    alpha: 0.45 },
        { amp: 0.07,  freq: 3.2,  speed: 0.011,  phase: 2.2,  alpha: 0.20 },
        { amp: 0.035, freq: 7.1,  speed: 0.021,  phase: 5.0,  alpha: 0.10 },
    ];

    const COLOR = '96, 130, 190'; // p1 hsl(215,50%,58%) → rgb approx

    let t = 0;
    let frameId;

    function draw() {
        const W  = canvas.width;
        const H  = canvas.height;
        const cy = H / 2;

        ctx.clearRect(0, 0, W, H);

        waves.forEach(wave => {
            ctx.beginPath();
            ctx.lineWidth   = 1.2;
            ctx.strokeStyle = `rgba(${COLOR}, ${wave.alpha})`;

            for (let x = 0; x <= W; x++) {
                const angle = (x / W) * Math.PI * 2 * wave.freq + t * wave.speed + wave.phase;
                const y     = cy + Math.sin(angle) * (H * 0.5 * wave.amp);
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        });

        // Hairline center axis
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${COLOR}, 0.06)`;
        ctx.lineWidth   = 1;
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();

        t++;
        frameId = requestAnimationFrame(draw);
    }

    draw();

    // Pause when header is off-screen to save battery
    const header = document.querySelector('.chapter-header');
    if (header) {
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                if (!frameId) frameId = requestAnimationFrame(draw);
            } else {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
        });
        io.observe(header);
    }
}

/* ────────────────────────────────────────────────────────────
   Scroll Reveal: paragraphs, section breaks, asides
   ──────────────────────────────────────────────────────────── */
function initScrollReveal() {
    const targets = document.querySelectorAll(
        '.chapter-prose p, .section-break, .prose-aside'
    );
    if (!targets.length) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                io.unobserve(entry.target);
            }
        });
    }, {
        threshold:  0.08,
        rootMargin: '0px 0px -32px 0px'
    });

    targets.forEach(el => io.observe(el));
}

/* ────────────────────────────────────────────────────────────
   Reading Time Estimate
   Literary pace: ~210 words per minute.
   ──────────────────────────────────────────────────────────── */
function initReadingTime() {
    const el    = document.getElementById('readingTime');
    const prose = document.querySelector('.chapter-prose');
    if (!el || !prose) return;

    const words   = prose.textContent.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 210));
    el.textContent = `${minutes} min`;
}
