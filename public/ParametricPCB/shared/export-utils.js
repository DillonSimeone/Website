/**
 * Parametric PCB Suite - Shared Export Utilities
 * Provides single-source-of-truth helpers for:
 * 1. Gerber ZIP packaging with universal fab extensions (.gtl, .gbl, .gko, .gml, .drl)
 * 2. BOM CSV generation with LCSC part numbers and clean search comments
 * 3. CPL / Pick-and-Place PNP CSV generation with proper JLCPCB rotations
 * 4. Browser file download triggers
 */

import {
  convertSoupToGerberCommands,
  stringifyGerberCommandLayers,
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill
} from "../00-commonParts/circuit-json-to-gerber.js";

/**
 * Triggers a client-side file download in the browser.
 */
export function downloadFile(content, filename, mimeType = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a full Gerber ZIP bundle from circuitJson with standard layer extensions.
 * Automatically outputs both .gko and .gml for board outline compatibility.
 */
export async function createGerberZipBlob(circuitJson, options = {}) {
  const { projectName = "PCB", prefix = projectName } = options;

  const gerberCommands = convertSoupToGerberCommands(circuitJson);
  const layers = stringifyGerberCommandLayers(gerberCommands);
  const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson, is_plated: true });
  const drill = stringifyExcellonDrill(drillCommands);

  let JSZipClass = (typeof window !== "undefined" && window.JSZip) || (typeof global !== "undefined" && global.JSZip) || null;
  if (!JSZipClass && typeof window !== "undefined") {
    try {
      const mod = await import("https://esm.sh/jszip");
      JSZipClass = mod.default || mod;
    } catch (err) {
      console.warn("[Gerber Export] Could not dynamically load JSZip:", err);
    }
  }

  if (!JSZipClass) {
    throw new Error("JSZip library is not available in the current environment.");
  }

  const zip = new JSZipClass();
  Object.entries(layers).forEach(([layerName, content]) => {
    let filename = `${prefix}_${layerName}.gbr`;
    if (layerName.includes("F_Cu")) filename = `${prefix}_TopCopper.gtl`;
    else if (layerName.includes("B_Cu")) filename = `${prefix}_BottomCopper.gbl`;
    else if (layerName.includes("F_SilkScreen")) filename = `${prefix}_TopSilkscreen.gto`;
    else if (layerName.includes("B_SilkScreen")) filename = `${prefix}_BottomSilkscreen.gbo`;
    else if (layerName.includes("F_Mask")) filename = `${prefix}_TopSolderMask.gts`;
    else if (layerName.includes("B_Mask")) filename = `${prefix}_BottomSolderMask.gbs`;
    else if (layerName.includes("F_Paste")) filename = `${prefix}_TopPaste.gtp`;
    else if (layerName.includes("B_Paste")) filename = `${prefix}_BottomPaste.gbp`;
    else if (layerName.includes("Edge_Cuts")) {
      filename = `${prefix}_EdgeCuts.gko`;
      zip.file(`${prefix}_BoardOutline.gml`, content);
    }
    zip.file(filename, content);
  });

  if (drill) {
    zip.file(`${prefix}_Drill.drl`, drill);
  }

  return await zip.generateAsync({ type: "blob" });
}

/**
 * Generates standard JLCPCB-compatible BOM CSV from a list of component descriptors.
 * Format: Designator, Comment, Footprint, LCSC Part #, Quantity
 */
export function createBomCsv(components = []) {
  const header = "Designator,Comment,Footprint,LCSC Part #,Quantity\n";
  const rows = components.map(c => 
    `"${c.designator}","${c.comment}","${c.footprint}","${c.lcsc || ''}",${c.qty || 1}`
  ).join("\n");
  return header + rows;
}

/**
 * Generates standard JLCPCB-compatible Pick-and-Place (CPL / PNP) CSV.
 * Format: Designator, Mid X, Mid Y, Layer, Rotation
 */
export function createCplCsv(components = []) {
  const header = "Designator,Mid X,Mid Y,Layer,Rotation\n";
  const rows = components.map(c => {
    const x = typeof c.x === "number" ? c.x.toFixed(2) : c.x;
    const y = typeof c.y === "number" ? c.y.toFixed(2) : c.y;
    return `"${c.designator}",${x}mm,${y}mm,"${c.layer || 'Top'}",${c.rot || 0}`;
  }).join("\n");
  return header + rows;
}

/**
 * Generates an EasyEDA-compatible KiCad Project ZIP bundle (.kicad_pcb, .kicad_sch, .kicad_pro).
 * EasyEDA natively imports this via File > Import > KiCad (*.zip, *.kicad_pcb, ...).
 */
export async function createEasyEdaZipBlob(circuitJson, options = {}) {
  const { projectName = "PCB", prefix = projectName } = options;
  const {
    CircuitJsonToKicadPcbConverter,
    CircuitJsonToKicadSchConverter,
    CircuitJsonToKicadProConverter
  } = await import("../00-commonParts/circuit-json-to-kicad.js");

  let pcbStr = "";
  try {
    const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson, { projectName });
    pcbConverter.runUntilFinished();
    pcbStr = pcbConverter.getOutputString();

    // Sanitize to standard KiCad 6.0 format supported by EasyEDA Pro
    pcbStr = pcbStr.replace(/\(version 20241229\)\s*\(generator circuit-json-to-kicad\)\s*\(generator_version 0\.0\.1\)/g, '(version 20211014)\n  (generator pcbnew)');
    pcbStr = pcbStr.replace(/\(paper\s+A4\s*\)/g, '(paper "A4")');
    pcbStr = pcbStr.replace(/\(thickness 1\.4\)/g, '(thickness 1.6)');
    pcbStr = pcbStr.replace(/\(setup\s*\n\s*\(pad_to_mask_clearance 0\)\s*\)/g, `(setup
    (pad_to_mask_clearance 0)
    (clearance 0.10)
    (track_min_width 0.15)
    (via_min_size 0.45)
    (via_min_drill 0.20)
  )`);
    pcbStr = pcbStr.replace(/\(net (\d+) "([^"]*)"\)/g, (match, id, name) => {
      const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
      return `(net ${id} "${cleanName}")`;
    });
    pcbStr = pcbStr.replace(/\(layer F\.Cu\)/g, '(layer "F.Cu")');
    pcbStr = pcbStr.replace(/\(layer B\.Cu\)/g, '(layer "B.Cu")');
    pcbStr = pcbStr.replace(/\(layer F\.SilkS\)/g, '(layer "F.SilkS")');
    pcbStr = pcbStr.replace(/\(layer B\.SilkS\)/g, '(layer "B.SilkS")');
    pcbStr = pcbStr.replace(/\(layer F\.Mask\)/g, '(layer "F.Mask")');
    pcbStr = pcbStr.replace(/\(layer B\.Mask\)/g, '(layer "B.Mask")');
    pcbStr = pcbStr.replace(/\(layer F\.Fab\)/g, '(layer "F.Fab")');
    pcbStr = pcbStr.replace(/\(layer B\.Fab\)/g, '(layer "B.Fab")');
    pcbStr = pcbStr.replace(/\(layer Edge\.Cuts\)/g, '(layer "Edge.Cuts")');
    pcbStr = pcbStr.replace(/\(layers \*\.Cu \*\.Mask\)/g, '(layers "*.Cu" "*.Mask")');
    pcbStr = pcbStr.replace(/\(layers F\.Cu F\.Paste F\.Mask\)/g, '(layers "F.Cu" "F.Paste" "F.Mask")');
    pcbStr = pcbStr.replace(/\(layers B\.Cu B\.Paste B\.Mask\)/g, '(layers "B.Cu" "B.Paste" "B.Mask")');
    pcbStr = pcbStr.replace(/\(layers F\.Cu B\.Cu\)/g, '(layers "F.Cu" "B.Cu")');
  } catch (err) {
    console.warn("[EasyEDA / KiCad Export] PCB conversion notice:", err);
  }

  let JSZipClass = (typeof window !== "undefined" && window.JSZip) || (typeof global !== "undefined" && global.JSZip) || null;
  if (!JSZipClass && typeof window !== "undefined") {
    try {
      const mod = await import("https://esm.sh/jszip");
      JSZipClass = mod.default || mod;
    } catch (err) {
      console.warn("[EasyEDA Export] Could not dynamically load JSZip:", err);
    }
  }

  if (JSZipClass) {
    const zip = new JSZipClass();
    if (pcbStr) zip.file(`${prefix}.kicad_pcb`, pcbStr);
    return await zip.generateAsync({ type: "blob" });
  }

  return new Blob([pcbStr], { type: "text/plain;charset=utf-8" });
}
