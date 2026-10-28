/**
 * Apex Parasite: Chimera Odyssey - Asset Manager & Intelligent Flood-Fill Keying
 * Loads modular dark-fantasy assets (tavern, houses, cathedral spires, gatehouse, streetlamps,
 * clutter crates, cobblestones, trees, beast).
 * Uses exterior-connected BFS flood-fill keying so interior shadows, dark roof tiles, timber,
 * and monster carapaces remain 100% solid and never reveal the background.
 */

export class AssetManager {
  constructor() {
    this.sprites = {};
    this.isLoaded = false;
  }

  async loadAll() {
    const assets = [
      { id: 'house', src: 'assets/house.jpg', threshold: 24, feather: 22 },
      { id: 'tavern', src: 'assets/tavern.jpg', threshold: 24, feather: 22 },
      { id: 'house_narrow', src: 'assets/house_narrow.jpg', threshold: 24, feather: 22 },
      { id: 'spire', src: 'assets/spire.jpg', threshold: 24, feather: 22 },
      { id: 'lamp', src: 'assets/lamp.jpg', threshold: 20, feather: 18 },
      { id: 'tree', src: 'assets/tree.jpg', threshold: 22, feather: 20 },
      { id: 'beast', src: 'assets/beast.jpg', threshold: 22, feather: 22 },
      { id: 'crates', src: 'assets/crates.jpg', threshold: 24, feather: 20 }
    ];

    const promises = assets.map(a => this.loadAndProcessAsset(a));
    await Promise.all(promises);
    this.isLoaded = true;
  }

  loadAndProcessAsset(asset) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);

          // Intelligent exterior-connected BFS flood fill keying
          this.applyFloodFillKey(ctx, w, h, asset.threshold || 24, asset.feather || 20);

          this.sprites[asset.id] = canvas;
          resolve(canvas);
        } catch (err) {
          console.warn('Canvas keying fallback for asset:', asset.id, err);
          this.sprites[asset.id] = img;
          resolve(img);
        }
      };
      img.onerror = (err) => {
        console.warn('Failed to load asset image:', asset.src, err);
        resolve(null);
      };
      img.src = asset.src;
    });
  }

  /**
   * Exterior Connected Flood-Fill Keying:
   * Only keys pixels reachable from the outer sky borders of the image that match the black background.
   * This completely prevents holes in dark roof tiles, timber, deep shadows, and creature anatomy.
   */
  applyFloodFillKey(ctx, w, h, threshold = 24, feather = 20) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const isBgCandidate = (r, g, b) => Math.max(r, g, b) <= threshold;

    const totalPixels = w * h;
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let head = 0;
    let tail = 0;

    const pushIfCandidate = (x, y) => {
      const idx = y * w + x;
      if (visited[idx]) return;
      const p = idx * 4;
      if (isBgCandidate(data[p], data[p + 1], data[p + 2])) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    // Queue top border (sky)
    for (let x = 0; x < w; x++) {
      pushIfCandidate(x, 0);
    }
    // Queue left and right borders
    for (let y = 0; y < h; y++) {
      pushIfCandidate(0, y);
      pushIfCandidate(w - 1, y);
    }
    // Queue bottom corner edges only (protects center ground base)
    const cornerWidth = Math.floor(w * 0.15);
    for (let x = 0; x < cornerWidth; x++) {
      pushIfCandidate(x, h - 1);
      pushIfCandidate(w - 1 - x, h - 1);
    }

    // BFS Expansion from perimeter inward
    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % w;
      const cy = (curr / w) | 0;

      if (cx > 0) pushIfCandidate(cx - 1, cy);
      if (cx < w - 1) pushIfCandidate(cx + 1, cy);
      if (cy > 0) pushIfCandidate(cx, cy - 1);
      if (cy < h - 1) pushIfCandidate(cx, cy + 1);
    }

    // Apply transparency & smooth boundary anti-aliased feather
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const p = idx * 4;

        if (visited[idx] === 1) {
          // Connected exterior background -> fully transparent
          data[p + 3] = 0;
        } else {
          // Check if this foreground pixel touches the exterior background (boundary feather)
          const hasBgNeighbor =
            (x > 0 && visited[idx - 1] === 1) ||
            (x < w - 1 && visited[idx + 1] === 1) ||
            (y > 0 && visited[idx - w] === 1) ||
            (y < h - 1 && visited[idx + w] === 1);

          if (hasBgNeighbor) {
            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];
            const maxVal = Math.max(r, g, b);
            if (maxVal < threshold + feather) {
              const alpha = Math.max(0, Math.min(255, Math.round(((maxVal - threshold) / feather) * 255)));
              data[p + 3] = alpha;
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  get(id) {
    return this.sprites[id] || null;
  }
}


