const STORAGE_KEY = "v6-led-strip-config";

const PERSISTED_KEYS = [
  "ledCount",
  "spacing",
  "useMouseBites",
  "panelRows",
  "panelCols",
  "sloganPhrases",
  "sloganCount",
  "showView",
  "routing"
];

export function loadPersistedConfig(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const loaded = {};
    for (const key of PERSISTED_KEYS) {
      if (parsed[key] !== undefined) loaded[key] = parsed[key];
    }
    if (loaded.routing && typeof loaded.routing === "object") {
      loaded.routing = { ...defaults.routing, ...loaded.routing };
    }
    return loaded;
  } catch {
    return {};
  }
}

export function savePersistedConfig(state) {
  try {
    const payload = {};
    for (const key of PERSISTED_KEYS) {
      payload[key] = state[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private mode errors
  }
}
