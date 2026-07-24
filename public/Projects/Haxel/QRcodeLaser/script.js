const BOM_URL = "https://dillonsimeone.com/Projects/Haxel/workshop_kit_bom.html";
const TOTAL_TAGS = 22;
const INSTRUCTION_TEXT = "To recharge when LIPO is added, toggle switch to ON then plug usb-c in.";
const TAGS_PER_WORKSPACE = 6;

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
    const tagName = `HAXEL-${tagNum}`;

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
    instrEl.innerText = INSTRUCTION_TEXT;

    tagEl.appendChild(qrContainer);
    tagEl.appendChild(titleEl);
    tagEl.appendChild(instrEl);

    currentWorkspace.appendChild(tagEl);

    // Generate high-resolution QR code
    new QRCode(qrContainer, {
      text: BOM_URL,
      width: 120,
      height: 120,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
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
    const qrCanvas = tag.querySelector('canvas');
    
    // Cut line border for 30x40mm tag
    svgContent += `  <g id="Tag_${titleText}" transform="translate(${originX.toFixed(2)}, ${originY.toFixed(2)})">\n`;
    svgContent += `    <!-- Outer Cut Line (30mm x 40mm) -->\n`;
    svgContent += `    <rect width="30" height="40" rx="2" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n`;

    // Engrave Text: Title
    svgContent += `    <!-- Engrave Text -->\n`;
    svgContent += `    <text x="15" y="24" font-family="monospace" font-size="2.8" font-weight="bold" text-anchor="middle" fill="#000000">${titleText}</text>\n`;
    
    // Instruction text lines
    svgContent += `    <text x="15" y="28.5" font-family="sans-serif" font-size="1.2" font-weight="bold" text-anchor="middle" fill="#000000">To recharge when LIPO is added,</text>\n`;
    svgContent += `    <text x="15" y="30.5" font-family="sans-serif" font-size="1.2" font-weight="bold" text-anchor="middle" fill="#000000">toggle switch to ON</text>\n`;
    svgContent += `    <text x="15" y="32.5" font-family="sans-serif" font-size="1.2" font-weight="bold" text-anchor="middle" fill="#000000">then plug usb-c in.</text>\n`;

    // QR Code vector conversion
    if (qrCanvas) {
      const ctx = qrCanvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const data = imgData.data;
      const size = qrCanvas.width;
      const moduleSize = 18 / size; // Scale QR to 18x18mm centered at top (x=6mm, y=3mm)

      svgContent += `    <!-- QR Code Engrave Vector Modules -->\n`;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const index = (y * size + x) * 4;
          const r = data[index];
          if (r < 128) {
            const mx = (6 + x * moduleSize).toFixed(3);
            const my = (3 + y * moduleSize).toFixed(3);
            const ms = moduleSize.toFixed(3);
            svgContent += `    <rect x="${mx}" y="${my}" width="${ms}" height="${ms}" fill="#000000"/>\n`;
          }
        }
      }
    }

    svgContent += `  </g>\n`;
  });

  svgContent += `</svg>`;
  return svgContent;
}

// Zip and export all workspace SVG files into a single zip archive
async function exportZipSVG() {
  const totalWorkspaces = Math.ceil(TOTAL_TAGS / TAGS_PER_WORKSPACE);
  const zip = new JSZip();
  const folder = zip.folder("HAXEL_Workshop_Kit_Laser_SVGs");

  for (let w = 1; w <= totalWorkspaces; w++) {
    const svgData = generateWorkspaceSVG(w);
    if (svgData) {
      folder.file(`WorkshopKit_LaserQR_Bed_${w}.svg`, svgData);
    }
  }

  const zipContent = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipContent);
  const a = document.createElement('a');
  a.href = url;
  a.download = "HAXEL_WorkshopKit_LaserQR_SVGs.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.onload = init;
