import fs from "fs";
import path from "path";
import { compileCircuit } from "./src/circuit.js";
import { 
  convertSoupToGerberCommands, 
  stringifyGerberCommandLayers,
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill 
} from "../00-commonParts/circuit-json-to-gerber.js";

async function run() {
  console.log("Compiling PCB 03 with full autorouting...");
  const circuit = await compileCircuit({
    boardWidth: 38,
    boardLength: 38,
    skipRouting: false
  });

  const circuitJson = circuit.getCircuitJson();
  console.log("Converting soup to Gerber layers...");
  const gerberCommands = convertSoupToGerberCommands(circuitJson);
  const layers = stringifyGerberCommandLayers(gerberCommands);
  const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson, is_plated: true });
  const drill = stringifyExcellonDrill(drillCommands);

  const outDir = path.resolve("./03-compactAudioMotionSquarePCB/gerber_export");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // File naming mapping for standard JLCPCB production
  const nameMapping = {
    F_Cu: "compactSquare_TopCopper.gtl",
    B_Cu: "compactSquare_BottomCopper.gbl",
    F_SilkScreen: "compactSquare_TopSilkscreen.gto",
    B_SilkScreen: "compactSquare_BottomSilkscreen.gbo",
    F_Mask: "compactSquare_TopSolderMask.gts",
    B_Mask: "compactSquare_BottomSolderMask.gbs",
    F_Paste: "compactSquare_TopPaste.gtp",
    B_Paste: "compactSquare_BottomPaste.gbp",
    Edge_Cuts: "compactSquare_BoardOutline.gko"
  };

  for (const [layerKey, content] of Object.entries(layers)) {
    let filename = `compactSquare_${layerKey}.gbr`;
    for (const [k, v] of Object.entries(nameMapping)) {
      if (layerKey.includes(k)) {
        filename = v;
        break;
      }
    }
    fs.writeFileSync(path.join(outDir, filename), content, "utf8");
    console.log(`Saved Gerber layer: ${filename}`);
  }

  if (drill) {
    fs.writeFileSync(path.join(outDir, "compactSquare_Drill.drl"), drill, "utf8");
    console.log(`Saved Excellon drill: compactSquare_Drill.drl`);
  }

  // BOM CSV
  const smtComponents = [
    { designator: "U_CHG", comment: "TP4054", footprint: "SOT-23-5", lcsc: "C382138", qty: 1 },
    { designator: "Q_FET", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "Q_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "D_PWR", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "D_HAP", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "R_PROG", comment: "2k", footprint: "0603", lcsc: "C22975", qty: 1 },
    { designator: "R_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_PWR", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "C_VIN", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1 },
    { designator: "C_BAT", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1 },
    { designator: "Q_LED_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "R_LED_PU", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "Q_LED_EN", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "R_LED_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 }
  ];

  const bomCsv = "Designator,Comment,Footprint,LCSC Part #,Quantity\n" +
    smtComponents.map(c => `"${c.designator}","${c.comment}","${c.footprint}","${c.lcsc}",${c.qty}`).join("\n");
  fs.writeFileSync(path.join(outDir, "compactSquare_BOM.csv"), bomCsv, "utf8");
  fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB_BOM.csv"), bomCsv, "utf8");
  console.log("Saved BOM: compactSquare_BOM.csv");

  // CPL CSV
  const cplRows = ["Designator,Mid X,Mid Y,Layer,Rotation"];
  const bWidth = 38;
  const smtPosMap = {
    U_CHG: { x: -7.5, y: 14.6, rot: 0, layer: "Top" },
    R_PROG: { x: -10.2, y: 14.6, rot: 0, layer: "Top" },
    C_VIN: { x: -7.5, y: 17.1, rot: 0, layer: "Top" },
    C_BAT: { x: -7.5, y: 11.8, rot: 0, layer: "Top" },
    Q_PWR: { x: 5.2, y: 13.5, rot: 270, layer: "Top" },
    D_PWR: { x: 9.8, y: 13.5, rot: 0, layer: "Top" },
    R_PWR: { x: 5.2, y: 16.5, rot: 0, layer: "Top" },
    Q_FET: { x: -(bWidth / 2 - 3.5), y: -7.0, rot: 270, layer: "Top" },
    R_GATE: { x: -(bWidth / 2 - 3.5), y: -10.0, rot: 0, layer: "Top" },
    D_HAP: { x: (bWidth / 2 - 3.5), y: -6.0, rot: 180, layer: "Top" },
    Q_LED_PWR: { x: -4.5, y: -7.5, rot: 270, layer: "Top" },
    Q_LED_EN: { x: 0.0, y: -7.5, rot: 270, layer: "Top" },
    R_LED_PU: { x: -4.5, y: -4.5, rot: 0, layer: "Top" },
    R_LED_GATE: { x: 0.0, y: -4.5, rot: 0, layer: "Top" }
  };
  smtComponents.forEach(c => {
    const pos = smtPosMap[c.designator] || { x: 0, y: 0, rot: 0, layer: "Top" };
    cplRows.push(`"${c.designator}","${pos.x.toFixed(2)}mm","${pos.y.toFixed(2)}mm","${pos.layer}",${pos.rot}`);
  });
  const cplCsv = cplRows.join("\n");
  fs.writeFileSync(path.join(outDir, "compactSquare_CPL.csv"), cplCsv, "utf8");
  fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB_CPL.csv"), cplCsv, "utf8");
  console.log("Saved CPL: compactSquare_CPL.csv");

  // KiCad / EasyEDA Project Files (.kicad_pcb, .kicad_sch, .kicad_pro)
  let pcbStr = "", schStr = "", proStr = "";
  try {
    const { 
      CircuitJsonToKicadPcbConverter, 
      CircuitJsonToKicadSchConverter, 
      CircuitJsonToKicadProConverter 
    } = await import("../00-commonParts/circuit-json-to-kicad.js");

    const pcbConv = new CircuitJsonToKicadPcbConverter(circuitJson, { projectName: "03_compactSquareLedHapticPCB" });
    pcbConv.runUntilFinished();
    pcbStr = pcbConv.getOutputString();

    // Sanitize to KiCad 6.0 with JLCPCB design rules
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

    fs.writeFileSync(path.join(outDir, "03_compactSquareLedHapticPCB.kicad_pcb"), pcbStr, "utf8");
    fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB.kicad_pcb"), pcbStr, "utf8");
    console.log("Saved EasyEDA / KiCad PCB: 03_compactSquareLedHapticPCB.kicad_pcb");

    const schConv = new CircuitJsonToKicadSchConverter(circuitJson, { projectName: "03_compactSquareLedHapticPCB" });
    schConv.runUntilFinished();
    schStr = schConv.getOutputString();
    fs.writeFileSync(path.join(outDir, "03_compactSquareLedHapticPCB.kicad_sch"), schStr, "utf8");
    fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB.kicad_sch"), schStr, "utf8");
    console.log("Saved EasyEDA / KiCad Schematic: 03_compactSquareLedHapticPCB.kicad_sch");

    const proConv = new CircuitJsonToKicadProConverter(circuitJson, { projectName: "03_compactSquareLedHapticPCB" });
    proStr = JSON.stringify(proConv.project, null, 2);
    fs.writeFileSync(path.join(outDir, "03_compactSquareLedHapticPCB.kicad_pro"), proStr, "utf8");
    fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB.kicad_pro"), proStr, "utf8");
    console.log("Saved EasyEDA / KiCad Project: 03_compactSquareLedHapticPCB.kicad_pro");
  } catch (kicadErr) {
    console.warn("EasyEDA/KiCad Export warning:", kicadErr);
  }

  // Generate ZIP Packages using JSZip
  try {
    const JSZip = (await import("jszip")).default;
    
    // 1. Gerber Production ZIP
    const gerberZip = new JSZip();
    for (const [layerKey, content] of Object.entries(layers)) {
      let filename = `compactSquare_${layerKey}.gbr`;
      for (const [k, v] of Object.entries(nameMapping)) {
        if (layerKey.includes(k)) {
          filename = v;
          break;
        }
      }
      gerberZip.file(filename, content);
    }
    if (drill) {
      gerberZip.file("compactSquare_Drill.drl", drill);
    }
    const gerberZipBuf = await gerberZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    fs.writeFileSync(path.join(outDir, "03_compactSquareLedHapticPCB_Gerbers.zip"), gerberZipBuf);
    fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB_Gerbers.zip"), gerberZipBuf);
    console.log("Saved Gerber ZIP: 03_compactSquareLedHapticPCB_Gerbers.zip");

    // 2. EasyEDA / KiCad Import ZIP
    if (pcbStr) {
      const easyEdaZip = new JSZip();
      easyEdaZip.file("03_compactSquareLedHapticPCB.kicad_pcb", pcbStr);
      if (schStr) easyEdaZip.file("03_compactSquareLedHapticPCB.kicad_sch", schStr);
      if (proStr) easyEdaZip.file("03_compactSquareLedHapticPCB.kicad_pro", proStr);
      easyEdaZip.file("03_compactSquareLedHapticPCB_BOM.csv", bomCsv);
      easyEdaZip.file("03_compactSquareLedHapticPCB_CPL.csv", cplCsv);
      const easyEdaZipBuf = await easyEdaZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      fs.writeFileSync(path.join(outDir, "03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip"), easyEdaZipBuf);
      fs.writeFileSync(path.resolve("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip"), easyEdaZipBuf);
      console.log("Saved EasyEDA / KiCad ZIP: 03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip");
    }
  } catch (zipErr) {
    console.warn("ZIP generation warning:", zipErr);
  }

  console.log("\nArtifact generation complete!");
}

run();

