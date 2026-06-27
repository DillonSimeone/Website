import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import { 
  convertSoupToGerberCommands, 
  stringifyGerberCommandLayers,
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill 
} from "../../00-commonParts/circuit-json-to-gerber.js";
import { WS2812B_3535, VerticalThreePadHeader, HorizontalEdgeHeader } from "../../00-commonParts/Led/led.js";

/**
 * Programmatically builds the tscircuit project based on user inputs.
 * Returns the Circuit object.
 * 
 * Layout: J_BEG ─ U1 ─ J_MID1 ─ U2 ─ J_MID2 ─ ... ─ Un ─ J_END
 * 
 * Includes manual via placement to route crossing traces on bottom copper layer,
 * avoiding electrical shorts.
 */
export async function compileCircuit(params) {
  const { ledCount, spacing, boardWidth, boardHeight } = params;
  
  const circuit = new Circuit();
  
  // Calculate starting X coordinate to center LEDs on board
  const activeLength = spacing * (ledCount - 1);
  const startX = -activeLength / 2;
  
  const children = [];
  
  // ============================================================
  // 1. BEGINNING HEADER (vertical pads flush with left edge)
  // ============================================================
  const leftEdgeX = -boardWidth / 2;
  const j_beg_x = leftEdgeX + 1.25; // 2.5mm component width
  children.push(React.createElement(VerticalThreePadHeader, {
    name: "J_BEG", pcbX: `${j_beg_x}mm`, pcbY: "0mm", key: "j_beg", isEnd: false
  }));
  
  // Connect J_BEG → U1
  children.push(React.createElement("trace", { from: ".J_BEG > .pin1", to: ".U1 > .pin1", key: "t_beg_u1_v", name: "t_beg_u1_vcc" }));
  children.push(React.createElement("trace", { from: ".J_BEG > .pin2", to: ".U1 > .pin4", key: "t_beg_u1_d", name: "t_beg_u1_dat" }));
  children.push(React.createElement("trace", { from: ".J_BEG > .pin3", to: ".U1 > .pin3", key: "t_beg_u1_g", name: "t_beg_u1_gnd" }));
  
  // ============================================================
  // 2. LEDs + INTERMEDIATE HEADERS + VIAS FOR BOTTOM LAYER TRANSITIONS
  // ============================================================
  for (let i = 1; i <= ledCount; i++) {
    const ledX = startX + (i - 1) * spacing;
    
    // Place LED
    children.push(React.createElement(WS2812B_3535, {
      name: `U${i}`, pcbX: `${ledX}mm`, pcbY: "0mm", key: `u${i}`
    }));
    
    // Place single intermediate header between LED[i] and LED[i+1]
    if (i < ledCount) {
      const midX = ledX + spacing / 2;
      
      // Place header component
      children.push(React.createElement(HorizontalEdgeHeader, {
        name: `J_MID${i}`, pcbX: `${midX}mm`, pcbY: "0mm", key: `j_mid_${i}`
      }));
      
      // Place Vias to route crossing connections on bottom copper layer
      children.push(React.createElement("via", {
        name: `VIA_D_${i}`, pcbX: `${midX - 1.0}mm`, pcbY: "1.5mm", holeDiameter: "0.3mm", outerDiameter: "0.6mm", key: `via_d_${i}`
      }));
      children.push(React.createElement("via", {
        name: `VIA_G_${i}`, pcbX: `${midX + 1.0}mm`, pcbY: "-1.5mm", holeDiameter: "0.3mm", outerDiameter: "0.6mm", key: `via_g_${i}`
      }));
      
      // --- LED[i] Outputs to Solder Header J_MID[i] ---
      // VCC (top route, all on top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin1`, to: `.J_MID${i} > .pin1`, key: `t_${i}_v_t`, name: `t_${i}_vcc_t` }));
      children.push(React.createElement("trace", { from: `.U${i} > .pin1`, to: `.J_MID${i} > .pin4`, key: `t_${i}_v_b`, name: `t_${i}_vcc_b` })); // routes along bottom of board
      
      // DATA (top DOUT to top DATA pad: straight top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin2`, to: `.J_MID${i} > .pin2`, key: `t_${i}_d_t`, name: `t_${i}_dat_t` }));
      
      // DATA (top DOUT to bottom DATA pad: via transition to bottom layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin2`, to: `.VIA_D_${i}`, key: `t_${i}_d_b1`, name: `t_${i}_dat_b1` }));
      children.push(React.createElement("trace", { from: `.VIA_D_${i}`, to: `.J_MID${i} > .pin5`, key: `t_${i}_d_b2`, name: `t_${i}_dat_b2` }));
      
      // GND (bottom GND to bottom GND pad: straight top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin3`, to: `.J_MID${i} > .pin6`, key: `t_${i}_g_b`, name: `t_${i}_gnd_b` }));
      
      // GND (bottom GND to top GND pad: via transition to bottom layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin3`, to: `.VIA_G_${i}`, key: `t_${i}_g_t1`, name: `t_${i}_gnd_t1` }));
      children.push(React.createElement("trace", { from: `.VIA_G_${i}`, to: `.J_MID${i} > .pin3`, key: `t_${i}_g_t2`, name: `t_${i}_gnd_t2` }));
      
      
      // --- Solder Header J_MID[i] to LED[i+1] Inputs ---
      // VCC (all top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin1`, to: `.U${i + 1} > .pin1`, key: `t_mid_${i}_v_t`, name: `t_mid_${i}_vcc_t` }));
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin4`, to: `.U${i + 1} > .pin1`, key: `t_mid_${i}_v_b`, name: `t_mid_${i}_vcc_b` }));
      
      // DATA (top DATA pad to DIN: straight top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin2`, to: `.U${i + 1} > .pin4`, key: `t_mid_${i}_d_t`, name: `t_mid_${i}_dat_t` }));
      // DATA (bottom DATA pad to DIN: via transition to bottom layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin5`, to: `.VIA_D_${i}`, key: `t_mid_${i}_d_b1`, name: `t_mid_${i}_dat_b1` }));
      
      // GND (bottom GND pad to GND: straight top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin6`, to: `.U${i + 1} > .pin3`, key: `t_mid_${i}_g_b`, name: `t_mid_${i}_gnd_b` }));
      // GND (top GND pad to GND: via transition to bottom layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin3`, to: `.VIA_G_${i}`, key: `t_mid_${i}_g_t1`, name: `t_mid_${i}_gnd_t1` }));
    }
  }
  
  // ============================================================
  // 3. END HEADER (vertical pads flush with right edge)
  // ============================================================
  const rightEdgeX = boardWidth / 2;
  const j_end_x = rightEdgeX - 1.25;
  children.push(React.createElement(VerticalThreePadHeader, {
    name: "J_END", pcbX: `${j_end_x}mm`, pcbY: "0mm", key: "j_end", isEnd: true
  }));
  
  // Last LED → J_END
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin1`, to: ".J_END > .pin1", key: "t_end_v", name: "t_end_vcc" }));
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin2`, to: ".J_END > .pin2", key: "t_end_d", name: "t_end_dat" }));
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin3`, to: ".J_END > .pin3", key: "t_end_g", name: "t_end_gnd" }));
  
  // ============================================================
  // 4. CREATE BOARD
  // ============================================================
  const boardElement = React.createElement("board", {
    width: `${boardWidth}mm`,
    height: `${boardHeight}mm`,
    layers: 2
  }, children);

  circuit.add(boardElement);
  
  // Perform layout compilation and routing
  await circuit.renderUntilSettled();
  
  return circuit;
}

/**
 * High-performance coordinate copy-paste panelizer for circuit JSON.
 * Instantly duplicates a single board's routing layout into a panel grid.
 */
export function panelizeCircuitJson(singleCircuitJson, params) {
  const { boardWidth, boardHeight, panelRows, panelCols } = params;
  const cols = panelCols || 2;
  const rows = panelRows || 2;
  const colGap = 2.0;
  const rowGap = 2.0;
  
  const panelWidth = cols * boardWidth + (cols - 1) * colGap;
  const panelHeight = rows * boardHeight + (rows - 1) * rowGap;
  
  const panelJson = [];
  
  // Remove individual board outlines
  const filteredSingle = singleCircuitJson.filter(e => e.type !== "pcb_board" && e.type !== "source_board");
  
  // Add global panel outline
  panelJson.push({
    type: "pcb_board",
    pcb_board_id: "panel_board",
    width: panelWidth,
    height: panelHeight,
    center: { x: 0, y: 0 }
  });
  panelJson.push({
    type: "source_board",
    source_board_id: "panel_source_board",
    width: panelWidth,
    height: panelHeight
  });
  
  // Duplicate and shift layouts
  for (let r = 0; r < rows; r++) {
    const offsetY = (r - (rows - 1) / 2) * (boardHeight + rowGap);
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * (boardWidth + colGap);
      const prefix = `R${r}_C${c}_`;
      
      filteredSingle.forEach((el) => {
        const clone = JSON.parse(JSON.stringify(el));
        
        // Prefix reference IDs to avoid overlap collisions
        if (clone.pcb_component_id) clone.pcb_component_id = prefix + clone.pcb_component_id;
        if (clone.source_component_id) clone.source_component_id = prefix + clone.source_component_id;
        if (clone.pcb_smtpad_id) clone.pcb_smtpad_id = prefix + clone.pcb_smtpad_id;
        if (clone.pcb_trace_id) clone.pcb_trace_id = prefix + clone.pcb_trace_id;
        if (clone.source_trace_id) clone.source_trace_id = prefix + clone.source_trace_id;
        if (clone.pcb_via_id) clone.pcb_via_id = prefix + clone.pcb_via_id;
        if (clone.pcb_port_id) clone.pcb_port_id = prefix + clone.pcb_port_id;
        if (clone.source_port_id) clone.source_port_id = prefix + clone.source_port_id;
        
        if (clone.name) clone.name = prefix + clone.name;
        
        // Shift absolute coordinate properties
        if (clone.center) {
          clone.center.x += offsetX;
          clone.center.y += offsetY;
        }
        if (clone.x !== undefined) clone.x += offsetX;
        if (clone.y !== undefined) clone.y += offsetY;
        
        if (clone.route) {
          clone.route.forEach((pt) => {
            if (pt.x !== undefined) pt.x += offsetX;
            if (pt.y !== undefined) pt.y += offsetY;
          });
        }
        
        panelJson.push(clone);
      });
    }
  }
  
  // Add mousebite drill vias
  let viaCounter = 0;
  
  // 1. Vertical breakaway tabs
  for (let r = 0; r < rows; r++) {
    const offsetY = (r - (rows - 1) / 2) * (boardHeight + rowGap);
    for (let c = 0; c < cols - 1; c++) {
      const offsetX = (c - (cols - 1) / 2) * (boardWidth + colGap);
      const tabX = offsetX + boardWidth / 2 + colGap / 2;
      
      [offsetY + 3.0, offsetY - 3.0].forEach((tabY, tabIdx) => {
        for (let k = -1.5; k <= 1.5; k += 1.0) {
          panelJson.push({
            type: "pcb_via",
            pcb_via_id: `mb_via_v_${viaCounter++}`,
            x: tabX,
            y: tabY + k * 0.7,
            hole_diameter: 0.5,
            outer_diameter: 0.5
          });
        }
      });
    }
  }
  
  // 2. Horizontal breakaway tabs
  for (let r = 0; r < rows - 1; r++) {
    const offsetY = (r - (rows - 1) / 2) * (boardHeight + rowGap);
    const tabY = offsetY + boardHeight / 2 + rowGap / 2;
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * (boardWidth + colGap);
      
      [offsetX - boardWidth / 3, offsetX, offsetX + boardWidth / 3].forEach((tabX, tabIdx) => {
        for (let k = -1.5; k <= 1.5; k += 1.0) {
          panelJson.push({
            type: "pcb_via",
            pcb_via_id: `mb_via_h_${viaCounter++}`,
            x: tabX + k * 0.7,
            y: tabY,
            hole_diameter: 0.5,
            outer_diameter: 0.5
          });
        }
      });
    }
  }
  
  return panelJson;
}

/**
 * Generates the Bill of Materials (BOM) CSV file content.
 */
export function generateBOM(circuitJson) {
  const components = circuitJson.filter(e => e.type === "pcb_component");
  const sourceComponents = circuitJson.filter(e => e.type === "source_component");
  
  let csv = "Designator,Comment,Footprint,LCSC Part Number,Manufacturer,Part Number\n";
  for (const comp of components) {
    const sourceComp = sourceComponents.find(sc => sc.source_component_id === comp.source_component_id);
    const designator = comp.pcb_component_id || comp.name || "";
    
    if (designator.startsWith("board")) continue;
    
    let comment = "";
    let lcsc = "N/A";
    let mfg = "Generic";
    let partNum = "";
    
    if (designator.startsWith("U")) {
      comment = "RGB LED 3535 (V6 w/ built-in cap)";
      lcsc = "C52941388";
      mfg = "Worldsemi";
      partNum = "WS2812B-3535";
    } else if (designator.startsWith("J")) {
      comment = "Solder Pad Header";
      lcsc = "N/A";
      mfg = "Generic";
      partNum = "SolderPad";
    }
    
    const footprint = designator.startsWith("U") ? "3535" : "PADS";
    
    csv += `"${designator}","${comment}","${footprint}","${lcsc}","${mfg}","${partNum}"\n`;
  }
  return csv;
}

/**
 * Generates the Pick and Place (PNP/Centroid) CSV file content.
 */
export function generatePNP(circuitJson) {
  const components = circuitJson.filter(e => e.type === "pcb_component");
  
  let csv = "Designator,Mid X,Mid Y,Layer,Rotation\n";
  for (const comp of components) {
    const designator = comp.pcb_component_id || comp.name || "";
    if (designator.startsWith("board")) continue;
    
    const x = comp.center?.x || 0;
    const y = comp.center?.y || 0;
    const layer = comp.layer || "top";
    const rotation = comp.rotation || 0;
    
    csv += `"${designator}",${x.toFixed(4)},${y.toFixed(4)},"${layer}",${rotation}\n`;
  }
  return csv;
}

/**
 * Generates the Gerber layer files and drill file outputs.
 */
export function generateGerbers(circuitJson) {
  try {
    const gerberCommands = convertSoupToGerberCommands(circuitJson);
    const gerberLayers = stringifyGerberCommandLayers(gerberCommands);
    
    const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson, is_plated: true });
    const drillString = stringifyExcellonDrill(drillCommands);
    
    return {
      layers: gerberLayers,
      drill: drillString
    };
  } catch (err) {
    console.error("Error generating Gerbers:", err);
    return null;
  }
}
