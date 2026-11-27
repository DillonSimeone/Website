// pure_qr.js - Zero-dependency QR Code generator in Pure JavaScript
// Supports Byte mode, Error Correction Levels L, M, Q, H, Versions 1-10
// Returns SVG string or matrix

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PureQR = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  // GF(256) Math
  const EXP_TABLE = new Uint8Array(512);
  const LOG_TABLE = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP_TABLE[i] = x;
      EXP_TABLE[i + 255] = x;
      LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d; // 285
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
  }

  // Error Correction Levels
  // L: 01 (1), M: 00 (0), Q: 11 (3), H: 10 (2)
  const EC_LEVELS = {
    L: { ordinal: 1, bits: 1 },
    M: { ordinal: 0, bits: 0 },
    Q: { ordinal: 3, bits: 3 },
    H: { ordinal: 2, bits: 2 }
  };

  // QR Version Specs [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
  // We specify Versions 1 to 10 for EC level M (standard for QR codes with logos / high readability) and L
  const VERSION_CAPACITY = [
    null,
    // V1 (21x21)
    { L: [26, 7, 1, 19, 0, 0], M: [26, 10, 1, 16, 0, 0], Q: [26, 13, 1, 13, 0, 0], H: [26, 17, 1, 9, 0, 0], align: [] },
    // V2 (25x25)
    { L: [44, 10, 1, 34, 0, 0], M: [44, 16, 1, 28, 0, 0], Q: [44, 22, 1, 22, 0, 0], H: [44, 28, 1, 16, 0, 0], align: [6, 18] },
    // V3 (29x29)
    { L: [70, 15, 1, 55, 0, 0], M: [70, 26, 1, 44, 0, 0], Q: [70, 18, 2, 17, 0, 0], H: [70, 22, 2, 13, 0, 0], align: [6, 22] },
    // V4 (33x33)
    { L: [100, 20, 1, 80, 0, 0], M: [100, 18, 2, 32, 0, 0], Q: [100, 26, 2, 24, 0, 0], H: [100, 16, 4, 9, 0, 0], align: [6, 26] },
    // V5 (37x37)
    { L: [134, 26, 1, 108, 0, 0], M: [134, 24, 2, 43, 0, 0], Q: [134, 18, 2, 15, 2, 16], H: [134, 22, 2, 11, 2, 12], align: [6, 30] },
    // V6 (41x41)
    { L: [172, 18, 2, 68, 0, 0], M: [172, 16, 4, 27, 0, 0], Q: [172, 24, 4, 19, 0, 0], H: [172, 28, 4, 15, 0, 0], align: [6, 34] },
    // V7 (45x45)
    { L: [196, 20, 2, 78, 0, 0], M: [196, 18, 4, 31, 0, 0], Q: [196, 18, 2, 14, 4, 15], H: [196, 26, 4, 13, 1, 14], align: [6, 22, 38] },
    // V8 (49x49)
    { L: [242, 24, 2, 97, 0, 0], M: [242, 22, 2, 38, 2, 39], Q: [242, 22, 4, 18, 2, 19], H: [242, 26, 4, 14, 2, 15], align: [6, 24, 42] },
    // V9 (53x53)
    { L: [292, 30, 2, 116, 0, 0], M: [292, 22, 3, 36, 2, 37], Q: [292, 20, 4, 16, 4, 17], H: [292, 24, 4, 12, 4, 13], align: [6, 26, 46] },
    // V10 (57x57)
    { L: [346, 18, 2, 68, 2, 69], M: [346, 26, 4, 43, 1, 44], Q: [346, 24, 6, 19, 2, 20], H: [346, 28, 6, 15, 2, 16], align: [6, 28, 50] }
  ];

  // Generator polynomial coefficients for degree
  function getGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = [1];
      const factor = EXP_TABLE[i];
      for (let j = 0; j < poly.length; j++) {
        next.push(0);
      }
      for (let j = 0; j < poly.length; j++) {
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function calculateReedSolomon(data, ecCount) {
    const gen = getGeneratorPoly(ecCount);
    const result = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ result[0];
      for (let j = 0; j < ecCount - 1; j++) {
        result[j] = result[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      result[ecCount - 1] = gfMul(gen[ecCount], factor);
    }
    return result;
  }

  // Format info mask & generator: G(x) = x^10 + x^8 + x^5 + x^4 + x^2 + x + 1 (10100110111 = 0x537)
  const FORMAT_DIVISOR = 0x537;
  const FORMAT_MASK = 0x5412;

  function getFormatBits(ecLevelKey, maskPattern) {
    // 5-bit format data: 2 bits EC level + 3 bits mask
    let data = (EC_LEVELS[ecLevelKey].bits << 3) | maskPattern;
    let bch = data << 10;
    for (let i = 14; i >= 10; i--) {
      if ((bch >> i) & 1) {
        bch ^= FORMAT_DIVISOR << (i - 10);
      }
    }
    return ((data << 10) | bch) ^ FORMAT_MASK;
  }

  // Select minimum version to fit data
  function selectVersion(textBytesLength, ecLevel) {
    for (let v = 1; v <= 10; v++) {
      const spec = VERSION_CAPACITY[v][ecLevel];
      const totalDataCodewords = (spec[2] * spec[3]) + (spec[4] * spec[5]);
      // Header for byte mode: 4 bits mode + 8 bits length (for v 1-9) or 16 bits (v10)
      const headerBits = 4 + (v < 10 ? 8 : 16);
      const capacityBytes = Math.floor((totalDataCodewords * 8 - headerBits) / 8);
      if (textBytesLength <= capacityBytes) {
        return v;
      }
    }
    return 10;
  }

  function encodeData(text, version, ecLevelKey) {
    const spec = VERSION_CAPACITY[version][ecLevelKey];
    const totalDataCodewords = (spec[2] * spec[3]) + (spec[4] * spec[5]);

    // Encode string to UTF-8 bytes
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const utf8Bytes = encoder ? encoder.encode(text) : Buffer.from(text, 'utf-8');

    // Bit stream
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    // 1. Mode indicator: Byte mode = 0100 (4)
    pushBits(4, 4);

    // 2. Character count indicator
    const charCountBits = version < 10 ? 8 : 16;
    pushBits(utf8Bytes.length, charCountBits);

    // 3. Data bytes
    for (let i = 0; i < utf8Bytes.length; i++) {
      pushBits(utf8Bytes[i], 8);
    }

    // 4. Terminator (up to 4 zero bits)
    const maxBits = totalDataCodewords * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    pushBits(0, termLen);

    // 5. Pad to byte boundary
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    // 6. Pad bytes (alternating 0xEC and 0x11)
    const padBytes = [0xEC, 0x11];
    let padIndex = 0;
    while (bits.length < maxBits) {
      pushBits(padBytes[padIndex % 2], 8);
      padIndex++;
    }

    // Convert bits to byte array
    const dataBytes = new Uint8Array(totalDataCodewords);
    for (let i = 0; i < totalDataCodewords; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i * 8 + j];
      }
      dataBytes[i] = b;
    }

    // Divide into blocks and compute Reed-Solomon EC codewords
    const ecPerBlock = spec[1];
    const numBlocks1 = spec[2];
    const dataLen1 = spec[3];
    const numBlocks2 = spec[4];
    const dataLen2 = spec[5];
    const totalBlocks = numBlocks1 + numBlocks2;

    const dataBlocks = [];
    const ecBlocks = [];

    let offset = 0;
    for (let b = 0; b < totalBlocks; b++) {
      const bLen = b < numBlocks1 ? dataLen1 : dataLen2;
      const bData = dataBytes.slice(offset, offset + bLen);
      offset += bLen;
      dataBlocks.push(bData);
      ecBlocks.push(calculateReedSolomon(bData, ecPerBlock));
    }

    // Interleave data codewords
    const finalCodewords = [];
    const maxDataLen = Math.max(dataLen1, dataLen2);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        if (i < dataBlocks[b].length) {
          finalCodewords.push(dataBlocks[b][i]);
        }
      }
    }

    // Interleave EC codewords
    for (let i = 0; i < ecPerBlock; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        finalCodewords.push(ecBlocks[b][i]);
      }
    }

    return finalCodewords;
  }

  // Matrix creation & patterns
  function createMatrix(version) {
    const size = version * 4 + 17;
    // 0 = unassigned, 1 = white, 2 = black, >= 4 = reserved
    const matrix = [];
    for (let r = 0; r < size; r++) {
      matrix.push(new Uint8Array(size));
    }
    return { size, matrix };
  }

  function setFinderPattern(matrix, size, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
              matrix[mr][mc] = 2; // Black
            } else {
              matrix[mr][mc] = 1; // White
            }
          } else {
            matrix[mr][mc] = 1; // White separator
          }
        }
      }
    }
  }

  function setAlignmentPattern(matrix, row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
          matrix[row + r][col + c] = 2;
        } else {
          matrix[row + r][col + c] = 1;
        }
      }
    }
  }

  function placeFunctionPatterns(matrixObj, version) {
    const { size, matrix } = matrixObj;

    // Finder patterns + separators
    setFinderPattern(matrix, size, 0, 0);
    setFinderPattern(matrix, size, 0, size - 7);
    setFinderPattern(matrix, size, size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      const val = (i % 2 === 0) ? 2 : 1;
      if (matrix[6][i] === 0) matrix[6][i] = val;
      if (matrix[i][6] === 0) matrix[i][6] = val;
    }

    // Alignment patterns (Version 2+)
    const alignCoords = VERSION_CAPACITY[version].align;
    for (let i = 0; i < alignCoords.length; i++) {
      for (let j = 0; j < alignCoords.length; j++) {
        const r = alignCoords[i];
        const c = alignCoords[j];
        if (matrix[r][c] === 0) {
          setAlignmentPattern(matrix, r, c);
        }
      }
    }

    // Dark module (4 * V + 9, 8) = (size - 8, 8)
    matrix[size - 8][8] = 2;

    // Reserve format information areas
    for (let i = 0; i < 9; i++) {
      if (matrix[8][i] === 0) matrix[8][i] = 4;
      if (matrix[i][8] === 0) matrix[i][8] = 4;
    }
    for (let i = size - 8; i < size; i++) {
      if (matrix[8][i] === 0) matrix[8][i] = 4;
      if (matrix[i][8] === 0) matrix[i][8] = 4;
    }
  }

  function maskFunction(pattern, r, c) {
    switch (pattern) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function placeDataCodewords(matrixObj, codewords) {
    const { size, matrix } = matrixObj;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;

    let up = true;
    for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
      if (rightCol === 6) rightCol--; // Skip vertical timing column
      const leftCol = rightCol - 1;

      for (let vert = 0; vert < size; vert++) {
        const row = up ? (size - 1 - vert) : vert;
        for (let col of [rightCol, leftCol]) {
          if (matrix[row][col] === 0) {
            let bit = 0;
            if (bitIdx < totalBits) {
              const byteVal = codewords[Math.floor(bitIdx / 8)];
              bit = (byteVal >> (7 - (bitIdx % 8))) & 1;
              bitIdx++;
            }
            matrix[row][col] = bit ? 2 : 1;
          }
        }
      }
      up = !up;
    }
  }

  function applyMaskAndFormat(matrixObj, maskPattern, ecLevelKey) {
    const { size, matrix } = matrixObj;
    const output = [];

    // Copy and apply mask to data modules
    for (let r = 0; r < size; r++) {
      output.push(new Uint8Array(size));
      for (let c = 0; c < size; c++) {
        let val = matrix[r][c];
        // If data module (2 = black, 1 = white, not reserved)
        if (val === 1 || val === 2) {
          const isDark = (val === 2);
          const inverted = maskFunction(maskPattern, r, c) ? !isDark : isDark;
          output[r][c] = inverted ? 1 : 0; // 1 = dark, 0 = light
        } else if (val >= 4) {
          output[r][c] = 0; // Reserved area placeholder
        }
      }
    }

    // Write format bits (15 bits)
    const formatBits = getFormatBits(ecLevelKey, maskPattern);
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >> (14 - i)) & 1;

      // Top-left
      if (i <= 5) {
        output[8][i] = bit;
      } else if (i === 6) {
        output[8][7] = bit;
      } else if (i === 7) {
        output[8][8] = bit;
      } else if (i === 8) {
        output[7][8] = bit;
      } else {
        output[14 - i][8] = bit;
      }

      // Split between bottom-left and top-right
      if (i < 7) {
        output[size - 1 - i][8] = bit;
      } else {
        output[8][size - 15 + i] = bit;
      }
    }

    return output;
  }

  function evaluatePenalty(matrix, size) {
    let penalty = 0;

    // Feature 1: 5 or more same color in a row/col
    for (let r = 0; r < size; r++) {
      let count = 0;
      let last = -1;
      for (let c = 0; c < size; c++) {
        const val = matrix[r][c];
        if (val === last) {
          count++;
          if (count === 5) penalty += 3;
          else if (count > 5) penalty += 1;
        } else {
          last = val;
          count = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let count = 0;
      let last = -1;
      for (let r = 0; r < size; r++) {
        const val = matrix[r][c];
        if (val === last) {
          count++;
          if (count === 5) penalty += 3;
          else if (count > 5) penalty += 1;
        } else {
          last = val;
          count = 1;
        }
      }
    }

    // Feature 2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = matrix[r][c];
        if (v === matrix[r + 1][c] && v === matrix[r][c + 1] && v === matrix[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }

    return penalty;
  }

  function generateMatrix(text, options = {}) {
    const ecLevelKey = (options.ecLevel || 'M').toUpperCase();
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const textBytes = encoder ? encoder.encode(text) : Buffer.from(text, 'utf-8');
    const version = options.version || selectVersion(textBytes.length, ecLevelKey);
    const codewords = encodeData(text, version, ecLevelKey);

    const baseMatrixObj = createMatrix(version);
    placeFunctionPatterns(baseMatrixObj, version);
    placeDataCodewords(baseMatrixObj, codewords);

    // Find optimal mask pattern
    let bestMask = 0;
    let bestPenalty = Infinity;
    let bestMatrix = null;

    for (let mask = 0; mask < 8; mask++) {
      const candidate = applyMaskAndFormat(baseMatrixObj, mask, ecLevelKey);
      const penalty = evaluatePenalty(candidate, baseMatrixObj.size);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
        bestMatrix = candidate;
      }
    }

    return {
      size: baseMatrixObj.size,
      modules: bestMatrix,
      version,
      ecLevel: ecLevelKey,
      mask: bestMask
    };
  }

  function toSvgString(text, options = {}) {
    const qr = generateMatrix(text, options);
    const margin = typeof options.margin === 'number' ? options.margin : 2;
    const darkColor = (options.color && options.color.dark) || '#0a0f1d';
    const lightColor = (options.color && options.color.light) || '#ffffff';
    const totalSize = qr.size + margin * 2;

    let path = '';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c] === 1) {
          path += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges">` +
      `<rect width="${totalSize}" height="${totalSize}" fill="${lightColor}"/>` +
      `<path d="${path.trim()}" fill="${darkColor}"/>` +
      `</svg>`;
  }

  return {
    generateMatrix,
    toSvgString
  };
});
