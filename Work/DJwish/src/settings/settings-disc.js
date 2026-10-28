import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { APEX, SHARED, OUTPUT_CHUNK, smoothstep, setAudioColor } from '../three/world.js';
import { SETTINGS_SCHEMA, formatSetting } from './settings-store.js';

// Disc layout in CSS pixels. Each section panel sits on the platter at its own angle;
// the platter spins so the selected panel ends up level at 12 o'clock.
const DISC_PX = 1480;
const PANEL_RADIUS = 520;
const PANEL_W = 420;
const PANEL_H = 350;
const HUB_PX = 400;
const M_PER_PX = 0.05;
const STEP_DEG = 360 / SETTINGS_SCHEMA.length;
const LETTERS = 'ABCDEFGH';

// World placement: floating just above and in front of the capstone, facing the city.
const DISC_CENTER = new THREE.Vector3(APEX.x, APEX.y + 62, APEX.z + 30);
const RISE_FROM = new THREE.Vector3(APEX.x, APEX.y - 2, APEX.z + 4);

const LAUNCH_DELAY = 1.5;   // camera is still flying in
const RISE_TIME = 2.4;
const SINK_TIME = 1.3;
const SPIN_TURNS = 3;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

const BEAM_VERT = /* glsl */ `
varying float vAlong;
void main() {
  vAlong = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vAlong;
void main() {
  float a = uAlpha * (0.35 + 0.65 * vAlong);
  gl_FragColor = vec4(uColor * a, 1.0);
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
 * SettingsDisc - a vinyl record that rises spinning out of the capstone and carries every
 * setting. Real HTML controls rendered with CSS3DRenderer so they share the WebGL camera.
 */
export class SettingsDisc {
  constructor(container, scene) {
    this.state = 'hidden';
    this.t = 0;
    this.active = 0;
    this.platterAngle = 0;
    this.platterTarget = 0;
    this.platterVel = 0;
    this.store = null;
    this.controls = new Map();
    this.onLaunch = null;
    this.onClosed = null;
    this.onRequestClose = null;

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
    // Shortest way round from where the platter currently points.
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
    const top = PANEL_RADIUS + PANEL_H / 2 + 24;
    const bottom = -HUB_PX / 2 - 16;
    const focusY = ((top + bottom) / 2) * M_PER_PX;
    const regionH = (top - bottom) * M_PER_PX;
    const regionW = (PANEL_W + 70) * M_PER_PX;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const d = Math.max(regionH / 2 / tanV, regionW / 2 / tanH);
    outTgt.set(DISC_CENTER.x, DISC_CENTER.y + focusY, DISC_CENTER.z);
    outPos.set(outTgt.x, outTgt.y, outTgt.z + d);
  }

  /* ---------------- WebGL lift beam ---------------- */

  buildBeam(scene) {
    const from = new THREE.Vector3(APEX.x, APEX.y - 2, APEX.z);
    const dir = new THREE.Vector3().subVectors(DISC_CENTER, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(26, 3, len, 24, 1, true);
    this.beamUniforms = { uColor: { value: new THREE.Color(1, 0.6, 1) }, uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.beam = new THREE.Mesh(geo, mat);
    this.beam.position.copy(from).addScaledVector(dir, 0.5);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.beam.visible = false;
    this.beam.renderOrder = 9;
    this.beam.frustumCulled = false;
    scene.add(this.beam);
  }

  /* ---------------- frame update ---------------- */

  setSize(w, h) {
    this.renderer.setSize(w, h);
  }

  update(dt, camera) {
    if (this.state === 'hidden') return;
    this.t += dt;

    let p = 1;
    let spin = 0;
    let opacity = 1;
    let beam = 0;

    if (this.state === 'rising') {
      if (this.t < 0) return;
      if (!this.launched) {
        this.launched = true;
        this.root.style.display = '';
        this.onLaunch?.();
      }
      const k = Math.min(1, this.t / RISE_TIME);
      p = easeOutCubic(k);
      spin = Math.pow(1 - k, 2.2) * SPIN_TURNS * Math.PI * 2;
      opacity = smoothstep(0, 0.22, k);
      beam = Math.sin(Math.min(1, k * 1.15) * Math.PI);
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
      opacity = 1 - smoothstep(0.6, 1, k);
      beam = Math.sin(k * Math.PI) * 0.8;
      this.object.position.lerpVectors(this.sinkFrom, RISE_FROM, e);
      this.object.scale.setScalar(M_PER_PX * this.sinkScale * (1 - 0.85 * e));
      if (k >= 1) {
        this.state = 'hidden';
        this.root.style.display = 'none';
        this.beam.visible = false;
        const done = this.onClosed;
        this.onClosed = null;
        done?.();
        return;
      }
    } else {
      this.object.position.copy(DISC_CENTER);
      this.object.scale.setScalar(M_PER_PX);
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

    this.beam.visible = beam > 0.01;
    if (this.beam.visible) {
      setAudioColor(this.beamUniforms.uColor.value, SHARED.uHue.value, 0.65).multiplyScalar(1.4);
      this.beamUniforms.uAlpha.value = beam;
    }

    this.renderer.render(this.cssScene, camera);
  }
}
