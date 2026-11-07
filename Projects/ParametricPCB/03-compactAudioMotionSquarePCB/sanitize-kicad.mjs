import fs from "fs";
import path from "path";
import JSZip from "jszip";

const pcbPath = "./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB.kicad_pcb";
let pcb = fs.readFileSync(pcbPath, "utf8");

// 1. Header fix: KiCad 6.0 compatible
pcb = pcb.replace(/\(version 20241229\)\s*\(generator circuit-json-to-kicad\)\s*\(generator_version 0\.0\.1\)/g, '(version 20211014)\n  (generator pcbnew)');
pcb = pcb.replace(/\(paper\s+A4\s*\)/g, '(paper "A4")');
pcb = pcb.replace(/\(thickness 1\.4\)/g, '(thickness 1.6)');

// 2. Net names sanitization (clean valid identifiers without special characters or spaces)
pcb = pcb.replace(/\(net (\d+) "([^"]*)"\)/g, (match, id, name) => {
  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return `(net ${id} "${cleanName}")`;
});

// Also replace in pads: (net 12 ".U_MCU > ...")
pcb = pcb.replace(/\(net (\d+) "([^"]*)"\)/g, (match, id, name) => {
  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return `(net ${id} "${cleanName}")`;
});

// 3. Layer quotes for strict KiCad 6 S-expression grammar
pcb = pcb.replace(/\(layer F\.Cu\)/g, '(layer "F.Cu")');
pcb = pcb.replace(/\(layer B\.Cu\)/g, '(layer "B.Cu")');
pcb = pcb.replace(/\(layer F\.SilkS\)/g, '(layer "F.SilkS")');
pcb = pcb.replace(/\(layer B\.SilkS\)/g, '(layer "B.SilkS")');
pcb = pcb.replace(/\(layer F\.Mask\)/g, '(layer "F.Mask")');
pcb = pcb.replace(/\(layer B\.Mask\)/g, '(layer "B.Mask")');
pcb = pcb.replace(/\(layer F\.Fab\)/g, '(layer "F.Fab")');
pcb = pcb.replace(/\(layer B\.Fab\)/g, '(layer "B.Fab")');
pcb = pcb.replace(/\(layer Edge\.Cuts\)/g, '(layer "Edge.Cuts")');
pcb = pcb.replace(/\(layers \*\.Cu \*\.Mask\)/g, '(layers "*.Cu" "*.Mask")');
pcb = pcb.replace(/\(layers F\.Cu F\.Paste F\.Mask\)/g, '(layers "F.Cu" "F.Paste" "F.Mask")');
pcb = pcb.replace(/\(layers B\.Cu B\.Paste B\.Mask\)/g, '(layers "B.Cu" "B.Paste" "B.Mask")');
pcb = pcb.replace(/\(layers F\.Cu B\.Cu\)/g, '(layers "F.Cu" "B.Cu")');

// Write the sanitized .kicad_pcb
fs.writeFileSync(pcbPath, pcb, "utf8");
fs.writeFileSync("./03-compactAudioMotionSquarePCB/gerber_export/03_compactSquareLedHapticPCB.kicad_pcb", pcb, "utf8");
console.log("Updated 03_compactSquareLedHapticPCB.kicad_pcb to standard KiCad 6 syntax!");

// Now generate the ZIP with ONLY the .kicad_pcb using JSZip (strict UTF-8 headers)
const zip = new JSZip();
zip.file("03_compactSquareLedHapticPCB.kicad_pcb", pcb);

const zipBuffer = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 }
});

fs.writeFileSync("./03-compactAudioMotionSquarePCB/03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip", zipBuffer);
console.log("Successfully created UTF-8 JSZip package: 03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip!");
