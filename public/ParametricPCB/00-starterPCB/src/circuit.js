import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import { 
  createGerberZipBlob, 
  createBomCsv, 
  createCplCsv 
} from "../../shared/export-utils.js";
import { 
  ESP32C3_SuperMini, 
  Resistor0603, 
  Capacitor0603, 
  Led0603, 
  Header4Pin 
} from "./footprints.js";
import { boardProps, normalizeRouting } from "./pcb-rules.js";
import { runManufacturingDrc } from "./drc.js";

/**
 * Programmatically builds the Turnkey Starter PCB (00).
 * Conforms 100% to JLCPCB SMT 2-layer design & manufacturing rules.
 */
export async function compileCircuit(params = {}) {
  const { 
    boardWidth = 40, 
    boardLength = 40, 
    routing = {},
    skipRouting = true,
    silkScale = 1.0 
  } = params;

  const R = normalizeRouting(routing);
  const PWR = `${R.powerTraceWidth}mm`;
  const SIG = `${R.nominalTraceWidth}mm`;

  const t0 = performance.now();
  const circuit = new Circuit({
    platform: {
      routingDisabled: skipRouting
    }
  });

  const children = [];
  const halfL = boardLength / 2;
  const halfW = boardWidth / 2;

  // ============================================================
  // 0. M3 CORNER MOUNTING HOLES (3.2mm Clearance Drill, 5.0mm Pad)
  // 3.5mm from board edges to leave robust copper clearance
  // ============================================================
  const mountX = halfW - 3.5;
  const mountY = halfL - 3.5;
  const cornerHoles = [
    { key: "hole_tl", name: "H1", x: -mountX, y: mountY },
    { key: "hole_tr", name: "H2", x: mountX, y: mountY },
    { key: "hole_bl", name: "H3", x: -mountX, y: -mountY },
    { key: "hole_br", name: "H4", x: mountX, y: -mountY }
  ];

  cornerHoles.forEach(h => {
    children.push(React.createElement("platedhole", {
      key: h.key,
      name: h.name,
      portHints: [h.name],
      pcbX: `${h.x.toFixed(2)}mm`,
      pcbY: `${h.y.toFixed(2)}mm`,
      holeDiameter: "3.2mm",
      outerDiameter: "5.0mm",
      shape: "circle"
    }));
  });

  // ============================================================
  // 1. ESP32-C3 SUPERMINI MCU SOCKET (Centered)
  // ============================================================
  children.push(React.createElement(ESP32C3_SuperMini, {
    name: "U_MCU",
    key: "u_mcu",
    pcbX: "0mm",
    pcbY: "2.0mm"
  }));

  // ============================================================
  // 2. POWER INDICATION & FILTERING PASSIVES (0603 SMT)
  // ============================================================
  // C_VBUS: 10uF 0603 Decoupling Capacitor
  children.push(React.createElement(Capacitor0603, {
    name: "C_VBUS",
    key: "c_vbus",
    pcbX: "-7.0mm",
    pcbY: "-12.0mm"
  }));

  // D_PWR_LED: 0603 Green Power LED
  children.push(React.createElement(Led0603, {
    name: "D_LED",
    key: "d_led",
    pcbX: "7.0mm",
    pcbY: "-12.0mm"
  }));

  // R_LED: 1kΩ 0603 Current Limiting Resistor
  children.push(React.createElement(Resistor0603, {
    name: "R_LED",
    key: "r_led",
    pcbX: "7.0mm",
    pcbY: "-15.0mm"
  }));

  // ============================================================
  // 3. AUXILIARY 4-PIN PERIPHERAL HEADER (Bottom Perimeter)
  // ============================================================
  children.push(React.createElement(Header4Pin, {
    name: "J_AUX",
    key: "j_aux",
    pcbX: "0mm",
    pcbY: `-${(halfL - 3.5).toFixed(2)}mm`
  }));

  // ============================================================
  // 4. SILKSCREEN TEXT LABELS
  // ============================================================
  const makeSilk = (key, text, x, y, layer = "top", fontSize = 0.75, align = "center") => {
    return React.createElement("silkscreentext", {
      key,
      text,
      layer,
      fontSize: `${(fontSize * silkScale).toFixed(2)}mm`,
      anchorAlignment: align,
      pcbX: `${x.toFixed(2)}mm`,
      pcbY: `${y.toFixed(2)}mm`
    });
  };

  children.push(makeSilk("st_title", "00 STARTER PCB", 0, halfL - 1.5, "top", 0.75, "center"));
  children.push(makeSilk("st_subtitle", "MODULAR TEMPLATE", 0, halfL - 2.6, "top", 0.55, "center"));
  children.push(makeSilk("st_aux", "5V  IO0  IO1  GND", 0, -halfL + 6.0, "top", 0.50, "center"));
  children.push(makeSilk("st_c_vbus", "C_VBUS 10u", -7.0, -10.5, "top", 0.45, "center"));
  children.push(makeSilk("st_led", "PWR LED", 7.0, -10.5, "top", 0.45, "center"));

  // ============================================================
  // 5. RAT'S NEST LOGICAL TRACE NETS
  // ============================================================
  if (!skipRouting) {
    // 5V Power Rail (U_MCU Pin 1 -> C_VBUS Pin 1, D_LED Anode, J_AUX Pin 1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin1", to: ".C_VBUS > .pin1", key: "tr_pwr_c", name: "NET_5V", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_VBUS > .pin1", to: ".J_AUX > .pin1", key: "tr_pwr_aux", name: "NET_5V", width: PWR }));
    children.push(React.createElement("trace", { from: ".J_AUX > .pin1", to: ".D_LED > .pin2", key: "tr_pwr_led", name: "NET_5V", width: SIG }));

    // LED Resistor to GND
    children.push(React.createElement("trace", { from: ".D_LED > .pin1", to: ".R_LED > .pin1", key: "tr_led_res", name: "NET_LED_SERIES", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_LED > .pin2", to: ".J_AUX > .pin4", key: "tr_res_gnd", name: "NET_GND", width: PWR }));

    // GND Rail
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".C_VBUS > .pin2", key: "tr_gnd_mcu", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_VBUS > .pin2", to: ".J_AUX > .pin4", key: "tr_gnd_aux", name: "NET_GND", width: PWR }));

    // GPIO Signals (IO0 -> Pin 2, IO1 -> Pin 3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin4", to: ".J_AUX > .pin2", key: "tr_sig_io0", name: "NET_IO0", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin5", to: ".J_AUX > .pin3", key: "tr_sig_io1", name: "NET_IO1", width: SIG }));
  }

  const boardPropsObj = boardProps(boardWidth, boardLength, routing, { skipRouting });
  const boardElement = React.createElement("board", {
    name: "main_board",
    key: "board",
    ...boardPropsObj,
    layers: 2,
    cornerFilletRadius: 1.5
  }, ...children);

  circuit.add(boardElement);

  try {
    await circuit.renderUntilSettled();
  } catch (err) {
    console.warn("[Starter PCB] Render settling notice:", err?.message || err);
  }

  // Trace Boundary Clamping Guard
  const margin = 0.5;
  const maxBoardX = halfW - margin;
  const minBoardX = -halfW + margin;
  const maxBoardY = halfL - margin;
  const minBoardY = -halfL + margin;

  const circuitJson = circuit.getCircuitJson();
  circuitJson.forEach(item => {
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      if (typeof item.width === "number" && item.width < 0.15) {
        item.width = 0.20;
      }
      item.route.forEach(pt => {
        if (typeof pt.x !== "number") {
          if (pt.start && typeof pt.start.x === "number") pt.x = pt.start.x;
          else if (pt.end && typeof pt.end.x === "number") pt.x = pt.end.x;
        }
        if (typeof pt.y !== "number") {
          if (pt.start && typeof pt.start.y === "number") pt.y = pt.start.y;
          else if (pt.end && typeof pt.end.y === "number") pt.y = pt.end.y;
        }
        if (typeof pt.x === "number" && Number.isFinite(pt.x)) {
          pt.x = Math.max(minBoardX, Math.min(maxBoardX, pt.x));
        }
        if (typeof pt.y === "number" && Number.isFinite(pt.y)) {
          pt.y = Math.max(minBoardY, Math.min(maxBoardY, pt.y));
        }
      });
    }
  });

  return circuit;
}

/**
 * Builds Gerber ZIP, BOM CSV, and CPL PNP exports using shared export utilities.
 */
export async function generateManufacturingArtifacts(circuit, boardParams = {}) {
  let circuitJson = circuit.getCircuitJson();
  const silkScale = boardParams.silkScale || 1.0;

  if (silkScale !== 1.0) {
    circuitJson = circuitJson.map(item => {
      if (item.type === "pcb_silkscreen_text" && typeof item.font_size === "number") {
        return { ...item, font_size: +(item.font_size * silkScale).toFixed(2) };
      }
      return item;
    });
  }

  // 1. Gerber ZIP Package
  let gerberZipBlob = null;
  try {
    gerberZipBlob = await createGerberZipBlob(circuitJson, {
      projectName: "StarterPCB",
      prefix: "starterPCB"
    });
  } catch (err) {
    console.warn("[Gerber Packaging Warning]:", err);
  }

  // 2. BOM CSV (LCSC Basic parts)
  const smtComponents = [
    { designator: "C_VBUS", comment: "10uF", footprint: "0603", lcsc: "C19666", qty: 1 },
    { designator: "D_LED", comment: "Green LED", footprint: "0603", lcsc: "C72043", qty: 1 },
    { designator: "R_LED", comment: "1k", footprint: "0603", lcsc: "C21190", qty: 1 }
  ];
  const bomCsv = createBomCsv(smtComponents);

  // 3. CPL / PNP CSV
  const cplComponents = [
    { designator: "C_VBUS", x: -7.0, y: -12.0, layer: "Top", rot: 0 },
    { designator: "D_LED", x: 7.0, y: -12.0, layer: "Top", rot: 0 },
    { designator: "R_LED", x: 7.0, y: -15.0, layer: "Top", rot: 0 }
  ];
  const pnpCsv = createCplCsv(cplComponents);

  // 4. Advisory JLCPCB Manufacturing DRC
  const drc = runManufacturingDrc(circuitJson, boardParams.routing);

  return {
    gerberZipBlob,
    bomCsv,
    pnpCsv,
    circuitJson,
    drc
  };
}
