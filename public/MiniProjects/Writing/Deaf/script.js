/* ============================================================
   THE FREQUENCY BELOW — Story Roadmap
   script.js
   ============================================================ */

'use strict';

/* ════════════════════════════════════════════════════════════
   HERO CANVAS
   Animated multi-layer waveform background — subtle,
   atmospheric. Three color voices (blue, violet, gold) that
   reflect the three-act palette.
   ════════════════════════════════════════════════════════════ */
(function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, rafId;
  let t = 0;

  const waveLayers = [
    { amp: 18, freq: 0.0045, phaseOff: 0,            speed: 0.25, r: 90,  g: 126, b: 200, a: 0.22 },
    { amp: 9,  freq: 0.011,  phaseOff: Math.PI / 3,  speed: 0.4,  r: 140, g: 100, b: 220, a: 0.18 },
    { amp: 24, freq: 0.0028, phaseOff: Math.PI / 6,  speed: 0.12, r: 200, g: 158, b: 70,  a: 0.10 },
    { amp: 6,  freq: 0.019,  phaseOff: 0,            speed: 0.7,  r: 255, g: 255, b: 255, a: 0.06 },
    { amp: 32, freq: 0.002,  phaseOff: Math.PI,      speed: 0.08, r: 80,  g: 110, b: 190, a: 0.07 },
  ];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function drawHero() {
    ctx.clearRect(0, 0, W, H);
    const midY = H / 2;

    waveLayers.forEach(layer => {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const y = midY
          + Math.sin(x * layer.freq + t * layer.speed + layer.phaseOff) * layer.amp
          + Math.cos(x * layer.freq * 0.62 + t * layer.speed * 0.55)   * layer.amp * 0.32;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const { r, g, b, a } = layer;
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    t += 0.014;
    rafId = requestAnimationFrame(drawHero);
  }

  function start() {
    resize();
    if (rafId) cancelAnimationFrame(rafId);
    drawHero();
  }

  const ro = new ResizeObserver(start);
  ro.observe(canvas);
  start();
})();


/* ════════════════════════════════════════════════════════════
   ARC CANVAS
   Static visualization of the story arc across three acts.
   Part 1: nearly flat, small constrained ripple.
   Part 2: building complexity, interference, chaos.
   Part 3: single clean, deep, confident sine — peace.
   ════════════════════════════════════════════════════════════ */
(function initArcCanvas() {
  const canvas = document.getElementById('arcCanvas');
  if (!canvas) return;

  function draw() {
    const DPR = window.devicePixelRatio || 1;
    const CSSw = canvas.offsetWidth;
    const CSSh = 140;

    canvas.width  = CSSw * DPR;
    canvas.height = CSSh * DPR;
    canvas.style.width  = CSSw + 'px';
    canvas.style.height = CSSh + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const W = CSSw;
    const H = CSSh;
    const mid = H / 2;
    const t1 = W / 3;
    const t2 = (W / 3) * 2;

    ctx.clearRect(0, 0, W, H);

    /* Background segment tints */
    [
      [0,  t1, 'hsla(215,50%,58%,0.06)'],
      [t1, t2, 'hsla(265,60%,68%,0.06)'],
      [t2, W,  'hsla(42,75%,58%,0.06)'],
    ].forEach(([x0, x1, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0, 0, x1 - x0, H);
    });

    /* Divider lines */
    [t1, t2].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, H - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* Build waveform points */
    const pts = [];
    for (let x = 0; x <= W; x++) {
      let y;
      if (x <= t1) {
        /* Part 1: nearly flat — constrained, suppressed */
        const lp  = x / t1;
        const amp = 3 + lp * 5;
        y = mid + Math.sin(x * 0.055) * amp * 0.55
                + Math.sin(x * 0.13)  * amp * 0.25;
      } else if (x <= t2) {
        /* Part 2: interference, escalating amplitude */
        const lp  = (x - t1) / t1;
        const amp = 10 + lp * 26;
        y = mid + Math.sin(x * 0.038 + 1.1)  * amp * 0.55
                + Math.sin(x * 0.085 - 0.6)  * amp * 0.28
                + Math.sin(x * 0.022 + 2.3)  * amp * 0.38;
      } else {
        /* Part 3: single, clean, deep — a wave that knows itself */
        const lp  = (x - t2) / (W - t2);
        const amp = 30 - lp * 6; /* gentle settle */
        y = mid + Math.sin((x - t2) * 0.023 + 0.5) * amp;
      }
      pts.push({ x, y });
    }

    /* Gradient stroke */
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,    'hsl(215,50%,58%)');
    grad.addColorStop(0.28, 'hsl(215,50%,55%)');
    grad.addColorStop(0.38, 'hsl(240,55%,63%)');
    grad.addColorStop(0.50, 'hsl(265,60%,68%)');
    grad.addColorStop(0.65, 'hsl(265,58%,65%)');
    grad.addColorStop(0.78, 'hsl(20,65%,60%)');
    grad.addColorStop(1,    'hsl(42,75%,58%)');

    ctx.beginPath();
    pts.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    /* Subtle fill below the line */
    ctx.beginPath();
    pts.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, mid, 0, H);
    fillGrad.addColorStop(0, 'rgba(130, 160, 210, 0.10)');
    fillGrad.addColorStop(1, 'rgba(130, 160, 210, 0.00)');
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  draw();
  window.addEventListener('resize', draw);
})();


/* ════════════════════════════════════════════════════════════
   CHAPTER CARDS — Expand / Collapse
   Accordion behavior: only one card open at a time.
   ════════════════════════════════════════════════════════════ */
(function initChapterCards() {
  const cards = document.querySelectorAll('.chapter-card');

  cards.forEach(card => {
    const header  = card.querySelector('.chapter-card__header');
    const detail  = card.querySelector('.chapter-detail');
    const expandBtn = card.querySelector('.chapter-expand');

    if (!header || !detail) return;

    header.addEventListener('click', () => toggle(card));

    /* Keyboard: Enter / Space on focusable header */
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(card);
      }
    });
  });

  function toggle(targetCard) {
    const isOpen = targetCard.classList.contains('is-open');

    /* Close all cards first */
    cards.forEach(c => {
      c.classList.remove('is-open');
      const d = c.querySelector('.chapter-detail');
      const h = c.querySelector('.chapter-card__header');
      if (d)  d.hidden = true;
      if (h)  h.setAttribute('aria-expanded', 'false');
    });

    /* If the target was not already open, open it */
    if (!isOpen) {
      targetCard.classList.add('is-open');
      const d = targetCard.querySelector('.chapter-detail');
      const h = targetCard.querySelector('.chapter-card__header');
      if (d)  d.hidden = false;
      if (h)  h.setAttribute('aria-expanded', 'true');

      /* Scroll the card into view if it's below the fold */
      requestAnimationFrame(() => {
        const rect = targetCard.getBoundingClientRect();
        if (rect.bottom > window.innerHeight * 0.85) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }
})();


/* ════════════════════════════════════════════════════════════
   SCROLL FADE-IN
   IntersectionObserver — elements animate in as they enter
   the viewport. Stagger delay applied per-card within a
   visible batch.
   ════════════════════════════════════════════════════════════ */
(function initScrollFade() {
  const targets = document.querySelectorAll(
    '.theme-card, .character-card, .chapter-card, .arc-wrap'
  );

  targets.forEach(el => el.classList.add('fade-up'));

  const io = new IntersectionObserver((entries) => {
    let delay = 0;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.transitionDelay = delay + 'ms';
      entry.target.classList.add('visible');
      io.unobserve(entry.target);
      delay += 70;
    });
  }, {
    threshold: 0.07,
    rootMargin: '0px 0px -30px 0px',
  });

  targets.forEach(el => io.observe(el));
})();
