// Detect page-specific Kit configuration or default to Workshop Kit
const CONFIG = window.KIT_CONFIG || {
  bomUrl: "https://dillonsimeone.com/Projects/Haxel/workshop_kit_bom.html",
  totalTags: 22,
  tagsPerWorkspace: 6,
  instructionText: "To recharge LiPo:\nToggle switch ON,\nthen plug in\nUSB-C cable.",
  tagPrefix: "HAXEL",
  zipFilename: "HAXEL_WorkshopKit_Laser_xTool_Package.zip"
};

const BOM_URL = CONFIG.bomUrl;
const TOTAL_TAGS = CONFIG.totalTags;
const TAGS_PER_WORKSPACE = CONFIG.tagsPerWorkspace;
const INSTRUCTION_TEXT = CONFIG.instructionText;

function init() {
  const root = document.getElementById("workspaces-root");
  let currentWorkspace = null;

  for (let i = 0; i < TOTAL_TAGS; i++) {
    if (i % TAGS_PER_WORKSPACE === 0) {
      const wsId = Math.floor(i / TAGS_PER_WORKSPACE) + 1;
      const card = document.createElement("div");
      card.className = "workspace-card";
      
      const header = document.createElement("div");
      header.className = "workspace-header";
      header.innerHTML = `<span>Workspace Bed #${wsId}</span><span style="font-size: 0.8rem; opacity: 0.8;">4x4" xTool F1</span>`;
      card.appendChild(header);

      currentWorkspace = document.createElement("div");
      currentWorkspace.className = "workspace";
      currentWorkspace.id = `workspace-${wsId}`;
      card.appendChild(currentWorkspace);

      root.appendChild(card);
    }

    const tagNum = String(i).padStart(2, '0');
    const tagName = `${CONFIG.tagPrefix || 'HAXEL'}-${tagNum}`;

    const tagEl = document.createElement("div");
    tagEl.className = "qr-tag";
    tagEl.id = `tag-${i}`;

    const qrContainer = document.createElement("div");
    qrContainer.className = "qr-canvas-container";
    qrContainer.id = `qrcode-${i}`;

    const titleEl = document.createElement("div");
    titleEl.className = "tag-title";
    titleEl.innerText = tagName;

    const instrEl = document.createElement("div");
    instrEl.className = "tag-instructions";
    instrEl.style.whiteSpace = "pre-line";
    instrEl.innerText = INSTRUCTION_TEXT;

    tagEl.appendChild(qrContainer);
    tagEl.appendChild(titleEl);
    tagEl.appendChild(instrEl);

    currentWorkspace.appendChild(tagEl);

    // Generate high-resolution QR code
    window.qrInstances = window.qrInstances || [];
    const qrObj = new QRCode(qrContainer, {
      text: BOM_URL,
      width: 120,
      height: 120,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
    window.qrInstances.push(qrObj);
  }
}

// Generate single workspace SVG string
function generateWorkspaceSVG(wsId) {
  const wsEl = document.getElementById(`workspace-${wsId}`);
  if (!wsEl) return null;
  
  const tags = wsEl.querySelectorAll('.qr-tag');
  
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="101.6mm" height="101.6mm" viewBox="0 0 101.6 101.6">\n`;
  svgContent += `  <!-- 4x4 inch xTool F1 Workspace Boundary (101.6mm x 101.6mm) -->\n`;
  svgContent += `  <rect width="101.6" height="101.6" fill="none" stroke="#e0e0e0" stroke-width="0.2"/>\n`;

  tags.forEach((tag, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);

    const tagW = 30; // mm
    const tagH = 40; // mm
    const marginX = 2.8; // mm
    const marginY = 5.8; // mm

    const originX = marginX + col * (tagW + 2);
    const originY = marginY + row * (tagH + 4);

    const titleText = tag.querySelector('.tag-title').innerText;
    
    // Cut line border for 30x40mm tag
    svgContent += `  <g id="Tag_${titleText}" transform="translate(${originX.toFixed(2)}, ${originY.toFixed(2)})">\n`;
    svgContent += `    <!-- Outer Cut Line (30mm x 40mm) -->\n`;
    svgContent += `    <rect width="30" height="40" rx="2" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n`;

    // Engrave Text: Title
    svgContent += `    <!-- Engrave Text -->\n`;
    svgContent += `    <text x="15" y="23.2" font-family="Arial" font-size="3.0" font-weight="bold" text-anchor="middle" fill="#000000">${titleText}</text>\n`;
    
    // Line under title (HAXEL-XX)
    svgContent += `    <line x1="4" y1="24.2" x2="26" y2="24.2" stroke="#000000" stroke-width="0.3"/>\n`;

    // Instruction text: 4 shorter lines to allow 1.6mm font size (much larger & highly readable)
    svgContent += `    <text x="15" y="27.5" font-family="Arial" font-size="1.6" font-weight="bold" text-anchor="middle" fill="#000000">To recharge LiPo:</text>\n`;
    svgContent += `    <text x="15" y="30.5" font-family="Arial" font-size="1.6" font-weight="bold" text-anchor="middle" fill="#000000">Toggle switch ON,</text>\n`;
    svgContent += `    <text x="15" y="33.5" font-family="Arial" font-size="1.6" font-weight="bold" text-anchor="middle" fill="#000000">then plug in</text>\n`;
    svgContent += `    <text x="15" y="36.5" font-family="Arial" font-size="1.6" font-weight="bold" text-anchor="middle" fill="#000000">USB-C cable.</text>\n`;

    // Extract QR code matrix modules (18x18mm QR code, top margin 1.0mm)
    const qrObj = window.qrInstances ? window.qrInstances[idx] : null;
    if (qrObj && qrObj._oQRCode) {
      const moduleCount = qrObj._oQRCode.moduleCount;
      const qrSize = 18; 
      const moduleSize = qrSize / moduleCount; 
      const startX = (30 - qrSize) / 2; // 6mm margin
      const startY = 1.0; // 1mm top margin
      let pathD = "";

      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qrObj._oQRCode.isDark(r, c)) {
            const mx = (startX + c * moduleSize).toFixed(2);
            const my = (startY + r * moduleSize).toFixed(2);
            const ms = (moduleSize + 0.02).toFixed(2);
            pathD += `M${mx},${my}h${ms}v${ms}h-${ms}z `;
          }
        }
      }

      svgContent += `    <!-- Vector QR Code -->\n`;
      svgContent += `    <path d="${pathD}" fill="#000000" stroke="none"/>\n`;
    }

    svgContent += `  </g>\n`;
  });

  svgContent += `</svg>`;
  return svgContent;
}

// Generate high-resolution PNG image of a workspace bed (for ultra-fast xTool laser rastering)
function generateWorkspacePNG(wsId) {
  return new Promise((resolve) => {
    const wsEl = document.getElementById(`workspace-${wsId}`);
    if (!wsEl) return resolve(null);

    // Create a 300 DPI high-res canvas (4x4 inch = 1200x1200px)
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1200, 1200);

    const tags = wsEl.querySelectorAll('.qr-tag');
    let loadedImages = 0;
    const totalTags = tags.length;

    if (totalTags === 0) return resolve(null);

    tags.forEach((tag, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);

      const pxPerMM = 1200 / 101.6;

      const tagW = 30 * pxPerMM;
      const tagH = 40 * pxPerMM;
      const marginX = 2.8 * pxPerMM;
      const marginY = 5.8 * pxPerMM;

      const originX = marginX + col * (32 * pxPerMM);
      const originY = marginY + row * (44 * pxPerMM);

      const titleText = tag.querySelector('.tag-title').innerText;
      const qrImg = tag.querySelector('img') || tag.querySelector('canvas');

      const drawTagContent = (imgSource) => {
        // QR image centered at top (18x18mm)
        const qrSize = 18 * pxPerMM;
        const qrX = originX + (6.0 * pxPerMM);
        const qrY = originY + (1.0 * pxPerMM);

        if (imgSource) {
          ctx.drawImage(imgSource, qrX, qrY, qrSize, qrSize);
        }

        // Title text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(titleText, originX + (tagW / 2), originY + (23.2 * pxPerMM));

        // Line under title (HAXEL-XX)
        ctx.beginPath();
        ctx.moveTo(originX + (4 * pxPerMM), originY + (24.2 * pxPerMM));
        ctx.lineTo(originX + (26 * pxPerMM), originY + (24.2 * pxPerMM));
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // 4 Short, Large & Legible Instruction lines
        ctx.font = 'bold 19px Arial';
        ctx.fillText('To recharge LiPo:', originX + (tagW / 2), originY + (27.5 * pxPerMM));
        ctx.fillText('Toggle switch ON,', originX + (tagW / 2), originY + (30.5 * pxPerMM));
        ctx.fillText('then plug in', originX + (tagW / 2), originY + (33.5 * pxPerMM));
        ctx.fillText('USB-C cable.', originX + (tagW / 2), originY + (36.5 * pxPerMM));

        loadedImages++;
        if (loadedImages === totalTags) {
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }
      };

      if (qrImg instanceof HTMLImageElement) {
        if (qrImg.complete) {
          drawTagContent(qrImg);
        } else {
          qrImg.onload = () => drawTagContent(qrImg);
        }
      } else {
        drawTagContent(qrImg);
      }
    });
  });
}

// Generate vector SVG containing ONLY cut-lines (super fast loading)
function generateWorkspaceCutSVG(wsId) {
  const wsEl = document.getElementById(`workspace-${wsId}`);
  if (!wsEl) return null;
  const tags = wsEl.querySelectorAll('.qr-tag');
  
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="101.6mm" height="101.6mm" viewBox="0 0 101.6 101.6">\n`;
  svgContent += `  <!-- 4x4 inch Outer Cut Lines (Red = Cut) -->\n`;

  tags.forEach((tag, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);

    const marginX = 2.8;
    const marginY = 5.8;

    const originX = marginX + col * (30 + 2);
    const originY = marginY + row * (40 + 4);
    const titleText = tag.querySelector('.tag-title').innerText;

    svgContent += `  <rect id="Cut_${titleText}" x="${originX.toFixed(2)}" y="${originY.toFixed(2)}" width="30" height="40" rx="2" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n`;
  });

  svgContent += `</svg>`;
  return svgContent;
}

// Export ZIP containing PNGs for raster engraving + SVGs for line cutting
async function exportZipSVG() {
  const totalWorkspaces = Math.ceil(TOTAL_TAGS / TAGS_PER_WORKSPACE);
  const zip = new JSZip();
  const folderPNG = zip.folder("1_Engrave_PNGs");
  const folderSVG = zip.folder("2_CutLines_SVGs");
  const folderCombined = zip.folder("3_Combined_Vector_SVGs");

  for (let w = 1; w <= totalWorkspaces; w++) {
    // 1. High-res raster PNG for instant engraving in xTool
    const pngBlob = await generateWorkspacePNG(w);
    if (pngBlob) {
      folderPNG.file(`Bed_${w}_Engrave.png`, pngBlob);
    }

    // 2. Cut-only SVG
    const cutSvg = generateWorkspaceCutSVG(w);
    if (cutSvg) {
      folderSVG.file(`Bed_${w}_CutLines.svg`, cutSvg);
    }

    // 3. Combined Vector SVG
    const combinedSvg = generateWorkspaceSVG(w);
    if (combinedSvg) {
      folderCombined.file(`Bed_${w}_Combined.svg`, combinedSvg);
    }
  }

  const zipContent = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipContent);
  const a = document.createElement('a');
  a.href = url;
  a.download = "HAXEL_WorkshopKit_Laser_xTool_Package.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.onload = init;
