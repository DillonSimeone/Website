// ---------------------------------------------------------
// The Optimizer - Orchestration Engine
// ---------------------------------------------------------

import './style.css';
import { initHumanWorld, drawHumanWorld } from './phases/human_world.js';
import { drawDarkTransition } from './phases/dark_transition.js';
import { drawReincarnation } from './phases/reincarnation.js';
import { drawOptimization } from './phases/optimization.js';

// Global System State
let scrollPos = 0;
let viewportH = window.innerHeight;
let currentState = 'HUMAN_WORLD';
let chapterProgress = 0; 

// Modular Lerp Engine
let weights = {
  city: 1,
  mugging: 0,
  merge: 0,
  magic: 0,
  magicComplexity: 0,
};

function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}

// Canvases
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const hCanvas = document.getElementById('header-canvas');
const hCtx = hCanvas.getContext('2d');

function initResize() {
  window.addEventListener('resize', () => {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    hCanvas.width = hCanvas.parentElement.clientWidth;
    hCanvas.height = hCanvas.parentElement.clientHeight;
    viewportH = window.innerHeight;
  });
  window.dispatchEvent(new Event('resize'));
}

// ---------------------------------------------------------
// Shared Background Systems (Triangles and Bricks)
// ---------------------------------------------------------
class Triangle {
  constructor(x1, y1, x2, y2, x3, y3, color) {
    this.points = [[x1, y1], [x2, y2], [x3, y3]];
    this.color = color;
    this.opacity = Math.random() * 0.4 + 0.1;
  }
  draw(ctx, time) {
    ctx.beginPath();
    ctx.moveTo(this.points[0][0], this.points[0][1]);
    ctx.lineTo(this.points[1][0], this.points[1][1]);
    ctx.lineTo(this.points[2][0], this.points[2][1]);
    ctx.closePath();
    const pulse = Math.sin(time * 0.0005 + (this.points[0][0] * 0.01)) * 0.2 + 0.8;
    ctx.fillStyle = `rgba(${this.color}, ${this.opacity * pulse})`;
    ctx.fill();
  }
}

const triangles = [];
function initBackground() {
  const step = 80;
  const colors = ['15, 15, 30', '79, 70, 229', '0, 229, 255'];
  for (let x = -step; x < window.innerWidth + step; x += step) {
    for (let y = -step; y < window.innerHeight + step; y += step) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      triangles.push(new Triangle(x, y, x+step, y, x+step/2, y+step, c));
    }
  }
}

function drawBricks(ctx, w, h, time) {
  const bW = 80;
  const bH = 40;
  const gap = 2;
  for (let y = -bH; y < h + bH; y += bH + gap) {
    const row = Math.floor(y / bH);
    const offset = (row % 2 === 0) ? bW / 2 : 0;
    for (let x = -bW + offset; x < w + bW; x += bW + gap) {
      const shade = 12 + Math.sin(x * 0.01 + y * 0.01) * 4;
      ctx.fillStyle = `rgb(${shade}, ${shade * 0.8}, ${shade * 1.25})`;
      ctx.fillRect(x, y, bW, bH);
    }
  }
}

let bgTypeLerp = 0; 
function renderMainBackground(time) {
  const w = bgCanvas.width;
  const h = bgCanvas.height;
  const targetBg = (currentState === 'HUMAN_WORLD' || currentState === 'DARK_TRANSITION') ? 0 : 1;
  bgTypeLerp = lerp(bgTypeLerp, targetBg, 0.05);

  bgCtx.clearRect(0, 0, w, h);
  if (bgTypeLerp < 0.99) {
    bgCtx.globalAlpha = 1 - bgTypeLerp;
    triangles.forEach(t => t.draw(bgCtx, time));
  }
  if (bgTypeLerp > 0.01) {
    bgCtx.globalAlpha = bgTypeLerp;
    drawBricks(bgCtx, w, h, time);
  }
  bgCtx.globalAlpha = 1;
}

// ---------------------------------------------------------
// Orchestration Logic
// ---------------------------------------------------------
let portfolioVal = 2847293;
function updatePortfolioValue() {
  const el = document.querySelector('.data-block .value');
  if (el && currentState === 'HUMAN_WORLD') {
    portfolioVal += Math.floor(Math.random() * 150) + 50;
    el.innerText = `$${portfolioVal.toLocaleString()}`;
  }
}
setInterval(updatePortfolioValue, 2000);

function updateSystem() {
  scrollPos = window.scrollY;
  const sections = document.querySelectorAll('.story-section');
  const trigger = viewportH * 0.5;

  sections.forEach(sec => {
    const rect = sec.getBoundingClientRect();
    const state = sec.getAttribute('data-state');
    if (rect.top < viewportH * 0.85 && rect.bottom > viewportH * 0.15) sec.classList.add('active');
    else sec.classList.remove('active');

    if (rect.top <= trigger && rect.bottom >= trigger) {
      if (currentState !== state) {
        currentState = state;
        // Global reset when returning to Start
        if (state === 'HUMAN_WORLD') {
          document.body.style.backgroundColor = '';
          const overlay = document.getElementById('overlay-black');
          if (overlay) overlay.style.opacity = '0';
        }
      }
      chapterProgress = (trigger - rect.top) / rect.height;
    }
  });

  const target = { city: 0, mugging: 0, merge: 0, magic: 0, comp: 0 };
  if (currentState === 'HUMAN_WORLD') target.city = 1;
  else if (currentState === 'DARK_TRANSITION') target.mugging = 1;
  else if (currentState === 'REINCARNATION') target.merge = 1;
  else if (currentState.startsWith('OPTIMIZATION_')) {
    target.magic = 1;
    if (currentState === 'OPTIMIZATION_V1') target.comp = 0 + chapterProgress;
    if (currentState === 'OPTIMIZATION_V2') target.comp = 1 + chapterProgress;
    if (currentState === 'OPTIMIZATION_V3') target.comp = 2 + chapterProgress;
  } else if (currentState === 'THE_SEED') {
    target.magic = 1; target.comp = 3;
  }

  weights.city = lerp(weights.city, target.city, 0.1);
  weights.mugging = lerp(weights.mugging, target.mugging, 0.1);
  weights.merge = lerp(weights.merge, target.merge, 0.1);
  weights.magic = lerp(weights.magic, target.magic, 0.1);
  weights.magicComplexity = lerp(weights.magicComplexity, target.comp, 0.05);

  document.getElementById('header-label').innerText = `OPTIMIZER_V1.0.4 // ${currentState}`;
}

function animate(time) {
  renderMainBackground(time);
  updateSystem();
  
  const w = hCanvas.width;
  const h = hCanvas.height;
  hCtx.clearRect(0,0,w,h);

  // Call Modular Phases
  if (weights.city > 0.01) drawHumanWorld(hCtx, w, h, weights.city, time, scrollPos);
  if (weights.mugging > 0.01) drawDarkTransition(hCtx, w, h, weights.mugging, time, chapterProgress, currentState);
  if (weights.merge > 0.01) drawReincarnation(hCtx, w, h, weights.merge, time, chapterProgress, currentState);
  if (weights.magic > 0.01) drawOptimization(hCtx, w, h, weights.magic, weights.magicComplexity, time);

  requestAnimationFrame(animate);
}

// Initialize
initResize();
initBackground();
initHumanWorld(window.innerWidth, 140);
requestAnimationFrame(animate);
