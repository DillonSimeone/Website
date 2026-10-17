/**
 * Apex Parasite - Monospace Glyph Texture Atlas
 * Generates a 16x16 grid monospace texture atlas on an offscreen HTML5 canvas.
 * Computes exact UV coordinates for InstancedMesh vertex shader.
 */

import * as THREE from 'three';

export class GlyphAtlas {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.gridSize = 16; // 16x16 = 256 glyphs
    this.atlasSize = this.cellSize * this.gridSize; // 512x512 px
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.atlasSize;
    this.canvas.height = this.atlasSize;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    
    this.glyphMap = new Map();
    this.buildAtlas();
    
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  buildAtlas() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.atlasSize, this.atlasSize);
    
    // Crisp typography
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(this.cellSize * 0.75)}px "Courier New", "Consolas", monospace`;

    // Standard ASCII 0-127 and extended symbols
    for (let i = 0; i < 256; i++) {
      const col = i % this.gridSize;
      const row = Math.floor(i / this.gridSize);
      const x = col * this.cellSize + this.cellSize / 2;
      const y = row * this.cellSize + this.cellSize / 2;

      let char = '';
      if (i >= 32 && i <= 126) {
        char = String.fromCharCode(i);
      } else {
        // Custom roguelike glyphs for non-printable slots
        switch (i) {
          case 1: char = '♥'; break; // Heart / Core
          case 2: char = '☠'; break; // Skull / Sepsis death
          case 3: char = '§'; break; // Chitin / Parasite section
          case 4: char = '≈'; break; // Siphon / Liquid
          case 5: char = 'Ω'; break; // Apex Singularity / Void
          case 6: char = '▲'; break; // North
          case 7: char = '▼'; break; // South
          case 8: char = '◄'; break; // West
          case 9: char = '►'; break; // East
          case 10: char = '♦'; break; // Crystal / Frost
          case 11: char = '♣'; break; // Plant / Flora
          case 12: char = '♠'; break; // Chitin Blade
          case 13: char = '♨'; break; // Thermal Vent
          case 14: char = '⚡'; break; // Neural Synapse
          case 15: char = '⚕'; break; // Surgical Scalpel
          default: char = ' '; break;
        }
      }

      ctx.fillText(char, x, y);
      this.glyphMap.set(i, { col, row });
    }
  }

  /**
   * Retrieves UV coordinate offsets for a given glyph index.
   * @param {number} code Character ASCII code or glyph index (0-255)
   * @returns {[number, number]} [col, row] in 0..15 range
   */
  getGlyphUV(code) {
    const validCode = (code >= 0 && code < 256) ? code : 32;
    const glyph = this.glyphMap.get(validCode);
    if (!glyph) return [0, 0];
    return [glyph.col, glyph.row];
  }
}
