/** @typedef {{ minX: number, maxX: number, minY: number, maxY: number }} ObstacleBox */

export const MAX_SLOGAN_ATTEMPTS = 3;
export const DEFAULT_SLOGAN_PHRASES = "this machine kills facism";

/**
 * Normalize raw UI/state input to a non-empty phrase string.
 * @param {string} input
 * @returns {string}
 */
export function resolveSloganPhrases(input) {
  const trimmed = String(input ?? "").trim();
  return trimmed || DEFAULT_SLOGAN_PHRASES;
}

/**
 * Parse comma-separated slogan phrases. Falls back to the classic default when empty.
 * @param {string} input
 * @returns {string[]}
 */
export function parseSloganPhrases(input) {
  return resolveSloganPhrases(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Derive font size and collision footprint for a slogan string.
 * Long phrases shrink so the default fits on the narrow LED strip.
 * @param {string} text
 */
export function getSloganMetrics(text) {
  const len = Math.max(1, text.length);
  const fontSize = Math.min(0.6, Math.max(0.28, 10 / len));
  const charWidth = fontSize * 0.58;
  const textWidth = len * charWidth;
  const textHeight = fontSize * 1.35;
  return { fontSize, textWidth, textHeight, marginX: 0.6, marginY: 0.35 };
}

/**
 * Build axis-aligned keep-out zones for components and fixed silkscreen labels.
 * @returns {ObstacleBox[]}
 */
export function buildSilkscreenObstacles({ boardWidth, boardHeight, ledCount, spacing }) {
  const obstacles = [];

  const leftEdgeX = -boardWidth / 2;
  const rightEdgeX = boardWidth / 2;
  const jBegX = leftEdgeX + 1.0;
  const jEndX = rightEdgeX - 1.0;

  // Vertical header zones
  obstacles.push({
    minX: leftEdgeX,
    maxX: leftEdgeX + 5.0,
    minY: -boardHeight / 2,
    maxY: boardHeight / 2
  });
  obstacles.push({
    minX: rightEdgeX - 5.0,
    maxX: rightEdgeX,
    minY: -boardHeight / 2,
    maxY: boardHeight / 2
  });

  // J_BEG / J_END pad labels
  obstacles.push({ minX: jBegX + 1.5, maxX: jBegX + 6.0, minY: -5.0, maxY: 5.0 });
  obstacles.push({ minX: jEndX - 6.0, maxX: jEndX - 1.5, minY: -5.0, maxY: 5.0 });

  const startX = -((spacing * (ledCount - 1)) / 2);
  for (let i = 1; i <= ledCount; i++) {
    const ledX = startX + (i - 1) * spacing;

    obstacles.push({
      minX: ledX - 2.2,
      maxX: ledX + 2.2,
      minY: -2.2,
      maxY: 2.2
    });

    if (i < ledCount) {
      const midX = ledX + spacing / 2;

      obstacles.push({
        minX: midX - 2.0,
        maxX: midX + 2.0,
        minY: -6.0,
        maxY: -3.5
      });
      obstacles.push({
        minX: midX - 2.0,
        maxX: midX + 2.0,
        minY: 3.5,
        maxY: 6.0
      });

      // Intermediate header silkscreen labels (top and bottom rows)
      [-1.0, 0, 1.0].forEach((dx) => {
        obstacles.push({
          minX: midX + dx - 1.4,
          maxX: midX + dx + 1.4,
          minY: 2.8,
          maxY: 5.2
        });
        obstacles.push({
          minX: midX + dx - 1.4,
          maxX: midX + dx + 1.4,
          minY: -5.2,
          maxY: -2.8
        });
      });
    }
  }

  return obstacles;
}

/** @param {ObstacleBox} a @param {ObstacleBox} b */
export function boxesOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Estimate an axis-aligned bounding box for a slogan string at a position.
 * @param {string} text
 * @param {number} rx
 * @param {number} ry
 */
export function estimateSloganBox(text, rx, ry) {
  const { textWidth, textHeight, marginX, marginY } = getSloganMetrics(text);
  return {
    minX: rx - textWidth / 2 - marginX,
    maxX: rx + textWidth / 2 + marginX,
    minY: ry - textHeight / 2 - marginY,
    maxY: ry + textHeight / 2 + marginY
  };
}

/**
 * Try to place slogans randomly; skip any slot that collides after MAX_SLOGAN_ATTEMPTS tries.
 * @param {Object} params
 * @param {number} params.boardWidth
 * @param {number} params.boardHeight
 * @param {number} params.ledCount
 * @param {number} params.spacing
 * @param {string[]} params.phrases
 * @param {number} params.sloganCount
 * @param {number} [params.seed]
 * @returns {{ index: number, text: string, rx: number, ry: number, rotation: number, fontSize: number }[]}
 */
export function computeSloganPlacements({
  boardWidth,
  boardHeight,
  ledCount,
  spacing,
  phrases,
  sloganCount,
  seed = boardWidth + ledCount + 42
}) {
  if (!phrases?.length || sloganCount <= 0) {
    return [];
  }

  const obstacles = buildSilkscreenObstacles({ boardWidth, boardHeight, ledCount, spacing });
  const placements = [];

  let rngSeed = seed;
  const random = () => {
    const x = Math.sin(rngSeed++) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < sloganCount; i++) {
    const text = phrases[Math.floor(random() * phrases.length)];
    const metrics = getSloganMetrics(text);
    const { textWidth, textHeight, fontSize } = metrics;

    let placed = false;
    for (let attempt = 0; attempt < MAX_SLOGAN_ATTEMPTS; attempt++) {
      const rx =
        random() * Math.max(0, boardWidth - textWidth - 8.0) -
        boardWidth / 2 +
        4.0 +
        textWidth / 2;
      const ry =
        random() * Math.max(0, boardHeight - textHeight - 2.5) -
        boardHeight / 2 +
        1.25 +
        textHeight / 2;
      const rotation = (random() - 0.5) * 60;
      const box = estimateSloganBox(text, rx, ry);

      let collision = false;
      for (const obs of obstacles) {
        if (boxesOverlap(box, obs)) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        placements.push({
          index: i,
          text,
          rx,
          ry,
          rotation,
          fontSize
        });
        obstacles.push(box);
        placed = true;
        break;
      }
    }

    // Self-delete: after 3 failed attempts, abandon this slot silently
    if (!placed) {
      continue;
    }
  }

  return placements;
}
