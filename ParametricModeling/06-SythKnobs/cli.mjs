#!/usr/bin/env node
/**
 * SynthKnobs CLI Generator Tool
 * Generates parametric knob configurations, OpenSCAD code, direct STL files,
 * manifest data, and shareable web app URLs for AccessKnobs / SynthKnobs suite.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for URL-safe base64 encoding (matching state.js encodeParams)
function encodeParams(k) {
  const data = {
    s: k.shape || 'cyl',
    od: k.outerD,
    h: k.height,
    t: k.taper,
    tm: k.texMode || 'flutes',
    td: k.texDepth,
    ts: k.texScale,
    tc: k.texCount,
    bd: k.boreD,
    sh: k.slotH,
    c: k.clearance,
    ss: k.setScrew || 'm3',
    mm: k.mountMode || (k.boreD > 10 ? 'slide' : 'swap'),
    st: k.shaftType || 'dshaft'
  };
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeBatch(knobsList) {
  const encodedList = knobsList.map(k => encodeParams(k));
  const b64 = Buffer.from(JSON.stringify(encodedList)).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Raw Studio Caliper Measurements
export const RAW_STUDIO_MEASUREMENTS = [
  {
    id: 'elektron_master',
    name: 'Elektron Machinedrum / Monomachine Master & Vol Knob',
    photo: 'photo_1_2026-08-05_09-09-54.jpg',
    measuredD: 12.3, height: 13, taper: 0.95, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.8, texScale: 1.2, texCount: 16
  },
  {
    id: 'elektron_tempo',
    name: 'Elektron Machinedrum Tempo Knob',
    photo: 'photo_2_2026-08-05_09-09-54.jpg',
    measuredD: 12.2, height: 13, taper: 0.95, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.8, texScale: 1.2, texCount: 16
  },
  {
    id: 'arp_slider_knob',
    name: 'ARP / Modular Synth Slider Knob',
    photo: 'photo_3_2026-08-05_09-09-54.jpg',
    measuredD: 15.1, height: 16, taper: 0.85, shape: 'cyl',
    texMode: 'flutes', texDepth: 1.0, texScale: 1.5, texCount: 12
  },
  {
    id: 'makenoise_euro',
    name: 'Make Noise Eurorack Module Knob',
    photo: 'photo_4_2026-08-05_09-09-54.jpg',
    measuredD: 10.5, height: 14, taper: 0.90, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.6, texScale: 1.0, texCount: 12
  },
  {
    id: 'mi_small',
    name: 'Mutable Instruments Small Module Knob',
    photo: 'photo_5_2026-08-05_09-09-54.jpg',
    measuredD: 11.2, height: 13, taper: 0.92, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.7, texScale: 1.0, texCount: 14
  },
  {
    id: 'intellijel_micro',
    name: 'Intellijel Eurorack Micro Knob',
    photo: 'photo_6_2026-08-05_09-09-54.jpg',
    measuredD: 9.4, height: 12, taper: 0.88, shape: 'hex',
    texMode: 'scallops', texDepth: 0.5, texScale: 0.8, texCount: 6
  },
  {
    id: 'eurorack_std',
    name: 'Standard Eurorack Module Knob',
    photo: 'photo_7_2026-08-05_09-09-54.jpg',
    measuredD: 12.5, height: 15, taper: 0.90, shape: 'hex',
    texMode: 'flutes', texDepth: 0.8, texScale: 1.2, texCount: 10
  },
  {
    id: 'mi_frames_center',
    name: 'Mutable Instruments Frames Large Center Knob',
    photo: 'photo_8_2026-08-05_09-09-54.jpg',
    measuredD: 28.9, height: 18, taper: 0.85, shape: 'cyl',
    texMode: 'scallops', texDepth: 2.2, texScale: 3.5, texCount: 8
  },
  {
    id: 'xor_synth',
    name: 'Synthesis Technology / XOR Electronics Knob',
    photo: 'photo_10_2026-08-05_09-09-54.jpg',
    measuredD: 15.2, height: 16, taper: 0.90, shape: 'cyl',
    texMode: 'flutes', texDepth: 1.2, texScale: 1.5, texCount: 16
  },
  {
    id: 'shruthi_xt',
    name: 'Shruthi XT Hybrid Monosynth Knob',
    photo: 'photo_11_2026-08-05_09-09-54.jpg',
    measuredD: 11.2, height: 13, taper: 0.90, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.7, texScale: 1.0, texCount: 14
  },
  {
    id: 're303_vol',
    name: 'Din Sync RE-303 Volume / Power Knob',
    photo: 'photo_12_2026-08-05_09-09-54.jpg',
    measuredD: 10.5, height: 12, taper: 0.95, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.6, texScale: 1.0, texCount: 12
  },
  {
    id: 're303_param',
    name: 'Din Sync RE-303 Parameter Knob',
    photo: 'photo_13_2026-08-05_09-09-54.jpg',
    measuredD: 12.6, height: 13, taper: 0.92, shape: 'cyl',
    texMode: 'flutes', texDepth: 0.8, texScale: 1.2, texCount: 16
  }
];

export function buildSlideOverPresets(list = RAW_STUDIO_MEASUREMENTS) {
  return list.map(m => ({
    id: `${m.id}_slipon`,
    name: `${m.name} (Slip-On Sleeve)`,
    photo: m.photo,
    mountMode: 'slide',
    boreD: m.measuredD, // Inner bore diameter fits directly over measured knob
    clearance: 0.3, // 0.3mm snug slip-on tolerance
    outerD: Math.round((m.measuredD + 8.0) * 10) / 10, // Wider ergonomic grip diameter
    height: m.height + 2,
    taper: m.taper,
    shape: m.shape,
    texMode: m.texMode,
    texDepth: Math.round(m.texDepth * 1.5 * 10) / 10,
    texScale: m.texScale,
    texCount: m.texCount,
    slotH: m.height,
    setScrew: 'm3',
    shaftType: 'round'
  }));
}

export function buildSwapInPresets(list = RAW_STUDIO_MEASUREMENTS) {
  return list.map(m => ({
    id: `${m.id}_swap`,
    name: `${m.name} (Swap-In Shaft Knob)`,
    photo: m.photo,
    mountMode: 'swap',
    boreD: 6.0,
    clearance: 0.15,
    outerD: m.measuredD,
    height: m.height,
    taper: m.taper,
    shape: m.shape,
    texMode: m.texMode,
    texDepth: m.texDepth,
    texScale: m.texScale,
    texCount: m.texCount,
    slotH: 8,
    setScrew: 'm3',
    shaftType: 'dshaft'
  }));
}

function generateSTL(k) {
  const name = k.id;
  const facets = [];
  const outerR1 = k.outerD / 2;
  const outerR2 = (k.outerD / 2) * k.taper;
  const innerR = (k.boreD / 2) + (k.clearance || 0.15);
  const H = k.height;
  const slotH = k.slotH || 8;
  const numSides = k.shape === 'hex' ? 6 : 32;
  const texCount = k.texCount || 12;
  const texDepth = k.texDepth || 0.8;

  const steps = numSides;
  const bottomOuter = [];
  const topOuter = [];
  const bottomInner = [];
  const topInner = [];

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let fluteMod = 0;
    if (k.texMode === 'flutes' || k.texMode === 'scallops') {
      const fAng = angle * texCount;
      fluteMod = Math.max(-texDepth, Math.sin(fAng) * texDepth * 0.4);
    }

    const r1 = Math.max(innerR + 1.0, outerR1 + fluteMod);
    const r2 = Math.max(innerR + 1.0, outerR2 + fluteMod);

    bottomOuter.push([r1 * cos, r1 * sin, 0]);
    topOuter.push([r2 * cos, r2 * sin, H]);
  }

  // Inner bore wall
  const innerSteps = 24;
  const flatCut = innerR * 0.75;
  for (let i = 0; i < innerSteps; i++) {
    const angle = (i / innerSteps) * 2 * Math.PI;
    let x = innerR * Math.cos(angle);
    let y = innerR * Math.sin(angle);
    if (k.mountMode === 'swap' && k.shaftType === 'dshaft' && y > flatCut) {
      y = flatCut;
    }
    bottomInner.push([x, y, 0]);
    topInner.push([x, y, slotH]);
  }

  function addTriangle(v1, v2, v3) {
    const ax = v2[0] - v1[0], ay = v2[1] - v1[1], az = v2[2] - v1[2];
    const bx = v3[0] - v1[0], by = v3[1] - v1[1], bz = v3[2] - v1[2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    facets.push({
      normal: [nx / len, ny / len, nz / len],
      verts: [v1, v2, v3]
    });
  }

  function addQuad(v1, v2, v3, v4) {
    addTriangle(v1, v2, v3);
    addTriangle(v1, v3, v4);
  }

  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    addQuad(bottomOuter[i], bottomOuter[next], topOuter[next], topOuter[i]);
  }

  for (let i = 0; i < innerSteps; i++) {
    const next = (i + 1) % innerSteps;
    addQuad(bottomInner[next], bottomInner[i], topInner[i], topInner[next]);
  }

  const topCenter = [0, 0, H];
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    addTriangle(topOuter[i], topOuter[next], topCenter);
  }

  const boreCeiling = [0, 0, slotH];
  for (let i = 0; i < innerSteps; i++) {
    const next = (i + 1) % innerSteps;
    addTriangle(topInner[next], topInner[i], boreCeiling);
  }

  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    const ii1 = Math.floor((i / steps) * innerSteps);
    const ii2 = Math.floor(((i + 1) / steps) * innerSteps) % innerSteps;
    addQuad(bottomOuter[next], bottomOuter[i], bottomInner[ii1], bottomInner[ii2]);
  }

  let stl = `solid ${name}\n`;
  for (const f of facets) {
    stl += `facet normal ${f.normal[0].toFixed(4)} ${f.normal[1].toFixed(4)} ${f.normal[2].toFixed(4)}\n`;
    stl += `  outer loop\n`;
    for (const v of f.verts) {
      stl += `    vertex ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
    }
    stl += `  endloop\nendfacet\n`;
  }
  stl += `endsolid ${name}\n`;
  return stl;
}

function generateOpenSCAD(k) {
  return `// ACCESS KNOB — ${k.name || k.id}
// Generated via CLI for Studio Knobs (${k.mountMode === 'slide' ? 'Slip-On Sleeve' : 'Swap-In Shaft'})
module access_knob_${k.id}() {
  outer_d = ${k.outerD};
  height = ${k.height};
  taper = ${k.taper};
  bore_d = ${k.boreD};
  slot_h = ${k.slotH};
  tex_depth = ${k.texDepth};
  tex_scale = ${k.texScale};
  tex_count = ${k.texCount};

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=${k.shape === 'hex' ? 6 : 32});
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_${k.id}();
`;
}

function main() {
  const args = process.argv.slice(2);
  let mode = 'slide'; // default to slip-on as requested
  if (args.includes('--swap')) mode = 'swap';
  if (args.includes('--both') || args.includes('--all')) mode = 'both';

  const outDir = path.join(__dirname, 'studioKnobs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Snug fit presets (+0.3mm clearance)
  const snugPresets = buildSlideOverPresets(RAW_STUDIO_MEASUREMENTS);
  // Loose 5% / +0.6mm clearance presets
  const loosePresets = RAW_STUDIO_MEASUREMENTS.map(m => ({
    ...buildSlideOverPresets([m])[0],
    id: `${m.id}_slipon_loose5pct`,
    name: `${m.name} (Slip-On Sleeve +5% Loose)`,
    clearance: 0.6 // +0.6mm clearance compensation for printer inner-hole shrinkage
  }));

  const selectedPresets = mode === 'swap' ? buildSwapInPresets() : (mode === 'both' ? [...snugPresets, ...buildSwapInPresets()] : snugPresets);
  const batchUrlParam = encodeBatch(selectedPresets);
  const baseUrl = 'knob-parametric.html';
  const webAppUrl = `${baseUrl}?batch=${batchUrlParam}`;

  const manifestData = {
    generatedAt: new Date().toISOString(),
    mode: mode,
    count: selectedPresets.length,
    webAppUrl: webAppUrl,
    knobs: selectedPresets.map(k => ({
      ...k,
      cfg: encodeParams(k),
      shareUrl: `${baseUrl}?cfg=${encodeParams(k)}`
    }))
  };

  // Write manifest.json
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');

  // Create dedicated folders for 3D printing export
  const snugStlDir = path.join(outDir, 'slipon_stls_snug');
  const looseStlDir = path.join(outDir, 'slipon_stls_loose_5pct');
  fs.mkdirSync(snugStlDir, { recursive: true });
  fs.mkdirSync(looseStlDir, { recursive: true });

  // Generate Snug STLs
  snugPresets.forEach(k => {
    const stlContent = generateSTL(k);
    fs.writeFileSync(path.join(outDir, `${k.id}.stl`), stlContent, 'utf8');
    fs.writeFileSync(path.join(snugStlDir, `${k.id}.stl`), stlContent, 'utf8');
    const scadContent = generateOpenSCAD(k);
    fs.writeFileSync(path.join(outDir, `${k.id}.scad`), scadContent, 'utf8');
  });

  // Generate Loose 5% STLs
  loosePresets.forEach(k => {
    const stlContent = generateSTL(k);
    fs.writeFileSync(path.join(looseStlDir, `${k.id}.stl`), stlContent, 'utf8');
  });

  let combinedScad = `// Studio Knobs Collection OpenSCAD Export (${mode.toUpperCase()} MODE)\n// Generated ${new Date().toISOString()}\n\n`;
  selectedPresets.forEach((k, idx) => {
    const scadContent = generateOpenSCAD(k);
    combinedScad += `// --- ${k.name} (${k.outerD}mm Outer / ${k.boreD}mm Inner) ---\ntranslate([${idx * 45}, 0, 0])\n${scadContent}\n\n`;
  });

  fs.writeFileSync(path.join(outDir, `studio_knobs_batch.scad`), combinedScad, 'utf8');

  fs.writeFileSync(path.join(outDir, `studio_knobs_batch.scad`), combinedScad, 'utf8');

  // Helper to populate plate subfolders with duplicated STL files
  function populatePlateFolders(baseStlDir, isLoose = false) {
    const suffix = isLoose ? '_loose5pct' : '';

    const plates = [
      {
        folder: 'Plate1_Elektron',
        items: [
          { file: `elektron_master_slipon${suffix}`, count: 1 },
          { file: `elektron_tempo_slipon${suffix}`, count: 8 }
        ]
      },
      {
        folder: 'Plate2_RE303',
        items: [
          { file: `re303_vol_slipon${suffix}`, count: 1 },
          { file: `re303_param_slipon${suffix}`, count: 6 }
        ]
      },
      {
        folder: 'Plate3_ShruthiXT',
        items: [
          { file: `shruthi_xt_slipon${suffix}`, count: 16 }
        ]
      },
      {
        folder: 'Plate4_Eurorack',
        items: [
          { file: `mi_frames_center_slipon${suffix}`, count: 1 },
          { file: `mi_small_slipon${suffix}`, count: 8 },
          { file: `intellijel_micro_slipon${suffix}`, count: 6 },
          { file: `makenoise_euro_slipon${suffix}`, count: 8 },
          { file: `eurorack_std_slipon${suffix}`, count: 10 },
          { file: `xor_synth_slipon${suffix}`, count: 6 },
          { file: `arp_slider_knob_slipon${suffix}`, count: 6 }
        ]
      }
    ];

    plates.forEach(p => {
      const pDir = path.join(baseStlDir, p.folder);
      if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });

      p.items.forEach(item => {
        const srcFile = path.join(baseStlDir, `${item.file}.stl`);
        if (!fs.existsSync(srcFile)) return;
        const content = fs.readFileSync(srcFile);

        for (let i = 1; i <= item.count; i++) {
          const numStr = String(i).padStart(2, '0');
          const destName = `${item.file}_${numStr}.stl`;
          fs.writeFileSync(path.join(pDir, destName), content);
        }
      });
    });
  }

  populatePlateFolders(snugStlDir, false);
  populatePlateFolders(looseStlDir, true);

  // Write summary README in studioKnobs
  const readmeContent = `# Studio Knobs Parametric Catalog (${mode.toUpperCase()} SLIP-ON MODE)

Generated on: ${manifestData.generatedAt}
Total Studio Knobs: ${manifestData.count}
Mounting Mode: \`${mode}\`

## 🔗 Open All Studio Knobs in Web Interface:
[**Launch AccessKnobs Web App with Studio Presets**](${webAppUrl})

## 🖨️ Slicer Ready Build Plate Folders:
Each folder below contains the full pre-duplicated set of STLs ready to drag into your slicer and click **Auto Arrange**:
- **Snug Fit (+0.3mm)**:
  - \`slipon_stls_snug/Plate1_Elektron/\` (9 knobs)
  - \`slipon_stls_snug/Plate2_RE303/\` (7 knobs)
  - \`slipon_stls_snug/Plate3_ShruthiXT/\` (16 knobs)
  - \`slipon_stls_snug/Plate4_Eurorack/\` (45 knobs)
- **Loose Fit 5% (+0.6mm)**:
  - \`slipon_stls_loose_5pct/Plate1_Elektron/\`
  - \`slipon_stls_loose_5pct/Plate2_RE303/\`
  - \`slipon_stls_loose_5pct/Plate3_ShruthiXT/\`
  - \`slipon_stls_loose_5pct/Plate4_Eurorack/\`

## Studio Knob Measurements & Slip-On Specifications List:
${selectedPresets.map(k => `- **${k.name}**
  - Mount Mode: \`${k.mountMode.toUpperCase()}\` (Slip-over original knob)
  - Inner Bore: \`${k.boreD}mm\` | Outer Diameter: \`${k.outerD}mm\` | Height: \`${k.height}mm\` | Clearance: \`${k.clearance}mm\`
  - Profile: \`${k.shape}\` | Texture: \`${k.texMode}\` (\`${k.texCount}\` count, \`${k.texDepth}mm\` depth)
  - Files: [\`${k.id}.stl\`](${k.id}.stl) | [\`${k.id}.scad\`](${k.id}.scad)
  - Config Link: [Open Knob](${baseUrl}?cfg=${encodeParams(k)})
`).join('\n')}
`;

  fs.writeFileSync(path.join(outDir, 'README.md'), readmeContent, 'utf8');

  console.log(`\n==================================================`);
  console.log(`✅ SynthKnobs CLI Generator Complete (${mode.toUpperCase()} MODE)!`);
  console.log(`📁 Studio Knobs folder updated: ${outDir}`);
  console.log(`📄 Manifest written: studioKnobs/manifest.json`);
  console.log(`📄 STL files written: studioKnobs/*.stl (${selectedPresets.length} files)`);
  console.log(`📄 Plate Subfolders created: Plate1_Elektron, Plate2_RE303, Plate3_ShruthiXT, Plate4_Eurorack`);
  console.log(`📄 SCAD files written: studioKnobs/*.scad`);
  console.log(`📄 Catalog documentation written: studioKnobs/README.md`);
  console.log(`\n🌐 Open All Studio Knobs URL:`);
  console.log(webAppUrl);
  console.log(`==================================================\n`);
}

main();
