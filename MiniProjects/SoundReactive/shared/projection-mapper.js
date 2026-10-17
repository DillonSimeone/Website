/**
 * ProjectionMapper - Real-Time 4-Point Corner Pinning & Keystoning Tool
 * Designed for architectural stage mapping, DJ booths, and angled surfaces.
 */

export class ProjectionMapper {
  constructor(targetElementId) {
    this.target = document.getElementById(targetElementId);
    this.isActive = false;
    this.isGridVisible = false;
    this.corners = [
      { x: 0, y: 0 },       // Top-Left (0)
      { x: 1, y: 0 },       // Top-Right (1)
      { x: 1, y: 1 },       // Bottom-Right (2)
      { x: 0, y: 1 }        // Bottom-Left (3)
    ];
    this.activePoint = null;
    this.overlay = null;
    this.handles = [];
    this.storageKey = 'deaf_dj_projection_corners';

    this.loadState();
    this.createUI();
    this.applyTransform();
    this.bindEvents();
  }

  createUI() {
    // Calibration Overlay & Handles
    this.overlay = document.createElement('div');
    this.overlay.className = 'projection-mapper-overlay';
    this.overlay.style.display = 'none';
    this.overlay.style.pointerEvents = 'none';

    // SVG Grid for alignment calibration
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'projection-grid-svg');
    this.overlay.appendChild(this.svg);

    // Floating On-Screen Mapping Bar
    const statusBox = document.createElement('div');
    statusBox.className = 'proj-status-bar';
    statusBox.innerHTML = `
      <span class="proj-status-title">STAGE MAPPING // PIN CORNERS</span>
      <button id="btn-proj-inset" class="proj-mini-btn" title="Inset corners 5% inside viewport">INSET 5%</button>
      <button id="btn-proj-reset" class="proj-mini-btn" title="Reset corners to full screen [R]">RESET [R]</button>
      <button id="btn-proj-grid" class="proj-mini-btn" title="Toggle 3x3 Calibration Grid [G]">GRID [G]</button>
      <button id="btn-proj-close" class="proj-mini-btn primary" title="Exit Mapping Mode [C]">DONE [C]</button>
    `;
    this.overlay.appendChild(statusBox);

    // 4 Corner Handles with Badges and extended hitboxes
    const CORNER_NAMES = ['TL', 'TR', 'BR', 'BL'];
    for (let i = 0; i < 4; i++) {
      const handle = document.createElement('div');
      handle.className = `proj-handle handle-${i}`;
      handle.dataset.index = i;
      handle.innerHTML = `
        <span class="proj-handle-tag">${CORNER_NAMES[i]}</span>
        <span class="proj-handle-coords"></span>
      `;
      this.overlay.appendChild(handle);
      this.handles.push(handle);
    }

    document.body.appendChild(this.overlay);
    this.updateHandlesUI();

    // Hook mini buttons
    statusBox.querySelector('#btn-proj-inset').addEventListener('click', (e) => {
      e.stopPropagation();
      this.inset(0.05);
    });
    statusBox.querySelector('#btn-proj-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      this.reset();
    });
    statusBox.querySelector('#btn-proj-grid').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleGrid();
    });
    statusBox.querySelector('#btn-proj-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCalibration();
      if (this.onToggleCallback) this.onToggleCallback(false);
    });
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;

      // Key 'C' toggles Calibration Mode
      if (e.key === 'c' || e.key === 'C') {
        this.toggleCalibration();
      }
      // Key 'R' resets calibration when in calibration mode
      if ((e.key === 'r' || e.key === 'R') && this.isActive) {
        this.reset();
      }
      // Key 'G' toggles grid when in calibration mode
      if ((e.key === 'g' || e.key === 'G') && this.isActive) {
        this.toggleGrid();
      }
    });

    this.handles.forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        this.activePoint = parseInt(handle.dataset.index, 10);
        handle.classList.add('dragging');
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      });

      handle.addEventListener('pointermove', (e) => {
        if (this.activePoint === null) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.corners[this.activePoint].x = Math.max(0, Math.min(1, e.clientX / w));
        this.corners[this.activePoint].y = Math.max(0, Math.min(1, e.clientY / h));
        this.updateHandlesUI();
        this.applyTransform();
      });

      const release = (e) => {
        if (this.activePoint !== null) {
          handle.classList.remove('dragging');
          try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
          this.activePoint = null;
          this.saveState();
        }
      };
      handle.addEventListener('pointerup', release);
      handle.addEventListener('pointercancel', release);
    });

    window.addEventListener('resize', () => {
      this.updateHandlesUI();
      this.applyTransform();
    });
  }

  toggleCalibration() {
    this.isActive = !this.isActive;
    this.overlay.style.display = this.isActive ? 'block' : 'none';
    document.body.classList.toggle('mapping-mode-active', this.isActive);
    if (this.isActive) {
      this.updateHandlesUI();
    }
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isActive);
    }
    return this.isActive;
  }

  toggleGrid() {
    this.isGridVisible = !this.isGridVisible;
    this.updateHandlesUI();
  }

  inset(amount = 0.05) {
    this.corners = [
      { x: amount, y: amount },             // Top-Left
      { x: 1.0 - amount, y: amount },       // Top-Right
      { x: 1.0 - amount, y: 1.0 - amount }, // Bottom-Right
      { x: amount, y: 1.0 - amount }        // Bottom-Left
    ];
    this.saveState();
    this.updateHandlesUI();
    this.applyTransform();
  }

  reset() {
    this.corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];
    this.saveState();
    this.updateHandlesUI();
    this.applyTransform();
  }

  updateHandlesUI() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (let i = 0; i < 4; i++) {
      const pt = this.corners[i];
      const px = pt.x * w;
      const py = pt.y * h;
      this.handles[i].style.transform = `translate(${px}px, ${py}px)`;
      
      const coordEl = this.handles[i].querySelector('.proj-handle-coords');
      if (coordEl) {
        coordEl.textContent = `${Math.round(pt.x * 100)}%, ${Math.round(pt.y * 100)}%`;
      }
    }

    // Render Grid & Calibration Lines inside SVG
    const pts = this.corners.map(c => `${c.x * w},${c.y * h}`).join(' ');
    
    let gridLinesSvg = '';
    if (this.isGridVisible) {
      // 3x3 subdivided quad lines
      for (let step = 1; step <= 2; step++) {
        const u = step / 3.0;
        // Top to bottom curve line
        const tx = (1 - u) * (this.corners[0].x * w) + u * (this.corners[1].x * w);
        const ty = (1 - u) * (this.corners[0].y * h) + u * (this.corners[1].y * h);
        const bx = (1 - u) * (this.corners[3].x * w) + u * (this.corners[2].x * w);
        const by = (1 - u) * (this.corners[3].y * h) + u * (this.corners[2].y * h);
        gridLinesSvg += `<line x1="${tx}" y1="${ty}" x2="${bx}" y2="${by}" class="proj-subgrid" />`;

        // Left to right curve line
        const lx = (1 - u) * (this.corners[0].x * w) + u * (this.corners[3].x * w);
        const ly = (1 - u) * (this.corners[0].y * h) + u * (this.corners[3].y * h);
        const rx = (1 - u) * (this.corners[1].x * w) + u * (this.corners[2].x * w);
        const ry = (1 - u) * (this.corners[1].y * h) + u * (this.corners[2].y * h);
        gridLinesSvg += `<line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" class="proj-subgrid" />`;
      }
    }

    // Bulls-eye rings for all 4 corners
    let targetRingsSvg = '';
    this.corners.forEach(c => {
      targetRingsSvg += `
        <circle cx="${c.x * w}" cy="${c.y * h}" r="22" class="proj-target-ring" />
        <circle cx="${c.x * w}" cy="${c.y * h}" r="6" class="proj-target-center" />
      `;
    });

    this.svg.innerHTML = `
      <polygon points="${pts}" class="proj-quad-outline" />
      ${gridLinesSvg}
      <line x1="${this.corners[0].x * w}" y1="${this.corners[0].y * h}" x2="${this.corners[2].x * w}" y2="${this.corners[2].y * h}" class="proj-crosshair" />
      <line x1="${this.corners[1].x * w}" y1="${this.corners[1].y * h}" x2="${this.corners[3].x * w}" y2="${this.corners[3].y * h}" class="proj-crosshair" />
      ${targetRingsSvg}
    `;
  }

  /**
   * Calculate 3D projective perspective transform matrix3d from 4 points
   */
  applyTransform() {
    if (!this.target) return;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const src = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h }
    ];

    const dst = this.corners.map(c => ({ x: c.x * w, y: c.y * h }));
    const matrix = this.getPerspectiveTransform(src, dst);

    if (matrix) {
      this.target.style.transformOrigin = '0 0';
      this.target.style.transform = `matrix3d(${matrix.join(',')})`;
    }
  }

  getPerspectiveTransform(src, dst) {
    // Gaussian elimination solver for 8-parameter homography
    const a = [];
    for (let i = 0; i < 4; i++) {
      a.push([
        src[i].x, src[i].y, 1, 0, 0, 0,
        -src[i].x * dst[i].x, -src[i].y * dst[i].x, dst[i].x
      ]);
      a.push([
        0, 0, 0, src[i].x, src[i].y, 1,
        -src[i].x * dst[i].y, -src[i].y * dst[i].y, dst[i].y
      ]);
    }

    const h = this.solveGaussian(a);
    if (!h) return null;

    // Convert 3x3 homography to CSS 4x4 matrix3d column-major
    return [
      h[0], h[3], 0, h[6],
      h[1], h[4], 0, h[7],
      0,    0,    1, 0,
      h[2], h[5], 0, 1
    ];
  }

  solveGaussian(a) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(a[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(a[k][i]) > maxEl) {
          maxEl = Math.abs(a[k][i]);
          maxRow = k;
        }
      }
      for (let k = i; k <= n; k++) {
        const tmp = a[maxRow][k];
        a[maxRow][k] = a[i][k];
        a[i][k] = tmp;
      }
      if (Math.abs(a[i][i]) < 1e-7) return null;
      for (let k = i + 1; k < n; k++) {
        const c = -a[k][i] / a[i][i];
        for (let j = i; j <= n; j++) {
          if (i === j) a[k][j] = 0;
          else a[k][j] += c * a[i][j];
        }
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = a[i][n] / a[i][i];
      for (let k = i - 1; k >= 0; k--) {
        a[k][n] -= a[k][i] * x[i];
      }
    }
    return x;
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.corners));
    } catch (_) {}
  }

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) {
          this.corners = parsed;
        }
      }
    } catch (_) {}
  }
}
