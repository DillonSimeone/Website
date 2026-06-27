import { DEFAULT_SLOGAN_PHRASES } from "../../00-commonParts/slogan-placements.js";
import { loadPersistedConfig, savePersistedConfig } from "./storage.js";

/**
 * Application state manager for the V6 LED Strip Parametric generator.
 */
export class StateManager {
  constructor() {
    const defaults = {
      ledCount: 10,
      spacing: 15, // in mm
      boardWidth: 160, // in mm (will be auto-updated)
      boardHeight: 12, // in mm
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
      isCompiling: false,
      error: null
    };

    this.state = { ...defaults, ...loadPersistedConfig(defaults) };
    this.listeners = [];
    this.autoCalculateWidth();
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
    this.state = { ...this.state, ...updates };

    // Auto-calculate board width if spacing or count changes
    if (updates.ledCount !== undefined || updates.spacing !== undefined) {
      this.autoCalculateWidth();
    }

    savePersistedConfig(this.state);
    this.notify();
  }

  autoCalculateWidth() {
    const activeLength = this.state.spacing * (this.state.ledCount - 1);
    this.state.boardWidth = Math.max(40, activeLength + 20);
  }
}

export const appState = new StateManager();
