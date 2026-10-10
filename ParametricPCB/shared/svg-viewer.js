/**
 * Parametric PCB Suite - Shared Interactive 2D SVG Viewer
 * Provides:
 * 1. Pan & Zoom (Mouse Drag, Wheel, Pinch) with SVG group transformations
 * 2. Interactive Hover Tooltips for Traces (Net, From, To, Layer, Seg Length, Total Length, Width)
 * 3. Interactive Hover Tooltips for Pads/Holes (Component, Pin, Function, Net, Traces To, Size, Drill)
 * 4. Net Highlighting across all copper segments and connected pads
 */

export function extractPoint(pt) {
  if (!pt) return null;
  const x = pt.x ?? pt.start?.x ?? pt.end?.x;
  const y = pt.y ?? pt.start?.y ?? pt.end?.y;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y, layer: pt.layer || "top" };
}

/**
 * Initializes pan, zoom, and interactive hover tooltips on a 2D SVG container.
 */
export function setupInteractiveSvg(options = {}) {
  const {
    container,
    tooltipElement,
    viewportGroupId = "svg-viewport-group",
    minScale = 0.3,
    maxScale = 8.0,
    zoomStep = 1.15
  } = options;

  if (!container) return null;

  const tooltip = tooltipElement || document.getElementById("pcb-2d-tooltip");
  const transform = { x: 0, y: 0, scale: 1.0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  function applyTransform() {
    const g = document.getElementById(viewportGroupId);
    if (g) {
      g.setAttribute("transform", `translate(${transform.x + 100}, ${transform.y + 20}) scale(${transform.scale})`);
    }
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove("active");
    clearNetHighlights();
  }

  function updateTooltipPosition(e) {
    if (!tooltip || !tooltip.classList.contains("active")) return;
    const parent = tooltip.parentElement || container;
    const rect = parent.getBoundingClientRect();
    const x = e.clientX - rect.left + 15;
    const y = e.clientY - rect.top + 15;
    const tipWidth = tooltip.offsetWidth || 280;
    const tipHeight = tooltip.offsetHeight || 180;
    const maxX = rect.width - tipWidth - 15;
    const maxY = rect.height - tipHeight - 15;

    tooltip.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
  }

  function highlightNet(netName) {
    clearNetHighlights();
    if (!netName || netName === "UNROUTED" || netName === "None" || netName === "NC" || netName === "Unrouted") return;
    try {
      const escaped = CSS.escape(netName);
      container.querySelectorAll(`.pcb-trace[data-net="${escaped}"]`).forEach(el => el.classList.add("net-hovered"));
      container.querySelectorAll(`[data-comp][data-net="${escaped}"]`).forEach(el => {
        el.classList.add("net-hovered");
        const circ = el.querySelector("circle");
        if (circ) circ.classList.add("net-hovered");
        const rect = el.querySelector("rect");
        if (rect) rect.classList.add("net-hovered");
      });
    } catch (_) {}
  }

  function clearNetHighlights() {
    container.querySelectorAll(".net-hovered").forEach(el => el.classList.remove("net-hovered"));
  }

  // Wheel Zoom
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? zoomStep : (1 / zoomStep);
    transform.scale = Math.min(Math.max(transform.scale * factor, minScale), maxScale);
    applyTransform();
    hideTooltip();
  }, { passive: false });

  // Mouse Drag / Pan
  container.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isDragging = true;
      dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      container.style.cursor = "grabbing";
      hideTooltip();
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      transform.x = e.clientX - dragStart.x;
      transform.y = e.clientY - dragStart.y;
      applyTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      container.style.cursor = "default";
    }
  });

  // Interactive Hover Inspection (Traces & Pads)
  container.addEventListener("mousemove", (e) => {
    if (isDragging) {
      hideTooltip();
      return;
    }

    // 1. Trace Hover
    const traceEl = e.target.closest(".pcb-trace");
    if (traceEl) {
      const net = traceEl.getAttribute("data-net") || "TRACE";
      const layer = traceEl.getAttribute("data-layer") || "TOP";
      const segLen = traceEl.getAttribute("data-seg-len") || "0";
      const netLen = traceEl.getAttribute("data-net-len") || "0";
      const from = decodeURIComponent(traceEl.getAttribute("data-from") || "Pad");
      const to = decodeURIComponent(traceEl.getAttribute("data-to") || "Pad");
      const width = traceEl.getAttribute("data-width") || "0.25mm";

      if (tooltip) {
        tooltip.innerHTML = `
          <div class="tooltip-header">⚡ Copper Trace Net: ${net}</div>
          <div class="tooltip-row"><span class="tooltip-label">Net Name:</span><span class="tooltip-val val-cyan">${net}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Traces From:</span><span class="tooltip-val">${from}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Traces To:</span><span class="tooltip-val">${to}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Layer:</span><span class="tooltip-val ${layer.includes('TOP') ? 'val-pink' : 'val-cyan'}">${layer}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Segment Length:</span><span class="tooltip-val">${segLen} mm</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Total Net Length:</span><span class="tooltip-val val-lime">${netLen} mm</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Trace Width:</span><span class="tooltip-val">${width}</span></div>
        `;
        tooltip.classList.add("active");
        updateTooltipPosition(e);
      }
      highlightNet(net);
      return;
    }

    // 2. Pad or Plated Hole Hover
    const padGroup = e.target.closest("[data-comp]");
    if (padGroup) {
      const comp = padGroup.getAttribute("data-comp") || "";
      const pin = padGroup.getAttribute("data-pin") || "";
      const func = padGroup.getAttribute("data-func") || "";
      const net = padGroup.getAttribute("data-net") || "";
      const netLen = padGroup.getAttribute("data-net-len") || "0";
      const connected = decodeURIComponent(padGroup.getAttribute("data-connected") || "");
      const x = padGroup.getAttribute("data-x") || "0";
      const y = padGroup.getAttribute("data-y") || "0";
      const drill = padGroup.getAttribute("data-drill");
      const padSize = padGroup.getAttribute("data-size") || padGroup.getAttribute("data-pad");

      const isUnrouted = !net || net === "UNROUTED" || net === "None" || net === "NC" || net === "Unrouted";
      const netDisplay = isUnrouted ? "Unrouted / Isolated (NC)" : net;

      if (tooltip) {
        tooltip.innerHTML = `
          <div class="tooltip-header">📍 ${comp} > ${pin}: ${func}</div>
          <div class="tooltip-row"><span class="tooltip-label">Component:</span><span class="tooltip-val val-orange">${comp}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Pin Function:</span><span class="tooltip-val val-lime">${func}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Net Assignment:</span><span class="tooltip-val val-cyan">${netDisplay}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Traces To:</span><span class="tooltip-val">${connected && connected !== 'None' ? connected : 'None'}</span></div>
          ${!isUnrouted && parseFloat(netLen) > 0 ? `<div class="tooltip-row"><span class="tooltip-label">Total Net Length:</span><span class="tooltip-val val-lime">${netLen} mm</span></div>` : ''}
          <div class="tooltip-row"><span class="tooltip-label">Coordinates:</span><span class="tooltip-val">X: ${x}mm, Y: ${y}mm</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Pad Details:</span><span class="tooltip-val">${padSize}${drill ? ` (${drill} drill)` : ''}</span></div>
        `;
        tooltip.classList.add("active");
        updateTooltipPosition(e);
      }
      if (!isUnrouted) highlightNet(net);
      return;
    }

    hideTooltip();
  });

  container.addEventListener("mouseout", (e) => {
    const related = e.relatedTarget;
    if (!related || !container.contains(related)) {
      hideTooltip();
    }
  });

  return {
    transform,
    applyTransform,
    resetView() {
      transform.x = 0;
      transform.y = 0;
      transform.scale = 1.0;
      applyTransform();
    }
  };
}
