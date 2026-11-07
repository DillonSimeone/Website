// Onion Engine Module
// Handles procedural canvas onion rendering, gene palettes, interactive breeding, and live parallel array splicing

(function initGeneSlicer() {
  const previewCanvas = document.querySelector("#previewCanvas");
  const cultivarNameInput = document.querySelector("#cultivarNameInput");
  const colorPaletteSelect = document.querySelector("#colorPaletteSelect");
  const stalkSlider = document.querySelector("#stalkSlider");
  const stalkCountVal = document.querySelector("#stalkCountVal");
  const bulbShapeSlider = document.querySelector("#bulbShapeSlider");
  const bulbShapeVal = document.querySelector("#bulbShapeVal");
  const randomizeBtn = document.querySelector("#randomizeBtn");
  const sliceGrowBtn = document.querySelector("#sliceGrowBtn");
  const copyJsonBtn = document.querySelector("#copyJsonBtn");
  const GENE_PALETTES = {
    golden: {
      highlight: '#fff8db', main: '#e0b769', shadow: '#8a6222', rim: '#4a330e',
      layer: 'rgba(100, 60, 20, 0.35)', stalk: '#4d7c2a', root: '#96784d'
    },
    crimson: {
      highlight: '#e8a7cb', main: '#962d66', shadow: '#531037', rim: '#320620',
      layer: 'rgba(70, 0, 45, 0.45)', stalk: '#446424', root: '#845771'
    },
    toxic: {
      highlight: '#e4ffb0', main: '#8dbd28', shadow: '#496b12', rim: '#263b07',
      layer: 'rgba(30, 60, 10, 0.4)', stalk: '#79b528', root: '#4a6b22'
    },
    copper: {
      highlight: '#f7d3a8', main: '#c76e4c', shadow: '#7c321e', rim: '#46150a',
      layer: 'rgba(95, 30, 15, 0.4)', stalk: '#3f631d', root: '#7e472e'
    },
    ghost: {
      highlight: '#ffffff', main: '#d4dfd4', shadow: '#7c8e7c', rim: '#414e41',
      layer: 'rgba(50, 70, 50, 0.35)', stalk: '#547854', root: '#9aa89a'
    }
  };

  let currentStalkAngles = [-10, 5, 20];

  // Expose OnionEngine on window for other modules (bg-onions, nodejs generator, etc.)
  window.OnionEngine = {
    palettes: GENE_PALETTES,
    drawProceduralOnion: drawProceduralOnion,
    buildStalksConfig: buildStalksConfig
  };

  if (!previewCanvas) return;

  function drawProceduralOnion(ctx, w, h, options) {
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.58;
    const rx = options.rx || 58;
    const ry = options.ry || 56;
    const neckX = cx + (options.neckOffsetX || 0);
    const neckY = cy - ry * 0.88;
    const basePalette = options.palette || GENE_PALETTES.golden;
    const palette = {
      highlight: options.highlightColor || basePalette.highlight,
      main: options.mainColor || basePalette.main,
      shadow: options.shadowColor || basePalette.shadow,
      rim: options.rimColor || basePalette.rim,
      layer: options.layerLineColor || basePalette.layer,
      stalk: options.stalkColor || basePalette.stalk,
      root: options.rootColor || basePalette.root
    };

    // bulb
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(neckX, neckY);
    ctx.bezierCurveTo(cx + rx * 1.05, neckY + ry * 0.25, cx + rx, cy + ry * 0.9, cx, cy + ry);
    ctx.bezierCurveTo(cx - rx, cy + ry * 0.9, cx - rx * 1.05, neckY + ry * 0.25, neckX, neckY);
    ctx.closePath();

    const grad = ctx.createRadialGradient(
      cx - rx * 0.25, cy - ry * 0.2, rx * 0.1,
      cx, cy, rx * 1.15
    );
    grad.addColorStop(0, palette.highlight);
    grad.addColorStop(0.45, palette.main);
    grad.addColorStop(0.85, palette.shadow);
    grad.addColorStop(1, palette.rim);

    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = palette.layer;
    ctx.lineWidth = 1.8;
    const layerLines = 5;
    for (let i = 1; i <= layerLines; i++) {
      const factor = i / (layerLines + 1);
      ctx.beginPath();
      ctx.moveTo(neckX, neckY);
      const lRx = rx * factor;
      ctx.bezierCurveTo(cx + lRx * 1.05, neckY + ry * 0.25, cx + lRx, cy + ry * 0.9, cx, cy + ry);
      ctx.bezierCurveTo(cx - lRx, cy + ry * 0.9, cx - lRx * 1.05, neckY + ry * 0.25, neckX, neckY);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // stalks
    const stalks = options.stalks || [];
    stalks.forEach(s => {
      ctx.save();
      ctx.strokeStyle = s.color || palette.stalk;
      ctx.fillStyle = s.color || palette.stalk;
      ctx.lineWidth = s.width || 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(neckX + (s.rootOffset || 0), neckY + 4);

      const cpX = neckX + Math.sin(s.angle * Math.PI / 180) * (s.length * 0.5) + (s.curve || 0);
      const cpY = neckY - (s.length * 0.5);
      const endX = neckX + Math.sin(s.angle * Math.PI / 180) * s.length;
      const endY = neckY - (s.length * 0.95);

      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(endX, endY, (s.width || 6) * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // root
    ctx.save();
    ctx.strokeStyle = palette.root || palette.shadow;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const rootBaseY = cy + ry * 0.95;
    const rootCount = 5;
    for (let i = 0; i < rootCount; i++) {
      ctx.beginPath();
      const rOff = (i - (rootCount - 1) / 2) * 5;
      ctx.moveTo(cx + rOff, rootBaseY);
      ctx.quadraticCurveTo(
        cx + rOff + (Math.sin(i * 1.5) * 8),
        rootBaseY + 10,
        cx + rOff + (Math.sin(i * 2.1) * 12),
        rootBaseY + 16 + (i % 3) * 4
      );
      ctx.stroke();
    }
    ctx.restore();

    // calculator screen badge overlay if specified
    if (options.isCalculator) {
      ctx.save();
      ctx.fillStyle = '#223812';
      ctx.strokeStyle = '#8bc34a';
      ctx.lineWidth = 2.5;
      const bx = cx - 36, by = cy - 20, bw = 72, bh = 48;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 8) : ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();

      // Screen
      ctx.fillStyle = '#9fd356';
      ctx.fillRect(bx + 8, by + 6, bw - 16, 14);
      ctx.fillStyle = '#112200';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('133.7 SWP', bx + 12, by + 17);

      // Buttons
      const cols = 4, rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (c === 3) ? '#f28c28' : '#496b27';
          ctx.fillRect(bx + 8 + c * 14, by + 24 + r * 10, 11, 7);
        }
      }
      ctx.restore();
    }
  }

  function buildStalksConfig(count) {
    const stalks = [];
    const baseAngles = currentStalkAngles.slice(0, count);
    while (baseAngles.length < count) {
      baseAngles.push(-30 + Math.random() * 60);
    }

    for (let i = 0; i < count; i++) {
      const angle = baseAngles[i];
      stalks.push({
        angle: angle,
        length: 60 + (i % 2) * 20,
        width: 5 + (i % 3),
        curve: angle * 0.7,
        rootOffset: (i - (count - 1) / 2) * 3
      });
    }
    return stalks;
  }

  function updatePreview() {
    const ctx = previewCanvas.getContext('2d');
    const stalkCount = parseInt(stalkSlider.value, 10);
    stalkCountVal.textContent = stalkCount;

    const rx = parseInt(bulbShapeSlider.value, 10);
    if (rx < 45) {
      bulbShapeVal.textContent = "Slender Shallot";
    } else if (rx > 65) {
      bulbShapeVal.textContent = "Flat Vidalia";
    } else {
      bulbShapeVal.textContent = "Plump Round";
    }

    const palette = GENE_PALETTES[colorPaletteSelect.value] || GENE_PALETTES.golden;
    const stalks = buildStalksConfig(stalkCount);

    drawProceduralOnion(ctx, previewCanvas.width, previewCanvas.height, {
      rx: rx,
      ry: 56,
      palette: palette,
      stalks: stalks
    });
  }

  stalkSlider.addEventListener('input', updatePreview);
  bulbShapeSlider.addEventListener('input', updatePreview);
  colorPaletteSelect.addEventListener('change', updatePreview);

  randomizeBtn.addEventListener('click', function () {
    const palettes = Object.keys(GENE_PALETTES);
    colorPaletteSelect.value = palettes[Math.floor(Math.random() * palettes.length)];

    const randomStalks = Math.floor(Math.random() * 6) + 1;
    stalkSlider.value = randomStalks;

    const randomRx = Math.floor(Math.random() * 45) + 30;
    bulbShapeSlider.value = randomRx;

    currentStalkAngles = [];
    for (let i = 0; i < randomStalks; i++) {
      currentStalkAngles.push(-35 + Math.random() * 70);
    }

    const swampNames = [
      "Bog-Dweller Sulphur Bulb",
      "Fiona's Emerald Scallion",
      "Donkey's Sweet Waffle Onion",
      "Lord Farquaad's Tearjerker",
      "Duloc Hybrid Mega-Shallot",
      "Dragon-Flame Crimson Allium"
    ];
    cultivarNameInput.value = swampNames[Math.floor(Math.random() * swampNames.length)];

    updatePreview();
  });

  function getCurrentOnionConfig() {
    const stalkCount = parseInt(stalkSlider.value, 10);
    const rx = parseInt(bulbShapeSlider.value, 10);
    const paletteKey = colorPaletteSelect.value;
    const palette = GENE_PALETTES[paletteKey] || GENE_PALETTES.golden;
    const stalks = buildStalksConfig(stalkCount);

    return {
      name: cultivarNameInput.value.trim() || "Swamp Hybrid",
      palette: paletteKey,
      rx: rx,
      ry: 56,
      highlightColor: palette.highlight,
      mainColor: palette.main,
      shadowColor: palette.shadow,
      rimColor: palette.rim,
      layerLineColor: palette.layer,
      rootColor: palette.root,
      stalks: stalks
    };
  }

  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', function () {
      const config = getCurrentOnionConfig();
      const jsonText = JSON.stringify(config, null, 2);

      navigator.clipboard.writeText(jsonText).then(() => {
        const originalText = copyJsonBtn.textContent;
        copyJsonBtn.textContent = "Copied!";
        copyJsonBtn.style.borderColor = "#b1d65c";
        copyJsonBtn.style.color = "#b1d65c";
        setTimeout(() => {
          copyJsonBtn.textContent = originalText;
          copyJsonBtn.style.borderColor = "";
          copyJsonBtn.style.color = "";
        }, 1800);
      }).catch(err => {
        console.error("Clipboard copy failed:", err);
        alert("JSON output:\n\n" + jsonText);
      });
    });
  }

  if (sliceGrowBtn) {
    sliceGrowBtn.addEventListener('click', function () {
      const name = cultivarNameInput.value.trim() || "Mysterious Swamp Hybrid";
      const webpDataUrl = previewCanvas.toDataURL('image/webp', 0.9);
      const guestNumber = Math.floor(1000 + Math.random() * 9000);

      // generate self-contained item detail HTML for this newly bred onion. Let there be layers!
      const detailHtml = '<!DOCTYPE html>' +
        '<html lang="en">' +
        '<head>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<link rel="stylesheet" href="assets/css/item.css">' +
        '</head>' +
        '<body>' +
        '<div class="item-stage">' +
        '<img class="item-art" src="' + webpDataUrl + '" alt="' + name + '">' +
        '<h1>' + name + '</h1>' +
        '<p class="item-description">' +
        'Generated by guest ' + guestNumber + ', much is unknown about this onion. The layers will eventually be peeled back, all secrets laid bare to the world.' +
        '</p>' +
        '</div>' +
        '</body>' +
        '</html>';

      // convert into an inline data URI so it loads seamlessly into the modal iframe
      const itemDetailUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(detailHtml);

      // bonus: keep parallel arrays synced
      if (typeof itemNames !== "undefined" && typeof thumbnailUrls !== "undefined" && typeof itemUrls !== "undefined") {
        itemNames.push(name);
        thumbnailUrls.push(webpDataUrl);
        itemUrls.push(itemDetailUrl);

        const newIndex = itemNames.length - 1;
        const newCardHtml = '<a class="onion-card" href="' + itemUrls[newIndex] + '" title="Custom spliced allium hybrid">' +
          '<div class="thumbnail-wrapper">' +
          '<img class="onion-thumb" src="' + thumbnailUrls[newIndex] + '" alt="' + itemNames[newIndex] + '">' +
          '</div>' +
          '<span class="onion-caption">' + itemNames[newIndex] + '</span>' +
          '</a>';

        galleryContainer.innerHTML += newCardHtml;

        const cards = galleryContainer.querySelectorAll('.onion-card');
        const newlyAddedCard = cards[cards.length - 1];
        if (newlyAddedCard) {
          newlyAddedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          newlyAddedCard.style.borderColor = '#b1d65c';
          newlyAddedCard.style.transform = 'scale(1.05)';
          setTimeout(() => { newlyAddedCard.style.transform = ''; }, 400);
        }
      }
    });
  }

  updatePreview();
})();
