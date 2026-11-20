import fs from 'node:fs';
import opentype from 'opentype.js';
import { DEFAULT_FONT_CANDIDATES } from './params.js';

export function resolveFontPath(customFont) {
  if (customFont) {
    if (!fs.existsSync(customFont)) {
      throw new Error(`Font file not found: ${customFont}`);
    }
    return customFont;
  }
  for (const candidate of DEFAULT_FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No default system bold font found. Pass --font <path-to-ttf>.');
}

export function loadFont(fontPath) {
  const buf = fs.readFileSync(fontPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return opentype.parse(arrayBuffer);
}

function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/**
 * Convert an opentype.js Path (in screen coords) into 2D polygon rings in CAD coords (+Y up).
 */
export function pathToPolygons(otPath, curveSteps = 16) {
  const rings = [];
  let current = [];
  let pen = [0, 0];

  const pushPoint = (x, y) => {
    const pt = [x, -y];
    const prev = current[current.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-4) {
      current.push(pt);
    }
  };

  for (const cmd of otPath.commands) {
    if (cmd.type === 'M') {
      if (current.length >= 3) rings.push(current);
      current = [];
      pen = [cmd.x, cmd.y];
      pushPoint(cmd.x, cmd.y);
    } else if (cmd.type === 'L') {
      pushPoint(cmd.x, cmd.y);
      pen = [cmd.x, cmd.y];
    } else if (cmd.type === 'Q') {
      const p0 = pen;
      const p1 = [cmd.x1, cmd.y1];
      const p2 = [cmd.x, cmd.y];
      for (let s = 1; s <= curveSteps; s++) {
        const [qx, qy] = quadPoint(p0, p1, p2, s / curveSteps);
        pushPoint(qx, qy);
      }
      pen = p2;
    } else if (cmd.type === 'C') {
      const p0 = pen;
      const p1 = [cmd.x1, cmd.y1];
      const p2 = [cmd.x2, cmd.y2];
      const p3 = [cmd.x, cmd.y];
      for (let s = 1; s <= curveSteps; s++) {
        const [cx, cy] = cubicPoint(p0, p1, p2, p3, s / curveSteps);
        pushPoint(cx, cy);
      }
      pen = p3;
    } else if (cmd.type === 'Z') {
      if (current.length >= 3) {
        const first = current[0];
        const last = current[current.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-4) {
          current.pop();
        }
        if (current.length >= 3) rings.push(current);
      }
      current = [];
    }
  }

  if (current.length >= 3) {
    rings.push(current);
  }
  return rings;
}

/**
 * Build centered multi-line 2D CrossSections for the requested text.
 */
export function buildTextLines(wasm, font, params) {
  const { CrossSection } = wasm;
  const rawText = params.upper ? params.text.toUpperCase() : params.text;
  const rawLines = rawText
    .split(/\r?\n|\|/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) {
    throw new Error('Text cannot be empty.');
  }

  const fontSize = params.letterHeight;
  const letterSpacingEm = params.letterSpacing / fontSize;

  const built = rawLines.map((line) => {
    const otPath = font.getPath(line, 0, 0, fontSize, {
      kerning: true,
      letterSpacing: letterSpacingEm,
    });
    const polygons = pathToPolygons(otPath, params.curveSteps);
    if (polygons.length === 0) {
      throw new Error(`No vector geometry generated for line: "${line}"`);
    }

    let cs = new CrossSection(polygons, 'EvenOdd');
    if (params.boldness > 0) {
      cs = cs.offset(params.boldness, 'Round');
    }

    const b = cs.bounds();
    const centerX = (b.min[0] + b.max[0]) / 2;
    cs = cs.translate([-centerX, 0]);
    const centeredBounds = cs.bounds();

    return {
      text: line,
      cs,
      bounds: centeredBounds,
      width: centeredBounds.max[0] - centeredBounds.min[0],
      height: centeredBounds.max[1] - centeredBounds.min[1],
    };
  });

  // Stack lines top-to-bottom so line 0 is at the top (+Y) and last line sits near y=0
  const lineStep = params.letterHeight + params.lineSpacing;
  const totalLines = built.length;
  for (let i = 0; i < totalLines; i++) {
    const offsetY = (totalLines - 1 - i) * lineStep;
    if (offsetY !== 0) {
      built[i].cs = built[i].cs.translate([0, offsetY]);
      built[i].bounds = built[i].cs.bounds();
    }
    built[i].baselineY = offsetY;
  }

  return built;
}
