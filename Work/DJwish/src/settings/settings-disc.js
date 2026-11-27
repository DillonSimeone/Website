import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { APEX, SHARED, OUTPUT_CHUNK, smoothstep, setAudioColor } from '../three/world.js';
import { SETTINGS_SCHEMA, formatSetting } from './settings-store.js';

// Disc layout in CSS pixels. Each section panel sits on the platter at its own angle;
// the platter spins so the selected panel ends up level at 12 o'clock.
const DISC_PX = 1580;
const PANEL_RADIUS = 555;
const PANEL_W = 420;
const PANEL_H = 420;
const HUB_PX = 400;
const M_PER_PX = 0.05;
const STEP_DEG = 360 / SETTINGS_SCHEMA.length;
const LETTERS = 'ABCDEFGH';

// World placement: floating just above and in front of the capstone, facing the city.
const DISC_CENTER = new THREE.Vector3(APEX.x, APEX.y + 62, APEX.z + 30);
const RISE_FROM = new THREE.Vector3(APEX.x, APEX.y - 2, APEX.z + 4);

const LAUNCH_DELAY = 0.85;
const RISE_TIME = 1.9;
const SINK_TIME = 1.1;
const SPIN_TURNS = 3;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const lerp = (a, b, t) => a + (b - a) * t;

const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying float vAngle;
varying float vFacing;
void main() {
  vAlong = uv.y;
  vAngle = uv.x * 6.2831853;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGrowth;
uniform float uTime;
uniform float uEdgePow;
varying float vAlong;
varying float vAngle;
varying float vFacing;
void main() {
  float fresnel = pow(clamp(vFacing, 0.0, 1.0), uEdgePow);
  float head = 1.0 - smoothstep(uGrowth - 0.08, uGrowth + 0.02, vAlong);
  float crest = exp(-pow((vAlong - uGrowth) * 14.0, 2.0)) * step(uGrowth, 0.985) * 1.35;
  float feather = smoothstep(0.0, 0.06, vAlong) * smoothstep(1.0, 0.72, vAlong);
  float rays = 0.78 + 0.22 * sin(vAngle * 5.0 + uTime * 1.1) * sin(vAlong * 7.0 - uTime * 1.8);
  float intensity = (fresnel * head * feather * rays + fresnel * crest) * uAlpha;
  gl_FragColor = vec4(uColor * intensity, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 4.2) * (1.0 - smoothstep(0.65, 1.0, d));
  gl_FragColor = vec4(uColor * glow * uAlpha, 1.0);
  ${OUTPUT_CHUNK}
}
`;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * SettingsDisc - a vinyl record that rises spinning out of the capstone on a volumetric
 * Fresnel spotlight and carries every setting. Rendered via CSS3DRenderer on the WebGL camera.
 */
export class SettingsDisc {
  constructor(container, scene) {
    this.state = 'hidden';
    this.t = 0;
    this.beamTime = 0;
    this.active = 0;
    this.platterAngle = 0;
    this.platterTarget = 0;
    this.platterVel = 0;
    this.store = null;
    this.controls = new Map();
    this.onLaunch = null;
    this.onClosed = null;
    this.onRequestClose = null;

    this._beamColor = new THREE.Color(1, 0.6, 1);
    this._sectionColor = new THREE.Color('#00f0ff');
    this._audioColor = new THREE.Color();

    this.renderer = new CSS3DRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.className = 'settings-css3d';
    container.appendChild(this.renderer.domElement);
    this.cssScene = new THREE.Scene();

    this.root = this.buildDom();
    this.object = new CSS3DObject(this.root);
    this.object.position.copy(RISE_FROM);
    this.cssScene.add(this.object);
    this.root.style.display = 'none';

    this.buildBeam(scene);
  }

  get visible() {
    return this.state !== 'hidden';
  }

  get isOpen() {
    return this.state === 'open' || this.state === 'rising';
  }

  /* ---------------- DOM ---------------- */

  buildDom() {
    const root = el('div', 'settings-disc');
    root.style.width = root.style.height = `${DISC_PX}px`;

    this.platter = el('div', 'disc-platter');
    this.platter.appendChild(el('div', 'disc-vinyl'));
    this.panels = SETTINGS_SCHEMA.map((section, i) => this.buildPanel(section, i));
    this.panels.forEach(p => this.platter.appendChild(p));
    root.appendChild(this.platter);

    const hub = el('div', 'disc-hub');
    hub.style.width = hub.style.height = `${HUB_PX}px`;
    hub.appendChild(el('div', 'disc-hub-title', 'SETTINGS'));
    const nav = el('div', 'disc-hub-nav');
    const prev = el('button', 'disc-hub-arrow', '◀');
    prev.setAttribute('aria-label', 'Previous section');
    this.sectionLabel = el('span', 'disc-hub-section');
    const next = el('button', 'disc-hub-arrow', '▶');
    next.setAttribute('aria-label', 'Next section');
    prev.addEventListener('click', () => this.step(-1));
    next.addEventListener('click', () => this.step(1));
    nav.append(prev, this.sectionLabel, next);
    hub.appendChild(nav);

    const actions = el('div', 'disc-hub-actions');
    this.resetBtn = el('button', 'disc-hub-btn', 'RESET ALL');
    this.resetBtn.addEventListener('click', () => this.handleReset());
    const closeBtn = el('button', 'disc-hub-btn hot', 'CLOSE');
    closeBtn.addEventListener('click', () => this.onRequestClose?.());
    actions.append(this.resetBtn, closeBtn);
    hub.appendChild(actions);
    hub.appendChild(el('div', 'disc-hub-note', 'Saved on this device'));
    root.appendChild(hub);

    // Touch swipe on the vinyl disc spins to previous/next section on mobile
    let swipeX = 0;
    let swipeY = 0;
    let swiping = false;
    root.addEventListener('touchstart', (e) => {
      if (e.target.closest('input, select')) {
        swiping = false;
        return;
      }
      if (e.touches && e.touches[0]) {
        swipeX = e.touches[0].clientX;
        swipeY = e.touches[0].clientY;
        swiping = true;
      }
    }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (!swiping || !e.changedTouches || !e.changedTouches[0]) return;
      swiping = false;
      const dx = e.changedTouches[0].clientX - swipeX;
      const dy = e.changedTouches[0].clientY - swipeY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        this.step(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    this.updateActiveClasses();
    return root;
  }

  buildPanel(section, i) {
    const panel = el('section', 'disc-panel');
    panel.style.width = `${PANEL_W}px`;
    panel.style.height = `${PANEL_H}px`;
    panel.style.setProperty('--accent', section.color);
    panel.style.transform = `translate(-50%, -50%) rotate(${i * STEP_DEG}deg) translateY(${-PANEL_RADIUS}px)`;

    const head = el('header', 'disc-panel-head');
    head.append(el('span', 'disc-panel-letter', LETTERS[i]), el('span', 'disc-panel-name', section.label));
    panel.appendChild(head);

    const rows = el('div', 'disc-rows');
    for (const item of section.items) rows.appendChild(this.buildRow(item));
    panel.appendChild(rows);

    // Tapping a section that is not facing the reader spins the disc to it instead.
    panel.addEventListener('pointerdown', (e) => {
      if (i === this.active) return;
      e.preventDefault();
      e.stopPropagation();
      this.select(i);
    }, true);
    return panel;
  }

  buildRow(item) {
    const row = el('label', 'disc-row');
    row.appendChild(el('span', 'disc-label', item.label));

    if (item.type === 'range') {
      const input = el('input', 'disc-range');
      input.type = 'range';
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      const value = el('span', 'disc-value');
      input.addEventListener('input', () => this.store?.set(item.key, parseFloat(input.value)));
      row.append(input, value);
      this.controls.set(item.key, (v) => {
        input.value = v;
        value.textContent = formatSetting(item, v);
      });
    } else if (item.type === 'toggle') {
      row.classList.add('is-toggle');
      const btn = el('button', 'disc-toggle');
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.store?.set(item.key, !this.store.get(item.key));
      });
      row.appendChild(btn);
      this.controls.set(item.key, (v) => {
        btn.setAttribute('aria-pressed', v ? 'true' : 'false');
        btn.textContent = v ? 'ON' : 'OFF';
      });
    } else if (item.type === 'select') {
      row.classList.add('is-select');
      const select = el('select', 'disc-select');
      for (const [value, label] of item.options) {
        const o = el('option', '', label);
        o.value = value;
        select.appendChild(o);
      }
      select.addEventListener('change', () => this.store?.set(item.key, select.value));
      row.appendChild(select);
      this.controls.set(item.key, (v) => { select.value = v; });
    }
    return row;
  }

  bind(store) {
    this.store = store;
    store.applyAll((k, v) => this.controls.get(k)?.(v));
    store.onChange((k, v) => this.controls.get(k)?.(v));
  }

  handleReset() {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetBtn.textContent = 'CONFIRM RESET';
      this.resetBtn.classList.add('armed');
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.disarmReset(), 3000);
      return;
    }
    this.disarmReset();
    this.store?.resetAll();
    // A celebratory spin back to section A.
    this.platterVel -= 900;
    this.select(0);
  }

  disarmReset() {
    this.resetArmed = false;
    this.resetBtn.textContent = 'RESET ALL';
    this.resetBtn.classList.remove('armed');
  }

  /* ---------------- section rotation ---------------- */

  select(i) {
    const n = SETTINGS_SCHEMA.length;
    this.active = ((i % n) + n) % n;
    const goal = -this.active * STEP_DEG;
    let delta = (goal - this.platterTarget) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.platterTarget += delta;
    this.updateActiveClasses();
  }

  step(dir) {
    this.select(this.active + dir);
  }

  updateActiveClasses() {
    this.panels.forEach((p, i) => p.classList.toggle('active', i === this.active));
    const s = SETTINGS_SCHEMA[this.active];
    this.sectionLabel.textContent = `${LETTERS[this.active]} · ${s.label}`;
    this.sectionLabel.style.color = s.color;
    this._sectionColor?.set(s.color);
  }

  /* ---------------- open / close ---------------- */

  open(onLaunch) {
    if (this.isOpen) return;
    this.onLaunch = onLaunch;
    if (this.state === 'sinking') {
      // Reopened mid-sink: rise again from where it is, camera never left.
      this.onClosed = null;
      this.state = 'rising';
      const sunk = RISE_FROM.distanceTo(this.object.position) / RISE_FROM.distanceTo(DISC_CENTER);
      this.t = Math.max(0, 1 - Math.cbrt(1 - Math.min(1, sunk))) * RISE_TIME;
      this.launched = true;
      return;
    }
    this.state = 'rising';
    this.t = -LAUNCH_DELAY;
    this.launched = false;
    this.root.classList.remove('interactive');
    this.platterAngle = this.platterTarget;
    this.platterVel = 0;
  }

  close(onClosed) {
    if (this.state === 'hidden' || this.state === 'sinking') return;
    if (this.state === 'rising' && this.t < 0) {
      // Never launched: nothing to sink.
      this.state = 'hidden';
      this.beamGroup.visible = false;
      onClosed?.();
      return;
    }
    this.onClosed = onClosed;
    this.state = 'sinking';
    this.t = 0;
    this.sinkFrom = this.object.position.clone();
    this.sinkScale = this.object.scale.x / M_PER_PX;
    this.root.classList.remove('interactive');
    this.disarmReset();
  }

  /* ---------------- camera framing ---------------- */

  /** Camera pose that frames the active section level at the top plus the hub below it. */
  getCameraPose(camera, outPos, outTgt) {
    const top = PANEL_RADIUS + PANEL_H / 2 + 20;
    const bottom = -HUB_PX / 2 - 14;
    const focusY = ((top + bottom) / 2) * M_PER_PX;
    const regionH = (top - bottom) * M_PER_PX;
    const padW = camera.aspect < 0.85 ? 42 : 70;
    const regionW = (PANEL_W + padW) * M_PER_PX;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const d = Math.max(regionH / 2 / tanV, regionW / 2 / tanH);
    outTgt.set(DISC_CENTER.x, DISC_CENTER.y + focusY, DISC_CENTER.z);
    outPos.set(outTgt.x, outTgt.y, outTgt.z + d);
  }

  /* ---------------- WebGL volumetric spotlight ---------------- */

  buildBeam(scene) {
    const from = new THREE.Vector3(APEX.x, APEX.y - 2, APEX.z);
    const dir = new THREE.Vector3().subVectors(DISC_CENTER, from);
    const len = dir.length();
    const mid = from.clone().addScaledVector(dir, 0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    this.beamGroup = new THREE.Group();
    this.beamGroup.visible = false;

    const makeCone = (topR, botR, segs, edgePow) => {
      const geo = new THREE.CylinderGeometry(topR, botR, len, segs, 1, true);
      const uniforms = {
        uColor: { value: new THREE.Color(1, 0.6, 1) },
        uAlpha: { value: 0 },
        uGrowth: { value: 0 },
        uTime: SHARED.uTime,
        uEdgePow: { value: edgePow }
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid);
      mesh.quaternion.copy(quat);
      mesh.renderOrder = 9;
      mesh.frustumCulled = false;
      this.beamGroup.add(mesh);
      return uniforms;
    };

    this.outerBeamUniforms = makeCone(34, 2.6, 36, 2.2);
    this.coreBeamUniforms = makeCone(14, 1.4, 28, 3.6);

    // Soft radial ambient halo floating just behind the vinyl disc
    this.haloUniforms = {
      uColor: { value: new THREE.Color(1, 0.6, 1) },
      uAlpha: { value: 0 }
    };
    const haloMat = new THREE.ShaderMaterial({
      uniforms: this.haloUniforms,
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), haloMat);
    haloMesh.position.set(DISC_CENTER.x, DISC_CENTER.y, DISC_CENTER.z - 2);
    haloMesh.renderOrder = 8;
    haloMesh.frustumCulled = false;
    this.beamGroup.add(haloMesh);

    scene.add(this.beamGroup);
  }

  updateSpotlight(alpha, growth, haloAlpha) {
    const visible = alpha > 0.01 || haloAlpha > 0.01;
    this.beamGroup.visible = visible;
    if (!visible) return;

    const active = SHARED.uActive.value;
    setAudioColor(this._audioColor, SHARED.uHue.value, 0.65);
    this._beamColor.copy(this._sectionColor).lerp(this._audioColor, active * 0.65).multiplyScalar(1.35);

    this.outerBeamUniforms.uColor.value.copy(this._beamColor);
    this.outerBeamUniforms.uAlpha.value = alpha * 0.72;
    this.outerBeamUniforms.uGrowth.value = growth;

    this.coreBeamUniforms.uColor.value.copy(this._beamColor).lerp(this._audioColor, 0.25).multiplyScalar(1.25);
    this.coreBeamUniforms.uAlpha.value = alpha * 0.95;
    this.coreBeamUniforms.uGrowth.value = growth;

    this.haloUniforms.uColor.value.copy(this._beamColor);
    this.haloUniforms.uAlpha.value = haloAlpha;
  }

  /* ---------------- frame update ---------------- */

  setSize(w, h) {
    this.renderer.setSize(w, h);
  }

  update(dt, camera) {
    if (this.state === 'hidden') return;
    this.t += dt;
    this.beamTime += dt;

    let p = 1;
    let spin = 0;
    let opacity = 1;
    let beamAlpha = 0.36;
    let growth = 1;
    let haloAlpha = 0.42;

    if (this.state === 'rising') {
      if (this.t < 0) {
        const pre = Math.max(0, Math.min(1, (this.t + LAUNCH_DELAY) / LAUNCH_DELAY));
        this.updateSpotlight(pre * 0.48, pre * 0.42, 0);
        return;
      }
      if (!this.launched) {
        this.launched = true;
        this.root.style.display = '';
        this.onLaunch?.();
      }
      const k = Math.min(1, this.t / RISE_TIME);
      p = easeOutCubic(k);
      spin = Math.pow(1 - k, 2.2) * SPIN_TURNS * Math.PI * 2;
      opacity = smoothstep(0, 0.22, k);
      growth = Math.min(1, 0.42 + k * 0.88);
      beamAlpha = lerp(0.48, 0.95, smoothstep(0, 0.35, k)) * (1 - 0.62 * smoothstep(0.55, 1.0, k));
      haloAlpha = smoothstep(0.25, 0.95, k) * 0.42;

      this.object.position.lerpVectors(RISE_FROM, DISC_CENTER, p);
      this.object.scale.setScalar(M_PER_PX * (0.15 + 0.85 * p));
      if (k >= 1) {
        this.state = 'open';
        this.root.classList.add('interactive');
      }
    } else if (this.state === 'sinking') {
      const k = Math.min(1, this.t / SINK_TIME);
      const e = easeInCubic(k);
      spin = -e * 2 * Math.PI * 2;
      opacity = 1 - smoothstep(0.55, 1, k);
      growth = 1.0 - smoothstep(0.25, 1.0, k);
      beamAlpha = lerp(0.36, 0.85, Math.sin(Math.min(1, k * 1.4) * Math.PI)) * (1 - smoothstep(0.65, 1, k));
      haloAlpha = 0.42 * (1 - smoothstep(0, 0.5, k));

      this.object.position.lerpVectors(this.sinkFrom, RISE_FROM, e);
      this.object.scale.setScalar(M_PER_PX * this.sinkScale * (1 - 0.85 * e));
      if (k >= 1) {
        this.state = 'hidden';
        this.root.style.display = 'none';
        this.beamGroup.visible = false;
        const done = this.onClosed;
        this.onClosed = null;
        done?.();
        return;
      }
    } else {
      // Open: soft breathing cradle spotlight behind the vinyl
      this.object.position.copy(DISC_CENTER);
      this.object.scale.setScalar(M_PER_PX);
      const audioPulse = SHARED.uBeat.value * SHARED.uActive.value;
      beamAlpha = 0.36 + 0.04 * Math.sin(this.beamTime * 1.8) + audioPulse * 0.14;
      haloAlpha = 0.42 + audioPulse * 0.18;
      growth = 1.0;
    }

    this.object.rotation.z = -spin;
    this.root.style.opacity = opacity.toFixed(3);

    // Platter spring: slightly under-damped so the disc settles like a real record.
    const stiffness = 60;
    const damping = 2 * Math.sqrt(stiffness) * 0.72;
    this.platterVel += ((this.platterTarget - this.platterAngle) * stiffness - this.platterVel * damping) * dt;
    this.platterAngle += this.platterVel * dt;
    const rounded = Math.round(this.platterAngle * 100) / 100;
    if (rounded !== this.lastPlatter) {
      this.lastPlatter = rounded;
      this.platter.style.transform = `rotate(${rounded}deg)`;
    }

    this.updateSpotlight(beamAlpha, growth, haloAlpha);
    this.renderer.render(this.cssScene, camera);
  }
}
