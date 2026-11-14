/**
 * Parametric PCB Suite - Universal JLCPCB 2-Layer Design Rules
 * Defines manufacturing tolerances, clearance limits, and autorouting defaults (1 oz copper).
 * @see https://jlcpcb.com/capabilities/pcb-capabilities
 */
export const DEFAULT_ROUTING = {
  minTraceWidth: 0.15,
  nominalTraceWidth: 0.25,
  powerTraceWidth: 0.35,
  viaHoleDiameter: 0.20,
  viaPadDiameter: 0.45,
  traceToPadClearance: 0.15,
  traceToViaClearance: 0.15,
  viaToViaClearance: 0.25
};

export const ROUTING_PARAM_DEFS = [
  { key: "minTraceWidth", label: "Min trace width", unit: "mm", min: 0.1, max: 0.5, step: 0.01, group: "board" },
  { key: "nominalTraceWidth", label: "Signal trace width", unit: "mm", min: 0.1, max: 0.6, step: 0.01, group: "board" },
  { key: "powerTraceWidth", label: "Power trace width", unit: "mm", min: 0.15, max: 0.8, step: 0.01, group: "board" },
  { key: "viaHoleDiameter", label: "Via hole diameter", unit: "mm", min: 0.2, max: 0.5, step: 0.01, group: "board" },
  { key: "viaPadDiameter", label: "Via pad diameter", unit: "mm", min: 0.4, max: 1.0, step: 0.01, group: "board" },
  { key: "traceToPadClearance", label: "Trace-to-pad clearance", unit: "mm", min: 0.1, max: 0.3, step: 0.01, group: "board" },
  { key: "traceToViaClearance", label: "Trace-to-via clearance", unit: "mm", min: 0.1, max: 0.3, step: 0.01, group: "board" },
  { key: "viaToViaClearance", label: "Via-to-via clearance", unit: "mm", min: 0.15, max: 0.5, step: 0.01, group: "board" }
];

export const BOARD_RULE_PARAM_DEFS = ROUTING_PARAM_DEFS.filter((d) => d.group === "board");

export function normalizeRouting(input) {
  const o = {};
  for (const def of ROUTING_PARAM_DEFS) {
    const v = input?.[def.key];
    const n = typeof v === "number" && !Number.isNaN(v) ? v : parseFloat(v);
    o[def.key] = Number.isFinite(n) ? n : DEFAULT_ROUTING[def.key];
  }
  return o;
}

export function boardProps(widthMm, lengthMm, routingParams = {}, options = {}) {
  const r = normalizeRouting(routingParams);
  const skip = Boolean(options.skipRouting);
  const base = {
    width: `${widthMm}mm`,
    height: `${lengthMm}mm`
  };
  if (skip) return base;
  return {
    ...base,
    minTraceWidth: `${r.minTraceWidth}mm`,
    traceWidth: `${r.nominalTraceWidth}mm`,
    minViaHoleDiameter: `${r.viaHoleDiameter}mm`,
    minViaPadDiameter: `${r.viaPadDiameter}mm`
  };
}
