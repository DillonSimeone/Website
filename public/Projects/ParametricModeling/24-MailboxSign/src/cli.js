#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { modelToSTL } from './stl.js';
import { getHelpText, parseCliArgs, resolveOutputPath, slugifyFilename } from './params.js';
import { buildMailboxSign } from './geometry.js';

async function main() {
  const params = parseCliArgs(process.argv.slice(2));
  if (params.help) {
    console.log(getHelpText());
    return;
  }

  const outPath = resolveOutputPath(params);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const result = await buildMailboxSign(params);
  const stlName = slugifyFilename(params.text);
  const stlContent = modelToSTL(result.manifold, stlName);
  fs.writeFileSync(outPath, stlContent, 'utf8');

  const [w, h, d] = result.size.map((v) => v.toFixed(1));
  console.log(`Generated: ${outPath}`);
  console.log(`Text:      ${result.lines.join(' | ')}`);
  console.log(`Style:     ${params.style} (mount: ${params.mount})`);
  console.log(`Size:      ${w} x ${h} x ${d} mm`);
  console.log(`Volume:    ${result.volumeCm3.toFixed(2)} cm^3 (${result.numTri} tris)`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
