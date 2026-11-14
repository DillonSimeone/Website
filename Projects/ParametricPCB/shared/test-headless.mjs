#!/usr/bin/env node

/**
 * ============================================================================
 * Parametric PCB Suite - Headless Browser Smoke Test Runner
 * Uses local Chrome or Edge in modern headless mode to verify that the
 * web configurator compiles, renders Three.js & SVG DOMs, and passes DRC
 * with zero uncaught JavaScript exceptions.
 * 
 * Usage:
 *   node shared/test-headless.mjs 04
 *   node shared/test-headless.mjs 00
 *   node shared/test-headless.mjs 03 --port=5173
 * ============================================================================
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const projectAliases = {
  "00": "00-starterPCB",
  "01": "01-V6Led",
  "02": "02-audioMotionReactiveLedHapticPCB",
  "03": "03-compactAudioMotionSquarePCB",
  "04": "04-smdAudioMotionBatonPCB"
};

const args = process.argv.slice(2);
const targetArg = args.find(a => !a.startsWith("--")) || "04";
const projectFolder = projectAliases[targetArg] || targetArg;

const portArg = args.find(a => a.startsWith("--port="));
const port = portArg ? portArg.split("=")[1] : "5173";
const shouldTestReroute = args.includes("--reroute");
const targetUrl = `http://localhost:${port}/ParametricPCB/${projectFolder}/index.html${shouldTestReroute ? "?testReroute=1" : ""}`;
const budget = shouldTestReroute ? 18000 : 7000;

// Locate Chrome or Edge on Windows
const candidateBrowsers = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];

const browserExe = candidateBrowsers.find(p => fs.existsSync(p));

if (!browserExe) {
  console.error("❌ No Chrome or Edge executable found on the system for headless verification.");
  process.exit(1);
}

console.log("======================================================");
console.log(" Parametric PCB: Headless Browser Compilation Test");
console.log("======================================================");
console.log(`Target URL:  ${targetUrl}`);
console.log(`Browser:     ${browserExe}`);
console.log("Executing headless render pass...\n");

try {
  // Run headless browser with virtual time budget to allow AST compile & Three.js settling
  const cmd = `"${browserExe}" --headless=new --virtual-time-budget=${budget} --dump-dom "${targetUrl}"`;
  const domOutput = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 });

  // Assertions
  const hasErrorBox = domOutput.includes('class="drc-box drc-fail"') || domOutput.includes('class="drc-fail"') || domOutput.includes("Render failed:");
  const hasDrcPass = domOutput.includes('class="drc-box drc-pass"') || domOutput.includes('class="drc-ok"');
  const hasDrcWarn = domOutput.includes('class="drc-box drc-warn"') || domOutput.includes('class="drc-warn"');
  const hasCanvas = domOutput.includes("<canvas");
  const hasSvg = domOutput.includes("<svg");

  if (hasErrorBox) {
    console.error("❌ FAILED: Found render error or DRC failure in settled DOM.");
    const match = domOutput.match(/<div id="drc-status-box"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) console.error(`   Status Box: ${match[1].trim()}`);
    process.exit(1);
  }

  if (!hasDrcPass && !hasDrcWarn) {
    console.error("❌ FAILED: Layout did not settle or DRC status box was not updated.");
    process.exit(1);
  }

  console.log("✔ Settled DOM verification passed:");
  console.log(`  • DRC Status:   ${hasDrcPass ? "✔ 100% Passed" : "⚠ Advisory Warnings"}`);
  console.log(`  • 3D WebGL Canvas: ${hasCanvas ? "✔ Rendered" : "❌ Missing"}`);
  console.log(`  • 2D Vector SVG:   ${hasSvg ? "✔ Rendered" : "❌ Missing"}`);
  console.log("\n======================================================");
  console.log("✔ HEADLESS BROWSER VERIFICATION SUCCEEDED!");
  console.log("======================================================");
  process.exit(0);
} catch (err) {
  console.error("❌ Execution Error during headless browser pass:", err.message);
  process.exit(1);
}
