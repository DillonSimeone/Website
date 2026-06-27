import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import { 
  convertSoupToGerberCommands, 
  stringifyGerberCommandLayers,
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill 
} from "../../00-commonParts/circuit-json-to-gerber.js";
import { WS2812B_3535, VerticalThreePadHeader, HorizontalEdgeHeader } from "../../00-commonParts/Led/led.js";

function BoardLabel({ name, text, pcbX, pcbY, pcbRotation = 0, fontSize = 0.5 }) {
  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    footprint: React.createElement("footprint", null,
      React.createElement("silkscreentext", {
        text: text,
        pcbX: "0mm",
        pcbY: "0mm",
        fontSize: `${fontSize}mm`
      })
    )
  });
}

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
  const j_beg_x = leftEdgeX + 1.0; // 2.0mm pad width, left edge flush with board boundary
  children.push(React.createElement(VerticalThreePadHeader, {
    name: "J_BEG", pcbX: `${j_beg_x}mm`, pcbY: "0mm", key: "j_beg", isEnd: false
  }));
  
  // Connect J_BEG → U1
  children.push(React.createElement("trace", { from: ".J_BEG > .pin1", to: ".U1 > .pin1", key: "t_beg_u1_v", name: "t_beg_u1_vcc" }));
  children.push(React.createElement("trace", { from: ".J_BEG > .pin2", to: ".U1 > .pin4", key: "t_beg_u1_d", name: "t_beg_u1_dat" }));
  children.push(React.createElement("trace", { from: ".J_BEG > .pin3", to: ".U1 > .pin3", key: "t_beg_u1_g", name: "t_beg_u1_gnd" }));
  
  // Silkscreen text next to J_BEG pads
  children.push(React.createElement(BoardLabel, { name: "LABEL_BEG_V5", text: "V5", pcbX: `${j_beg_x + 2.4}mm`, pcbY: "3.5mm", fontSize: 0.6, key: "j_beg_v5_txt" }));
  children.push(React.createElement(BoardLabel, { name: "LABEL_BEG_DATA", text: "DATA", pcbX: `${j_beg_x + 2.4}mm`, pcbY: "0mm", fontSize: 0.6, key: "j_beg_data_txt" }));
  children.push(React.createElement(BoardLabel, { name: "LABEL_BEG_GND", text: "GND", pcbX: `${j_beg_x + 2.4}mm`, pcbY: "-3.5mm", fontSize: 0.6, key: "j_beg_gnd_txt" }));
  
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
      
      // Top 3 Pads labels
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_V5_T`, text: "V5", pcbX: `${midX - 1.0}mm`, pcbY: "3.8mm", pcbRotation: 90, key: `jmid_${i}_v5_t_txt` }));
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_DATA_T`, text: "DATA", pcbX: `${midX}mm`, pcbY: "3.8mm", pcbRotation: 90, key: `jmid_${i}_data_t_txt` }));
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_GND_T`, text: "GND", pcbX: `${midX + 1.0}mm`, pcbY: "3.8mm", pcbRotation: 90, key: `jmid_${i}_gnd_t_txt` }));
      
      // Bottom 3 Pads labels
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_V5_B`, text: "V5", pcbX: `${midX - 1.0}mm`, pcbY: "-3.8mm", pcbRotation: 90, key: `jmid_${i}_v5_b_txt` }));
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_DATA_B`, text: "DATA", pcbX: `${midX}mm`, pcbY: "-3.8mm", pcbRotation: 90, key: `jmid_${i}_data_b_txt` }));
      children.push(React.createElement(BoardLabel, { name: `LABEL_MID_${i}_GND_B`, text: "GND", pcbX: `${midX + 1.0}mm`, pcbY: "-3.8mm", pcbRotation: 90, key: `jmid_${i}_gnd_b_txt` }));
      
      // --- LED[i] Outputs to Solder Header J_MID[i] ---
      // VCC (top route, all on top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin1`, to: `.J_MID${i} > .pin1`, key: `t_${i}_v_t`, name: `t_${i}_vcc_t` }));
      children.push(React.createElement("trace", { from: `.U${i} > .pin1`, to: `.J_MID${i} > .pin4`, key: `t_${i}_v_b`, name: `t_${i}_vcc_b` })); // routes along bottom of board
      
      // DATA (top DOUT to top DATA pad: straight top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin2`, to: `.J_MID${i} > .pin2`, key: `t_${i}_d_t`, name: `t_${i}_dat_t` }));
      
      // DATA (top DOUT to bottom DATA pad: autorouter handles layer transition)
      children.push(React.createElement("trace", { from: `.U${i} > .pin2`, to: `.J_MID${i} > .pin5`, key: `t_${i}_d_b`, name: `t_${i}_dat_b` }));
      
      // GND (bottom GND to bottom GND pad: straight top layer)
      children.push(React.createElement("trace", { from: `.U${i} > .pin3`, to: `.J_MID${i} > .pin6`, key: `t_${i}_g_b`, name: `t_${i}_gnd_b` }));
      
      // GND (bottom GND to top GND pad: autorouter handles layer transition)
      children.push(React.createElement("trace", { from: `.U${i} > .pin3`, to: `.J_MID${i} > .pin3`, key: `t_${i}_g_t`, name: `t_${i}_gnd_t` }));
      
      
      // --- Solder Header J_MID[i] to LED[i+1] Inputs ---
      // VCC (all top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin1`, to: `.U${i + 1} > .pin1`, key: `t_mid_${i}_v_t`, name: `t_mid_${i}_vcc_t` }));
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin4`, to: `.U${i + 1} > .pin1`, key: `t_mid_${i}_v_b`, name: `t_mid_${i}_vcc_b` }));
      
      // DATA (top DATA pad to DIN: straight top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin2`, to: `.U${i + 1} > .pin4`, key: `t_mid_${i}_d_t`, name: `t_mid_${i}_dat_t` }));
      // DATA (bottom DATA pad to DIN: autorouter handles layer transition)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin5`, to: `.U${i + 1} > .pin4`, key: `t_mid_${i}_d_b`, name: `t_mid_${i}_dat_b` }));
      
      // GND (bottom GND pad to GND: straight top layer)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin6`, to: `.U${i + 1} > .pin3`, key: `t_mid_${i}_g_b`, name: `t_mid_${i}_gnd_b` }));
      // GND (top GND pad to GND: autorouter handles layer transition)
      children.push(React.createElement("trace", { from: `.J_MID${i} > .pin3`, to: `.U${i + 1} > .pin3`, key: `t_mid_${i}_g_t`, name: `t_mid_${i}_gnd_t` }));
    }
  }
  
  // ============================================================
  // 3. END HEADER (vertical pads flush with right edge)
  // ============================================================
  const rightEdgeX = boardWidth / 2;
  const j_end_x = rightEdgeX - 1.0; // 2.0mm pad width, right edge flush with board boundary
  children.push(React.createElement(VerticalThreePadHeader, {
    name: "J_END", pcbX: `${j_end_x}mm`, pcbY: "0mm", key: "j_end", isEnd: true
  }));
  
  // Last LED → J_END
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin1`, to: ".J_END > .pin1", key: "t_end_v", name: "t_end_vcc" }));
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin2`, to: ".J_END > .pin2", key: "t_end_d", name: "t_end_dat" }));
  children.push(React.createElement("trace", { from: `.U${ledCount} > .pin3`, to: ".J_END > .pin3", key: "t_end_g", name: "t_end_gnd" }));
  
  // Silkscreen text next to J_END pads
  children.push(React.createElement(BoardLabel, { name: "LABEL_END_V5", text: "V5", pcbX: `${j_end_x - 2.4}mm`, pcbY: "3.5mm", fontSize: 0.6, key: "j_end_v5_txt" }));
  children.push(React.createElement(BoardLabel, { name: "LABEL_END_DATA", text: "DATA", pcbX: `${j_end_x - 2.4}mm`, pcbY: "0mm", fontSize: 0.6, key: "j_end_data_txt" }));
  children.push(React.createElement(BoardLabel, { name: "LABEL_END_GND", text: "GND", pcbX: `${j_end_x - 2.4}mm`, pcbY: "-3.5mm", fontSize: 0.6, key: "j_end_gnd_txt" }));
  
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

  // Copy resolved coordinate transformations from parent components to silkscreen text elements
  const soup = circuit.getCircuitJson();
  const comps = soup.filter(e => e.type === "pcb_component");
  soup.forEach(el => {
    if (el.type === "pcb_silkscreen_text" && el.pcb_component_id) {
      const comp = comps.find(c => c.pcb_component_id === el.pcb_component_id);
      if (comp && comp.center) {
        // Apply relative offset and component rotation
        const localX = el.x || 0;
        const localY = el.y || 0;
        const rad = (comp.rotation || 0) * Math.PI / 180;
        
        const rotatedX = localX * Math.cos(rad) - localY * Math.sin(rad);
        const rotatedY = localX * Math.sin(rad) + localY * Math.cos(rad);
        
        el.x = comp.center.x + rotatedX;
        el.y = comp.center.y + rotatedY;
        el.center = { x: el.x, y: el.y };
        if (comp.rotation !== undefined) {
          el.rotation = (el.rotation || 0) + comp.rotation;
        }
      }
    }
  });
  
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
        if (clone.pcb_silkscreen_text_id) clone.pcb_silkscreen_text_id = prefix + clone.pcb_silkscreen_text_id;
        if (clone.source_silkscreen_text_id) clone.source_silkscreen_text_id = prefix + clone.source_silkscreen_text_id;
        
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
    const designator = sourceComp?.name || comp.pcb_component_id || "";
    
    if (designator.startsWith("board") || designator.startsWith("panel_board") || designator.startsWith("LABEL") || designator.startsWith("SLOGAN")) continue;
    
    const baseDesignator = designator.replace(/^R\d+_C\d+_/, "");
    
    let comment = "";
    let lcsc = "N/A";
    let mfg = "Generic";
    let partNum = "";
    
    if (baseDesignator.startsWith("U")) {
      comment = "RGB LED 3535 WS2812B";
      lcsc = "C52941388";
      mfg = "Worldsemi";
      partNum = "WS2812B-3535";
    } else if (baseDesignator.startsWith("J")) {
      comment = "Solder Pad Header";
      lcsc = "N/A";
      mfg = "Generic";
      partNum = "SolderPad";
    }
    
    const footprint = baseDesignator.startsWith("U") ? "3535" : "PADS";
    
    csv += `"${designator}","${comment}","${footprint}","${lcsc}","${mfg}","${partNum}"\n`;
  }
  return csv;
}

/**
 * Generates the Pick and Place (PNP/Centroid) CSV file content.
 */
export function generatePNP(circuitJson) {
  const components = circuitJson.filter(e => e.type === "pcb_component");
  const sourceComponents = circuitJson.filter(e => e.type === "source_component");
  
  let csv = "Designator,Mid X,Mid Y,Layer,Rotation\n";
  for (const comp of components) {
    const sourceComp = sourceComponents.find(sc => sc.source_component_id === comp.source_component_id);
    const designator = sourceComp?.name || comp.pcb_component_id || "";
    
    if (designator.startsWith("board") || designator.startsWith("panel_board") || designator.startsWith("LABEL") || designator.startsWith("SLOGAN")) continue;
    
    const x = comp.center?.x || 0;
    const y = comp.center?.y || 0;
    const layer = comp.layer || "top";
    const rotation = comp.rotation || 0;
    
    csv += `"${designator}",${x.toFixed(4)},${y.toFixed(4)},"${layer}",${rotation}\n`;
  }
  return csv;
}

/**
 * Ensure silkscreen entries have fields required by circuit-json-to-gerber.
 */
export function prepareCircuitJsonForExport(circuitJson) {
  return circuitJson.map((el) => {
    if (el.type !== "pcb_silkscreen_text") return el;

    const x = el.center?.x ?? el.x ?? 0;
    const y = el.center?.y ?? el.y ?? 0;

    return {
      ...el,
      x,
      y,
      center: { x, y },
      anchor_position: el.anchor_position ?? { x, y },
      anchor_alignment: el.anchor_alignment ?? "center",
      ccw_rotation: el.ccw_rotation ?? el.rotation ?? 0,
      font: el.font ?? "tscircuit2024",
      font_size: el.font_size ?? 0.6,
      layer: el.layer ?? "top"
    };
  });
}

/**
 * Generates the Gerber layer files and drill file outputs.
 */
export function generateGerbers(circuitJson) {
  try {
    const prepared = prepareCircuitJsonForExport(circuitJson);
    const gerberCommands = convertSoupToGerberCommands(prepared);
    const gerberLayers = stringifyGerberCommandLayers(gerberCommands);
    
    const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson: prepared, is_plated: true });
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
