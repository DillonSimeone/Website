const STORAGE_KEY = 'djwish.settings.v2';
const LEGACY_STORAGE_KEY = 'djwish.settings.v1';

/**
 * Every user-tunable setting, grouped into the sections printed around the settings disc.
 * type: 'range' (min/max/step), 'toggle', or 'select' (options: [[value, label], ...]).
 */
export const SETTINGS_SCHEMA = [
  {
    id: 'audio',
    label: 'AUDIO',
    color: '#00f0ff',
    items: [
      { key: 'gain', label: 'Input gain', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1.35, fmt: 'x' },
      { key: 'demoVolume', label: 'Demo volume', type: 'range', min: 0, max: 1, step: 0.01, def: 0.32, fmt: '%' },
      { key: 'smoothing', label: 'Analyser smoothing', type: 'range', min: 0, max: 0.95, step: 0.01, def: 0.86, fmt: '2' },
      { key: 'response', label: 'Band response', type: 'range', min: 0.05, max: 0.7, step: 0.01, def: 0.22, fmt: '2' },
      { key: 'noiseFloor', label: 'Noise floor', type: 'range', min: 0, max: 0.25, step: 0.005, def: 0.02, fmt: '%' },
      { key: 'beatThreshold', label: 'Beat threshold', type: 'range', min: 0.06, max: 0.4, step: 0.01, def: 0.18, fmt: '2' }
    ]
  },
  {
    id: 'color',
    label: 'COLOUR',
    color: '#ff2a7a',
    items: [
      { key: 'visualMode', label: 'Visual theme', type: 'select', def: 'noir', options: [['noir', 'Cyber Noir'], ['synthwave', 'Synthwave Grid'], ['thermal', 'Thermal'], ['uv_acid', 'UV Acid'], ['monochrome', 'Monochrome'], ['solar', 'Solar Temple'], ['void', 'Abyssal Void']] },
      { key: 'hueShift', label: 'Colour shift', type: 'range', min: 0, max: 360, step: 1, def: 0, fmt: 'deg' },
      { key: 'hueSpan', label: 'Wheel span', type: 'range', min: 0.1, max: 1, step: 0.01, def: 0.78, fmt: 'span' },
      { key: 'hueReverse', label: 'Reverse wheel', type: 'toggle', def: false },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 1, step: 0.01, def: 1, fmt: '%' },
      { key: 'reactiveColor', label: 'Audio colour strength', type: 'range', min: 0, max: 1, step: 0.01, def: 1, fmt: '%' },
      { key: 'punch', label: 'Reactivity punch', type: 'range', min: 0.4, max: 2.5, step: 0.05, def: 1, fmt: 'x' }
    ]
  },
  {
    id: 'light',
    label: 'LIGHT',
    color: '#ffb000',
    items: [
      { key: 'exposure', label: 'Exposure', type: 'range', min: 0.5, max: 2, step: 0.01, def: 1.05, fmt: '2' },
      { key: 'bloomStrength', label: 'Bloom strength', type: 'range', min: 0, max: 1.8, step: 0.02, def: 0.48, fmt: '2' },
      { key: 'bloomRadius', label: 'Bloom radius', type: 'range', min: 0, max: 0.85, step: 0.01, def: 0.34, fmt: '2' },
      { key: 'bloomThreshold', label: 'Bloom threshold', type: 'range', min: 0.65, max: 2.2, step: 0.01, def: 1.18, fmt: '2' },
      { key: 'grain', label: 'Film grain', type: 'range', min: 0, max: 0.1, step: 0.002, def: 0.02, fmt: '%' },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 2, step: 0.01, def: 0.85, fmt: '2' }
    ]
  },
  {
    id: 'pyramid',
    label: 'PYRAMID',
    color: '#ffd36b',
    items: [
      { key: 'fanBrightness', label: 'Laser fan brightness', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'showLogo', label: 'Sky logo', type: 'toggle', def: true },
      { key: 'capGlow', label: 'Capstone glow', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'brickGlow', label: 'Brick glow', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'edgeGlow', label: 'Edge lines', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'searchlightSpeed', label: 'Searchlight speed', type: 'range', min: 0, max: 3, step: 0.05, def: 1, fmt: 'x' }
    ]
  },
  {
    id: 'city',
    label: 'CITY',
    color: '#b04cff',
    items: [
      { key: 'windowGlow', label: 'Window lights', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'vuBuildings', label: 'VU-meter buildings', type: 'toggle', def: true },
      { key: 'buildingMotion', label: 'Stage bldg motion', type: 'range', min: 0, max: 2, step: 0.05, def: 1, fmt: 'x' },
      { key: 'signGlow', label: 'Sign brightness', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'reflections', label: 'Street reflections', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'fogDistance', label: 'Fog distance', type: 'range', min: 300, max: 1600, step: 10, def: 760, fmt: 'm' },
      { key: 'stars', label: 'Stars', type: 'range', min: 0, max: 2, step: 0.01, def: 1, fmt: '%' },
      { key: 'starRain', label: 'Starfall rain', type: 'toggle', def: false }
    ]
  },
  {
    id: 'camera',
    label: 'CAMERA',
    color: '#7dff9a',
    items: [
      { key: 'quality', label: 'Render quality', type: 'select', def: 'auto', options: [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] },
      { key: 'fovOffset', label: 'Field of view', type: 'range', min: -15, max: 20, step: 1, def: 0, fmt: 'fov' },
      { key: 'parallax', label: 'Mouse parallax', type: 'range', min: 0, max: 3, step: 0.05, def: 1, fmt: 'x' },
      { key: 'scrollEase', label: 'Scroll glide speed', type: 'range', min: 1, max: 10, step: 0.1, def: 3.5, fmt: '1' },
      { key: 'autoPilot', label: 'Stage auto-pilot', type: 'toggle', def: false },
      { key: 'autoPilotSpeed', label: 'Auto-pilot speed', type: 'select', def: 'normal', options: [['slow', 'Slow (24s)'], ['normal', 'Normal (12s)'], ['fast', 'Fast (6s)'], ['hyper', 'Hyper (3s)']] },
      { key: 'autoCycleThemes', label: 'Auto-cycle themes', type: 'toggle', def: true },
      { key: 'playIntro', label: 'Play intro on load', type: 'toggle', def: true },
      { key: 'haptics', label: 'Phone haptics', type: 'toggle', def: true },
      { key: 'showFps', label: 'FPS readout', type: 'toggle', def: false }
    ]
  }
];

export const SETTINGS_DEFAULTS = Object.fromEntries(
  SETTINGS_SCHEMA.flatMap(s => s.items.map(i => [i.key, i.def]))
);

export function formatSetting(item, v) {
  switch (item.fmt) {
    case 'x': return `${Number(v).toFixed(2)}x`;
    case '%': return `${Math.round(v * 100)}%`;
    case 'deg': return `${Math.round(v)}°`;
    case 'span': return `${Math.round(v * 360)}°`;
    case 'm': return `${Math.round(v)} m`;
    case 'fov': return `${v > 0 ? '+' : ''}${Math.round(v)}°`;
    case '1': return Number(v).toFixed(1);
    default: return Number(v).toFixed(2);
  }
}

/**
 * SettingsStore - values persisted to localStorage, with change listeners.
 */
export class SettingsStore {
  constructor() {
    this.values = { ...SETTINGS_DEFAULTS };
    this.listeners = new Set();
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      const saved = JSON.parse(rawV2 || localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
      for (const k of Object.keys(saved)) {
        if (k in SETTINGS_DEFAULTS && typeof saved[k] === typeof SETTINGS_DEFAULTS[k]) this.values[k] = saved[k];
      }
      if (!rawV2 && saved.bloomStrength === 0.85 && saved.bloomRadius === 0.5 && saved.bloomThreshold === 1) {
        this.values.bloomStrength = SETTINGS_DEFAULTS.bloomStrength;
        this.values.bloomRadius = SETTINGS_DEFAULTS.bloomRadius;
        this.values.bloomThreshold = SETTINGS_DEFAULTS.bloomThreshold;
        if (saved.exposure === 1.1) this.values.exposure = SETTINGS_DEFAULTS.exposure;
      }
    } catch (_) {
      // Corrupt or blocked storage: run on defaults.
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }

  resetAll() {
    clearTimeout(this.saveTimer);
    for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) {
      if (this.values[k] !== v) {
        this.values[k] = v;
        for (const fn of this.listeners) fn(k, v);
      }
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
      } catch (_) {}
    }, 250);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  /** Calls fn for every current value (initial apply). */
  applyAll(fn) {
    for (const [k, v] of Object.entries(this.values)) fn(k, v);
  }
}
