import path from 'node:path';

export const DEFAULT_OUTPUT_DIR = 'F:\\3dPrint';
export const DEFAULT_FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\ariblk.ttf',
  'C:\\Windows\\Fonts\\arialbd.ttf',
  'C:\\Windows\\Fonts\\impact.ttf',
  'C:\\Windows\\Fonts\\tahomabd.ttf',
];

export const DEFAULT_PARAMS = {
  text: '560 McCall Way|Shrek Swamp',
  style: 'rail',          // 'rail' | 'plaque' | 'framed'
  mount: 'vhb',           // 'vhb' | 'holes'
  letterHeight: 30,       // mm (cap height / font size)
  letterDepth: 6,         // mm (Z extrusion of letters)
  railHeight: 5.5,        // mm (height of connecting baseline rail)
  railDepth: 3.5,         // mm (Z thickness of rail/frame, stepped below letters)
  plateDepth: 3,          // mm (Z thickness of backing plate in 'plaque' mode)
  boldness: 0.4,          // mm (2D outward offset for printability & durability)
  lineSpacing: 8,         // mm (vertical gap between lines)
  letterSpacing: 0,       // mm (extra horizontal spacing per character)
  padding: 6,             // mm (margin for plaque/framed styles & mounting tabs)
  holeDia: 4.2,           // mm (clearance hole for M4 / #8 screw when mount='holes')
  upper: false,           // convert text to UPPERCASE
  curveSteps: 16,         // subdivisions per Bezier curve segment
  font: null,             // optional path to .ttf/.otf/.woff
  outDir: DEFAULT_OUTPUT_DIR,
  out: null,              // optional explicit output .stl path
  help: false,
};

const NUMERIC_KEYS = new Set([
  'letterHeight',
  'letterDepth',
  'railHeight',
  'railDepth',
  'plateDepth',
  'boldness',
  'lineSpacing',
  'letterSpacing',
  'padding',
  'holeDia',
  'curveSteps',
]);

const FLAG_ALIASES = {
  '-t': 'text',
  '--text': 'text',
  '-s': 'style',
  '--style': 'style',
  '-m': 'mount',
  '--mount': 'mount',
  '--height': 'letterHeight',
  '--letter-height': 'letterHeight',
  '-d': 'letterDepth',
  '--depth': 'letterDepth',
  '--letter-depth': 'letterDepth',
  '--rail-height': 'railHeight',
  '--rail-depth': 'railDepth',
  '--plate-depth': 'plateDepth',
  '-b': 'boldness',
  '--boldness': 'boldness',
  '--line-spacing': 'lineSpacing',
  '--letter-spacing': 'letterSpacing',
  '--padding': 'padding',
  '--hole-dia': 'holeDia',
  '-u': 'upper',
  '--upper': 'upper',
  '--curve-steps': 'curveSteps',
  '-f': 'font',
  '--font': 'font',
  '--out-dir': 'outDir',
  '-o': 'out',
  '--out': 'out',
  '-h': 'help',
  '--help': 'help',
};

export function parseCliArgs(argv) {
  const params = { ...DEFAULT_PARAMS };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--holes') {
      params.mount = 'holes';
      continue;
    }

    const eqIdx = token.indexOf('=');
    const rawFlag = eqIdx !== -1 ? token.slice(0, eqIdx) : token;
    const key = FLAG_ALIASES[rawFlag];

    if (!key) {
      if (token.startsWith('-')) {
        throw new Error(`Unknown option: ${token}`);
      }
      positional.push(token);
      continue;
    }

    if (key === 'help' || key === 'upper') {
      params[key] = true;
      continue;
    }

    const value = eqIdx !== -1 ? token.slice(eqIdx + 1) : argv[++i];
    if (value === undefined) {
      throw new Error(`Missing value for ${rawFlag}`);
    }

    if (NUMERIC_KEYS.has(key)) {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error(`Invalid number for ${rawFlag}: ${value}`);
      }
      params[key] = num;
    } else {
      params[key] = value;
    }
  }

  if (positional.length > 0) {
    params.text = positional.join(' ');
  }

  // Normalize escaped \n from PowerShell/cmd into actual newlines
  params.text = String(params.text).replace(/\\n/g, '\n');

  if (!['rail', 'plaque', 'framed'].includes(params.style)) {
    throw new Error(`Invalid --style "${params.style}". Use: rail, plaque, or framed.`);
  }
  if (!['vhb', 'holes'].includes(params.mount)) {
    throw new Error(`Invalid --mount "${params.mount}". Use: vhb or holes.`);
  }
  if (params.letterHeight <= 0 || params.letterDepth <= 0) {
    throw new Error('letterHeight and letterDepth must be > 0.');
  }

  return params;
}

export function slugifyFilename(text) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'sign';
}

export function resolveOutputPath(params) {
  if (params.out) {
    return path.resolve(params.out);
  }
  const slug = slugifyFilename(params.text);
  return path.join(params.outDir, `mailbox-sign-${slug}.stl`);
}

export function getHelpText() {
  return `
Parametric Mailbox Sign Generator (Fused 3D-Printable STL)

Usage:
  node src/cli.js [text] [options]
  .\\mailbox-sign.bat "560 McCall Way|Shrek Swamp" [options]

Options:
  -t, --text <str>           Text to print (use "|" or "\\n" for multiple lines)
  -s, --style <mode>         rail (default, open fused letters), plaque, framed
  -m, --mount <mode>         vhb (default, flat back), holes (side mounting tabs)
      --holes                Shorthand for --mount holes
      --height <mm>          Letter height in mm (default: ${DEFAULT_PARAMS.letterHeight})
  -d, --depth <mm>           Letter extrusion depth in mm (default: ${DEFAULT_PARAMS.letterDepth})
      --rail-height <mm>     Baseline rail height in mm (default: ${DEFAULT_PARAMS.railHeight})
      --rail-depth <mm>      Rail/frame depth in mm (default: ${DEFAULT_PARAMS.railDepth})
      --plate-depth <mm>     Backing plate depth for plaque style (default: ${DEFAULT_PARAMS.plateDepth})
  -b, --boldness <mm>        2D stroke thickening in mm (default: ${DEFAULT_PARAMS.boldness})
      --line-spacing <mm>    Gap between lines in mm (default: ${DEFAULT_PARAMS.lineSpacing})
      --letter-spacing <mm>  Extra gap between letters in mm (default: ${DEFAULT_PARAMS.letterSpacing})
      --padding <mm>         Margin for plaque/framed/tabs in mm (default: ${DEFAULT_PARAMS.padding})
      --hole-dia <mm>        Screw hole diameter in mm (default: ${DEFAULT_PARAMS.holeDia})
  -u, --upper                Force UPPERCASE text
  -f, --font <path>          Path to .ttf/.otf font (default: Arial Black)
  -o, --out <path>           Explicit output .stl file path
      --out-dir <dir>        Output directory (default: ${DEFAULT_OUTPUT_DIR})
  -h, --help                 Show this help message
`.trim();
}
