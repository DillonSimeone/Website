import { DEFAULT_SLOGAN_PHRASES } from "../../00-commonParts/slogan-placements.js";
import { loadPersistedConfig, savePersistedConfig } from "./storage.js";
import { DEFAULT_ROUTING, normalizeRouting } from "./pcb-rules.js";

/**
 * Application state manager for the V6 LED Strip Parametric generator.
 */
export class StateManager {
  constructor() {
    const defaults = {
      ledCount: 10,
      spacing: 9.22, // in mm (auto-calculated)
      pcbX: 108, // in mm (formerly boardWidth)
      pcbY: 10.0, // in mm (formerly boardHeight)
      boardWidth: 108,
      boardHeight: 10.0,
      useMouseBites: false,
      panelRows: 2,
      panelCols: 2,
      sloganPhrases: DEFAULT_SLOGAN_PHRASES,
      sloganCount: 40,
      sloganPlacedCount: 0,
      sloganAttemptedCount: 0,
      showView: "pcb", // "pcb" or "3d" or "schematic"
      circuitJson: null,
      bomCsv: "",
      pnpCsv: "",
      gerberZip: null,
      drcOk: true,
      drcErrors: [],
      drcWarnings: [],
      routing: { ...DEFAULT_ROUTING },
      isCompiling: false,
      isRouted: false,
      error: null
    };

    const loaded = loadPersistedConfig(defaults);
    if (loaded.boardWidth !== undefined && loaded.pcbX === undefined) {
      loaded.pcbX = loaded.boardWidth;
    }
    if (loaded.boardHeight !== undefined && loaded.pcbY === undefined) {
      loaded.pcbY = loaded.boardHeight;
    }

    this.state = {
      ...defaults,
      ...loaded,
      boardWidth: loaded.pcbX ?? defaults.pcbX,
      boardHeight: loaded.pcbY ?? defaults.pcbY,
      routing: normalizeRouting(loaded.routing ?? defaults.routing)
    };
    this.listeners = [];
    this.autoCalculateSpacing();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  updateState(updates) {
    if (updates.routing !== undefined) {
      updates = { ...updates, routing: normalizeRouting(updates.routing) };
    }
    if (updates.pcbX !== undefined) {
      updates.boardWidth = updates.pcbX;
    }
    if (updates.pcbY !== undefined) {
      updates.boardHeight = updates.pcbY;
    }
    this.state = { ...this.state, ...updates };

    // Auto-calculate spacing if width or count changes
    if (updates.pcbX !== undefined || updates.ledCount !== undefined) {
      this.autoCalculateSpacing();
    }

    savePersistedConfig(this.state);
    this.notify();
  }

  autoCalculateSpacing() {
    const activeLength = this.state.pcbX - 25;
    this.state.spacing = Math.max(1.0, activeLength / (this.state.ledCount - 1));
  }
}

export const appState = new StateManager();
