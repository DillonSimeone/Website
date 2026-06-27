/**
 * JLCPCB 2-layer standard capabilities (1 oz copper).
 * @see https://jlcpcb.com/capabilities/pcb-capabilities
 */
export const DEFAULT_ROUTING = {
  minTraceWidth: 0.15,
  nominalTraceWidth: 0.25,
  powerTraceWidth: 0.30,
  viaHoleDiameter: 0.30,
  viaPadDiameter: 0.60,
  traceToPadClearance: 0.15,
  traceToViaClearance: 0.15,
  viaToViaClearance: 0.25,
  vccTopBusY: 4.0,
  dataTopBusY: 2.5,
  vccBottomBusY: -2.5,
  gndBottomBusY: -4.0,
  viaLaneOffsetX: 2.8,
  viaLaneTopY: 3.2,
  viaLaneBottomY: -3.2
};

/** @deprecated Use DEFAULT_ROUTING */
export const JLCPCB_2L = DEFAULT_ROUTING;

export const ROUTING_PARAM_DEFS = [
  { key: "minTraceWidth", label: "Min trace width", unit: "mm", min: 0.1, max: 0.5, step: 0.01, group: "board" },
  { key: "nominalTraceWidth", label: "Signal trace width", unit: "mm", min: 0.1, max: 0.6, step: 0.01, group: "board" },
  { key: "powerTraceWidth", label: "Power trace width", unit: "mm", min: 0.15, max: 0.8, step: 0.01, group: "board" },
  { key: "viaHoleDiameter", label: "Via hole diameter", unit: "mm", min: 0.2, max: 0.5, step: 0.01, group: "board" },
  { key: "viaPadDiameter", label: "Via pad diameter", unit: "mm", min: 0.4, max: 1.0, step: 0.01, group: "board" },
  { key: "traceToPadClearance", label: "Trace-to-pad clearance", unit: "mm", min: 0.1, max: 0.3, step: 0.01, group: "board" },
  { key: "traceToViaClearance", label: "Trace-to-via clearance", unit: "mm", min: 0.1, max: 0.3, step: 0.01, group: "board" },
  { key: "viaToViaClearance", label: "Via-to-via clearance", unit: "mm", min: 0.15, max: 0.5, step: 0.01, group: "board" },
  { key: "vccTopBusY", label: "VCC top bus Y", unit: "mm", min: 2.0, max: 5.5, step: 0.1, group: "layout" },
  { key: "dataTopBusY", label: "DATA top bus Y", unit: "mm", min: 1.0, max: 4.0, step: 0.1, group: "layout" },
  { key: "vccBottomBusY", label: "VCC bottom bus Y", unit: "mm", min: -4.0, max: -1.0, step: 0.1, group: "layout" },
  { key: "gndBottomBusY", label: "GND bottom bus Y", unit: "mm", min: -5.5, max: -2.0, step: 0.1, group: "layout" },
  { key: "viaLaneOffsetX", label: "Via lane offset X", unit: "mm", min: 1.5, max: 5.0, step: 0.1, group: "layout" },
  { key: "viaLaneTopY", label: "Via lane top Y", unit: "mm", min: 2.0, max: 4.5, step: 0.1, group: "layout" },
  { key: "viaLaneBottomY", label: "Via lane bottom Y", unit: "mm", min: -4.5, max: -2.0, step: 0.1, group: "layout" }
];

/** Applied to tscircuit board + trace elements when you Update Routing. */
export const BOARD_RULE_PARAM_DEFS = ROUTING_PARAM_DEFS.filter((d) => d.group === "board");

/** Width/via fields passed into tscircuit (autorouter). */
export const TSCIRCUIT_BOARD_PARAM_DEFS = BOARD_RULE_PARAM_DEFS.filter(
  (d) => !["traceToPadClearance", "traceToViaClearance", "viaToViaClearance"].includes(d.key)
);

/** Used only by the advisory manufacturing DRC panel (not the autorouter). */
export const DRC_CHECK_PARAM_DEFS = ROUTING_PARAM_DEFS.filter((d) =>
  ["traceToPadClearance", "traceToViaClearance", "viaToViaClearance"].includes(d.key)
);

/** @deprecated alias */
export const ACTIVE_ROUTING_PARAM_DEFS = BOARD_RULE_PARAM_DEFS;

export function normalizeRouting(input) {
  const out = { ...DEFAULT_ROUTING };
  if (!input || typeof input !== "object") return out;
  for (const def of ROUTING_PARAM_DEFS) {
    const v = Number(input[def.key]);
    if (Number.isFinite(v)) out[def.key] = v;
  }
  return out;
}

/** Parse draft UI strings into a clamped routing object. */
export function parseRoutingInputs(raw) {
  const parsed = {};
  for (const def of ROUTING_PARAM_DEFS) {
    const v = parseFloat(raw?.[def.key]);
    parsed[def.key] = Number.isFinite(v) ? v : DEFAULT_ROUTING[def.key];
  }
  return normalizeRouting(parsed);
}

export function routingInputsFromState(routing) {
  const r = normalizeRouting(routing);
  const out = {};
  for (const def of ROUTING_PARAM_DEFS) {
    out[def.key] = String(r[def.key]);
  }
  return out;
}

export function boardProps(width, height, routing) {
  const r = normalizeRouting(routing);
  return {
    width: `${width}mm`,
    height: `${height}mm`,
    layers: 2,
    defaultTraceWidth: `${r.nominalTraceWidth}mm`,
    minTraceWidth: `${r.minTraceWidth}mm`,
    minViaHoleDiameter: `${r.viaHoleDiameter}mm`,
    minViaPadDiameter: `${r.viaPadDiameter}mm`
  };
}
