import * as THREE from 'three';
import { MURALS, STREET, SHARED, FOG_PARS, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, mulberry32 } from './world.js';
import { ARTIST_DATA } from '../data/artist-profile.js';

const MARKER = '"Permanent Marker", "Impact", sans-serif';
const CLEAN = '"Montserrat", "Arial", sans-serif';
const STENCIL = '"Courier Prime", "Courier New", monospace';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform sampler2D uMap;
uniform float uBass;
uniform float uEnergy;
uniform float uBeat;
varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec3 t = texture2D(uMap, vUv).rgb;
  float luma = dot(t, vec3(0.299, 0.587, 0.114));
  float paint = smoothstep(0.2, 0.55, luma);
  vec3 col = t * (0.95 + paint * (uBass * 0.5 + uEnergy * 0.3 + uBeat * 0.4) * uActive);
  // Painted letters pick up the audio colour on bass hits.
  col += paint * hueColor(uHue) * luma * (uBass * 0.6 + uBeat * 0.9) * uActive;
  col += t * vec3(0.7, 0.18, 0.5) * exp(-max(vWorld.y, 0.0) / 7.0) * 0.35;
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth) * 0.9);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/* ---------- paint helpers ---------- */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paintBrickWall(ctx, w, h, rng) {
  ctx.fillStyle = '#1a1214';
  ctx.fillRect(0, 0, w, h);
  const bh = 30;
  const bw = 84;
  for (let row = 0; row * bh < h; row++) {
    const off = (row % 2) * (bw / 2);
    for (let x = -off; x < w; x += bw) {
      const hue = 4 + rng() * 16;
      const sat = 24 + rng() * 18;
      const light = 13 + rng() * 10;
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
      ctx.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }

  const soot = ctx.createLinearGradient(0, 0, 0, h);
  soot.addColorStop(0, 'rgba(0,0,0,0.5)');
  soot.addColorStop(0.25, 'rgba(0,0,0,0)');
  soot.addColorStop(0.8, 'rgba(0,0,0,0.05)');
  soot.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = rng() < 0.55 ? 'rgba(0,0,0,0.28)' : 'rgba(255,240,230,0.05)';
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
  }
  for (let i = 0; i < 46; i++) {
    const x = rng() * w;
    const len = h * (0.2 + rng() * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rng() * 5, len);
  }
}

function sprayCloud(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function overspray(ctx, x0, y0, x1, y1, color, count, rng) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.15 + rng() * 0.35;
    const r = 0.8 + rng() * 2.6;
    ctx.beginPath();
    ctx.arc(x0 + rng() * (x1 - x0), y0 + rng() * (y1 - y0), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Drip paint down from wherever bright paint sits on the row just above `y`. */
function drips(ctx, x0, x1, y, color, rng, count, maxLen) {
  const width = Math.max(1, Math.floor(x1 - x0));
  const row = ctx.getImageData(Math.floor(x0), Math.floor(y - 6), width, 1).data;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = Math.floor(rng() * width);
    const r = row[px * 4];
    const g = row[px * 4 + 1];
    const b = row[px * 4 + 2];
    if (r + g + b < 260) continue;
    const len = 18 + rng() * maxLen;
    const w = 3 + rng() * 5;
    const x = x0 + px;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - 8);
    ctx.lineTo(x + w / 2, y - 8);
    ctx.lineTo(x + w * 0.35, y + len);
    ctx.lineTo(x - w * 0.35, y + len);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y + len, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function fitFont(ctx, text, weight, size, family, maxWidth) {
  ctx.font = `${weight} ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  if (maxWidth && width > maxWidth) size = Math.floor(size * (maxWidth / width));
  return `${weight} ${size}px ${family}`;
}

function sprayText(ctx, text, x, y, opts, rng) {
  const { fill, outline = '#0a0710', outlineWidth = 14, halo, extrude = 0, extrudeColor = '#120a1c', align = 'left', maxWidth } = opts;
  const font = opts.family ? fitFont(ctx, text, opts.weight || 400, opts.size, opts.family, maxWidth) : opts.font;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  if (halo) {
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = halo;
      ctx.lineWidth = outlineWidth * 3 + rng() * 18;
      ctx.strokeText(text, x + (rng() - 0.5) * 8, y + (rng() - 0.5) * 8);
    }
    ctx.globalAlpha = 1;
  }

  for (let i = extrude; i > 0; i--) {
    ctx.fillStyle = extrudeColor;
    ctx.fillText(text, x + i * 1.6, y + i * 1.6);
  }

  ctx.strokeStyle = outline;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paintedParagraph(ctx, text, x, y, maxWidth, lineHeight, color, rng) {
  const lines = wrapLines(ctx, text, maxWidth);
  ctx.save();
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    const jx = (rng() - 0.5) * 2;
    const jy = (rng() - 0.5) * 2;
    ctx.globalAlpha = 0.25;
    ctx.fillText(line, x + jx + 1.5, y + i * lineHeight + jy + 1.5);
    ctx.globalAlpha = 1;
    ctx.fillText(line, x + jx, y + i * lineHeight + jy);
  });
  ctx.restore();
  return y + lines.length * lineHeight;
}

function buffPatch(ctx, x, y, w, h, rng) {
  ctx.save();
  ctx.fillStyle = 'rgba(14, 11, 20, 0.86)';
  ctx.beginPath();
  const steps = 18;
  for (let i = 0; i <= steps; i++) ctx.lineTo(x + (w * i) / steps, y + (rng() - 0.5) * 18);
  for (let i = 0; i <= steps; i++) ctx.lineTo(x + w + (rng() - 0.5) * 18, y + (h * i) / steps);
  for (let i = steps; i >= 0; i--) ctx.lineTo(x + (w * i) / steps, y + h + (rng() - 0.5) * 18);
  for (let i = steps; i >= 0; i--) ctx.lineTo(x + (rng() - 0.5) * 18, y + (h * i) / steps);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fourPointStar(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.14, y - r * 0.14);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.14, y + r * 0.14);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.14, y + r * 0.14);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.14, y - r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function pyramidEmblem(ctx, cx, base, size) {
  const apexY = base - size * 0.95;
  ctx.save();
  // Laser fan up and to the left, like the logo.
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    ctx.beginPath();
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx - size * 1.5 + t * size * 1.9, apexY - size * 0.15 - t * size * 1.05);
    ctx.lineTo(cx - size * 1.5 + (t + 0.07) * size * 1.9, apexY - size * 0.15 - (t + 0.07) * size * 1.05);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(120, 40, 255, 0.75)' : 'rgba(80, 30, 230, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 40, 80, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Two faces.
  ctx.beginPath();
  ctx.moveTo(cx, apexY);
  ctx.lineTo(cx - size * 0.72, base - size * 0.12);
  ctx.lineTo(cx, base);
  ctx.closePath();
  ctx.fillStyle = '#f2c21d';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, apexY);
  ctx.lineTo(cx, base);
  ctx.lineTo(cx + size * 0.68, base - size * 0.14);
  ctx.closePath();
  ctx.fillStyle = '#c99812';
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 55, 0, 0.8)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const y = apexY + (base - apexY) * t;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.72 * t, apexY + (base - size * 0.12 - apexY) * t);
    ctx.lineTo(cx, y);
    ctx.lineTo(cx + size * 0.68 * t, apexY + (base - size * 0.14 - apexY) * t);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- murals ---------- */

function paintTitle(w, h) {
  const rng = mulberry32(11);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  paintBrickWall(ctx, w, h, rng);

  sprayCloud(ctx, w * 0.56, h * 0.45, w * 0.42, 'rgba(110, 30, 220, 1)', 0.55);
  sprayCloud(ctx, w * 0.8, h * 0.35, w * 0.22, 'rgba(255, 20, 110, 1)', 0.45);
  sprayCloud(ctx, w * 0.3, h * 0.6, w * 0.2, 'rgba(0, 200, 255, 1)', 0.3);

  pyramidEmblem(ctx, w * 0.17, h * 0.86, h * 0.48);
  fourPointStar(ctx, w * 0.07, h * 0.18, 34);
  fourPointStar(ctx, w * 0.93, h * 0.14, 44);
  fourPointStar(ctx, w * 0.38, h * 0.12, 26);

  const textX = w * 0.31;
  const textY = h * 0.58;
  const grad = ctx.createLinearGradient(textX, textY - 220, w - 60, textY);
  grad.addColorStop(0, '#ff2a7a');
  grad.addColorStop(0.5, '#c04cff');
  grad.addColorStop(1, '#2fe8ff');
  const width = sprayText(ctx, 'DJ DEAF WISH', textX, textY, {
    family: MARKER,
    size: 250,
    maxWidth: w - textX - 70,
    fill: grad,
    outline: '#ffffff',
    outlineWidth: 16,
    halo: '#ff4fa0',
    extrude: 14
  }, rng);
  drips(ctx, textX, textX + width, textY + 4, '#d23cff', rng, 26, 110);
  overspray(ctx, textX - 40, textY - 260, textX + width + 40, textY + 60, '#ff6ab5', 500, rng);

  ctx.save();
  ctx.fillStyle = '#07050b';
  ctx.fillRect(textX - 10, textY + 70, width + 20, 92);
  ctx.font = `700 52px ${STENCIL}`;
  ctx.fillStyle = '#ffb000';
  ctx.textBaseline = 'middle';
  ctx.fillText('UNIVERSAL MUSIC DESIGN // DEAF SONIC AGENCY', textX + 20, textY + 116, width - 30);
  ctx.restore();

  sprayText(ctx, 'PDX', w * 0.9, h * 0.92, { font: `400 80px ${MARKER}`, fill: '#ffffff', outlineWidth: 8, align: 'center' }, rng);
  return canvas;
}

function paintBio(w, h) {
  const rng = mulberry32(23);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  paintBrickWall(ctx, w, h, rng);

  sprayCloud(ctx, w * 0.2, h * 0.16, w * 0.3, 'rgba(0, 210, 255, 1)', 0.35);
  sprayCloud(ctx, w * 0.85, h * 0.85, w * 0.25, 'rgba(255, 20, 110, 1)', 0.3);

  const headerY = 205;
  const hw = sprayText(ctx, 'DEAF SONIC AGENCY', 120, headerY, {
    family: MARKER,
    size: 160,
    maxWidth: w - 420,
    fill: '#2ff3ff',
    outline: '#06040a',
    outlineWidth: 18,
    halo: '#2ff3ff',
    extrude: 8
  }, rng);
  drips(ctx, 120, 120 + hw, headerY + 4, '#2ff3ff', rng, 22, 70);

  ctx.save();
  ctx.strokeStyle = '#ff2a7a';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(130, headerY + 44);
  ctx.quadraticCurveTo(130 + hw * 0.5, headerY + 70, 120 + hw, headerY + 38);
  ctx.stroke();
  ctx.restore();

  buffPatch(ctx, 90, 320, w - 180, 860, rng);

  ctx.font = `700 46px ${CLEAN}`;
  let y = 400;
  y = paintedParagraph(ctx, ARTIST_DATA.bio, 140, y, w - 280, 66, '#f3efe4', rng);
  y += 40;
  ctx.font = `800 46px ${CLEAN}`;
  y = paintedParagraph(ctx, ARTIST_DATA.mission, 140, y, w - 280, 66, '#ffd36b', rng);

  ctx.save();
  ctx.font = `700 40px ${STENCIL}`;
  ctx.fillStyle = '#ffb000';
  ctx.fillText(ARTIST_DATA.base, 140, Math.min(h - 70, y + 70));
  ctx.restore();

  fourPointStar(ctx, w - 160, 150, 40);
  fourPointStar(ctx, w - 280, 90, 22);
  overspray(ctx, 0, 0, w, 300, '#2ff3ff', 300, rng);
  return canvas;
}

function paintRider(w, h) {
  const rng = mulberry32(37);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  paintBrickWall(ctx, w, h, rng);

  sprayCloud(ctx, w * 0.75, h * 0.18, w * 0.3, 'rgba(255, 20, 110, 1)', 0.38);
  sprayCloud(ctx, w * 0.15, h * 0.8, w * 0.25, 'rgba(120, 40, 255, 1)', 0.35);

  const headerY = 205;
  const hw = sprayText(ctx, 'TECHNICAL RIDER', 120, headerY, {
    family: MARKER,
    size: 165,
    maxWidth: w - 360,
    fill: '#ff2a7a',
    outline: '#06040a',
    outlineWidth: 18,
    halo: '#ff2a7a',
    extrude: 8
  }, rng);
  drips(ctx, 120, 120 + hw, headerY + 4, '#ff2a7a', rng, 22, 80);

  buffPatch(ctx, 90, 280, w - 180, 960, rng);

  ctx.save();
  ctx.font = `700 46px ${CLEAN}`;
  ctx.fillStyle = '#f3efe4';
  ctx.fillText(ARTIST_DATA.riderIntro, 140, 360, w - 280);
  ctx.restore();

  const colW = (w - 280) / 2;
  const accents = ['#2ff3ff', '#ffb000', '#c04cff', '#2ff3ff'];
  ARTIST_DATA.techRider.forEach((item, i) => {
    const cx = 140 + (i % 2) * (colW + 40);
    const cy = 470 + Math.floor(i / 2) * 370;

    ctx.save();
    ctx.font = `700 120px ${STENCIL}`;
    ctx.fillStyle = accents[i];
    ctx.globalAlpha = 0.9;
    ctx.fillText(`0${i + 1}`, cx, cy + 90);
    ctx.restore();

    sprayText(ctx, item.label.toUpperCase(), cx + 170, cy + 70, {
      family: MARKER,
      size: 66,
      maxWidth: colW - 200,
      fill: '#ffffff',
      outline: '#06040a',
      outlineWidth: 8
    }, rng);

    ctx.font = `600 40px ${CLEAN}`;
    paintedParagraph(ctx, item.desc, cx + 170, cy + 135, colW - 200, 54, '#e6e0f0', rng);
  });

  fourPointStar(ctx, w - 140, 130, 36);
  overspray(ctx, 0, 0, w, 300, '#ff6ab5', 300, rng);
  return canvas;
}

/**
 * Murals - spray-painted walls baked once into textures, lit by the street's neon.
 */
export class Murals {
  constructor(scene, maxAniso = 4) {
    this.group = new THREE.Group();
    this.maxAniso = maxAniso;

    this.addMural(MURALS.title, paintTitle(2048, 980));
    this.addMural(MURALS.bio, paintBio(2048, 1332));
    this.addMural(MURALS.rider, paintRider(2048, 1332));

    scene.add(this.group);
  }

  addMural(spec, canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uBass: SHARED.uBass,
        uEnergy: SHARED.uEnergy,
        uBeat: SHARED.uBeat,
        uHue: SHARED.uHue,
        ...HUE_UNIFORMS,
        uActive: SHARED.uActive,
        uBands: SHARED.uBands,
        uFogColor: SHARED.uFogColor,
        uFogNear: SHARED.uFogNear,
        uFogFar: SHARED.uFogFar
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), mat);
    const cy = spec.bottom + spec.height / 2;
    if (spec.kind === 'facade') {
      mesh.position.set(spec.side * (STREET.half - 0.04), cy, spec.z);
      mesh.rotation.y = spec.side === -1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      mesh.position.set(spec.x, cy, spec.facadeZ + 0.04);
    }
    this.group.add(mesh);
  }
}
