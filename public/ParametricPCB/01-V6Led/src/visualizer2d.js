import { React } from "../../00-commonParts/tscircuit-core.js";

// --- Custom 2D PCB Renderer (SVG-based, high performance, neon glows) ---
export function SVGPCBViewer({ circuitJson, boardWidth, boardHeight, onCentered }) {
  const pcbComponents = circuitJson.filter(e => e.type === "pcb_component");
  const pcbPads = circuitJson.filter(e => e.type === "pcb_smtpad");
  const pcbTraces = circuitJson.filter(e => e.type === "pcb_trace");
  const sourceTraces = circuitJson.filter(e => e.type === "source_trace");

  // Zoom and Drag Pan State for Interactive SVG Viewport
  const [transform, setTransform] = React.useState({ x: 0, y: 0, zoom: 1 });
  const [hasCentered, setHasCentered] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [hoveredItem, setHoveredItem] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });

  const scale = 5.5; 
  const padding = 15;
  const svgWidth = boardWidth * scale + padding * 2;
  const svgHeight = boardHeight * scale + padding * 2;

  const toSvgX = (mmX) => (mmX + boardWidth / 2) * scale + padding;
  const toSvgY = (mmY) => (-mmY + boardHeight / 2) * scale + padding;
  const toSvgDim = (mm) => mm * scale;

  // Zoom / Drag Events
  const onMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    }));
  };

  const onMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? transform.zoom * zoomFactor : transform.zoom / zoomFactor;
    setTransform(prev => ({
      ...prev,
      zoom: Math.max(0.3, Math.min(10, newZoom))
    }));
  };

  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const boardW_px = boardWidth * scale;
      const boardH_px = boardHeight * scale;
      const initX = (rect.width - boardW_px) / 2 - padding;
      const initY = (rect.height - boardH_px) / 2 - padding;
      
      // Temporarily disable transition during re-centering
      setHasCentered(false);
      setTransform({ x: initX, y: initY, zoom: 1 });
      
      // Let browser complete rendering layout, then re-enable transition for user drag/wheel events
      const timer = setTimeout(() => {
        setHasCentered(true);
      }, 50);

      if (onCentered) {
        onCentered();
      }

      return () => clearTimeout(timer);
    }
  }, [boardWidth, boardHeight, circuitJson]);

  return (
    React.createElement("div", { 
      className: "pcb-svg-container",
      ref: containerRef,
      onMouseDown: onMouseDown,
      onMouseMove: onMouseMove,
      onMouseUp: onMouseUpOrLeave,
      onMouseLeave: onMouseUpOrLeave,
      onWheel: onWheel,
      style: { position: "relative", width: "100%", height: "100%", cursor: isDragging ? "grabbing" : "grab", overflow: "hidden", userSelect: "none" }
    },
      React.createElement("svg", { 
        width: "100%", 
        height: "100%", 
        style: { 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`, 
          transformOrigin: "0 0", 
          transition: (isDragging || !hasCentered) ? "none" : "transform 0.1s ease-out",
          opacity: hasCentered ? 1 : 0
        }
      },
        // Glow layer filter
        React.createElement("defs", null,
          React.createElement("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" },
            React.createElement("feGaussianBlur", { stdDeviation: "1.5", result: "blur" }),
            React.createElement("feMerge", null,
              React.createElement("feMergeNode", { in: "blur" }),
              React.createElement("feMergeNode", { in: "SourceGraphic" })
            )
          )
        ),

        // 1. Render Board Substrate
        React.createElement("rect", {
          x: padding,
          y: padding,
          width: boardWidth * scale,
          height: boardHeight * scale,
          fill: "#051105",
          stroke: "#39ff14",
          strokeWidth: 1.5,
          rx: 4,
          opacity: 0.95
        }),

        // 2. Render Copper Traces
        pcbTraces.map((trace, idx) => {
          if (!trace.route || trace.route.length < 2) return null;
          
          const srcTrace = sourceTraces.find(st => st.source_trace_id === trace.source_trace_id);
          const netName = srcTrace?.name || "unknown net";
          
          return trace.route.slice(0, -1).map((pt1, i) => {
            const pt2 = trace.route[i + 1];
            if (pt1.x === undefined || pt2.x === undefined) return null;
            
            // Style layers and net colors differently (VCC = Red, DATA = Green, GND = Blue)
            const isTop = pt1.layer === "top";
            const lowerNet = netName.toLowerCase();
            let strokeColor = isTop ? "#34c759" : "#1e7e34"; // Default green for DATA
            
            if (lowerNet.includes("vcc") || lowerNet.includes("v5")) {
              strokeColor = isTop ? "#ff3b30" : "#b3261e";
            } else if (lowerNet.includes("gnd")) {
              strokeColor = isTop ? "#007aff" : "#0056b3";
            }
            
            const strokeDash = isTop ? "none" : "3,2";
            
            const hoverHandler = {
              onMouseEnter: () => {
                setHoveredItem({
                  title: `${netName} (Segment)`,
                  details: [
                    { label: "Layer", value: pt1.layer.toUpperCase() },
                    { label: "Width", value: `${trace.width || 0.3}mm` },
                    { label: "Start", value: `X: ${pt1.x.toFixed(2)}, Y: ${pt1.y.toFixed(2)}` },
                    { label: "End", value: `X: ${pt2.x.toFixed(2)}, Y: ${pt2.y.toFixed(2)}` }
                  ]
                });
              },
              onMouseMove: (e) => {
                const rect = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
                setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
              },
              onMouseLeave: () => setHoveredItem(null)
            };

            const lineProps = {
              x1: toSvgX(pt1.x),
              y1: toSvgY(pt1.y),
              x2: toSvgX(pt2.x),
              y2: toSvgY(pt2.y),
              stroke: strokeColor,
              strokeLinecap: "round",
              style: { cursor: "help" },
              ...hoverHandler
            };

            if (isTop) {
              return React.createElement("g", { key: `trace-${idx}-${i}` },
                React.createElement("line", {
                  ...lineProps,
                  strokeWidth: toSvgDim(trace.width || 0.3) * 2.5,
                  opacity: 0.35
                }),
                React.createElement("line", {
                  ...lineProps,
                  strokeWidth: toSvgDim(trace.width || 0.3)
                })
              );
            } else {
              return React.createElement("line", {
                ...lineProps,
                strokeWidth: toSvgDim(trace.width || 0.3),
                strokeDasharray: strokeDash,
                key: `trace-${idx}-${i}`
              });
            }
          });
        }),

        // 2.5. Render Breakaway Vias (Mousebites)
        circuitJson.filter(e => e.type === "pcb_via" && e.pcb_via_id?.startsWith("mb_via")).map((via, idx) => {
          const cx = toSvgX(via.x || 0);
          const cy = toSvgY(via.y || 0);
          const r = toSvgDim(via.hole_diameter / 2);
          
          return React.createElement("circle", {
            cx: cx,
            cy: cy,
            r: r,
            fill: "#000",
            stroke: "none",
            key: `mb-via-${idx}`
          });
        }),

        // 2.6. Render Standard Vias
        circuitJson.filter(e => e.type === "pcb_via" && !e.pcb_via_id?.startsWith("mb_via")).map((via, idx) => {
          const cx = toSvgX(via.x || 0);
          const cy = toSvgY(via.y || 0);
          const outerR = toSvgDim(via.outer_diameter / 2);
          const innerR = toSvgDim(via.hole_diameter / 2);
          
          const hoverHandler = {
            onMouseEnter: () => {
              setHoveredItem({
                title: "Via (Copper Connection)",
                details: [
                  { label: "Outer Diameter", value: `${via.outer_diameter}mm` },
                  { label: "Hole Diameter", value: `${via.hole_diameter}mm` },
                  { label: "Coordinates", value: `X: ${(via.x || 0).toFixed(2)}, Y: ${(via.y || 0).toFixed(2)}` }
                ]
              });
            },
            onMouseMove: (e) => {
              const rect = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
              setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
            },
            onMouseLeave: () => setHoveredItem(null)
          };

          return React.createElement("g", { key: `via-${idx}`, style: { cursor: "help" }, ...hoverHandler },
            React.createElement("circle", { cx: cx, cy: cy, r: outerR, fill: "#ccaa44" }),
            React.createElement("circle", { cx: cx, cy: cy, r: innerR, fill: "#111" })
          );
        }),

        // 2.7. Render Copper Pads
        pcbPads.map((pad, idx) => {
          if (pad.x === undefined || pad.y === undefined) return null;
          const cx = toSvgX(pad.x);
          const cy = toSvgY(pad.y);
          
          const hoverHandler = {
            onMouseEnter: () => {
              setHoveredItem({
                title: `SMT Pad (${pad.layer.toUpperCase()})`,
                details: [
                  { label: "Size", value: pad.shape === "rect" ? `${pad.width}x${pad.height}mm` : `${pad.radius * 2}mm` },
                  { label: "Coordinates", value: `X: ${pad.x.toFixed(2)}, Y: ${pad.y.toFixed(2)}` }
                ]
              });
            },
            onMouseMove: (e) => {
              const rect = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
              setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
            },
            onMouseLeave: () => setHoveredItem(null)
          };

          if (pad.shape === "rect") {
            const w = toSvgDim(pad.width);
            const h = toSvgDim(pad.height);
            return React.createElement("rect", {
              x: cx - w/2,
              y: cy - h/2,
              width: w,
              height: h,
              fill: "#ccaa44",
              stroke: "#eeddbb",
              strokeWidth: 0.5,
              key: `pad-${idx}`,
              style: { cursor: "help" },
              ...hoverHandler
            });
          } else {
            const r = toSvgDim(pad.radius || (pad.width / 2));
            return React.createElement("circle", {
              cx: cx,
              cy: cy,
              r: r,
              fill: "#ccaa44",
              stroke: "#eeddbb",
              strokeWidth: 0.5,
              key: `pad-${idx}`,
              style: { cursor: "help" },
              ...hoverHandler
            });
          }
        }),

        // 3. Render Components Outline & Labels
        (() => {
          const srcComps2D = circuitJson.filter(e => e.type === "source_component");
          return pcbComponents.map((comp, idx) => {
            const srcComp = srcComps2D.find(sc => sc.source_component_id === comp.source_component_id);
            const designator = srcComp?.name || comp.pcb_component_id || "";
            if (!designator || designator === "board") return null;
            
            const baseDesignator = designator.replace(/^R\d+_C\d+_/, "");
            const cx = toSvgX(comp.center?.x || 0);
            const cy = toSvgY(comp.center?.y || 0);
            
            const hoverComp = {
              onMouseEnter: () => {
                setHoveredItem({
                  title: designator,
                  details: [
                    { label: "Type", value: baseDesignator.startsWith("U") ? "WS2812B LED" : "Solder Header" },
                    { label: "Part Number", value: baseDesignator.startsWith("U") ? "WS2812B-3535" : "Custom-Pads" },
                    { label: "Coordinates", value: `X: ${(comp.center?.x || 0).toFixed(2)}, Y: ${(comp.center?.y || 0).toFixed(2)}` }
                  ]
                });
              },
              onMouseMove: (e) => {
                const rect = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
                setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
              },
              onMouseLeave: () => setHoveredItem(null)
            };
            
            if (baseDesignator.startsWith("U")) {
              // LED WS2812B-3535
              const size = toSvgDim(3.5);
              return React.createElement("g", { key: `comp-${idx}`, style: { cursor: "help" }, ...hoverComp },
                React.createElement("rect", {
                  x: cx - size/2,
                  y: cy - size/2,
                  width: size,
                  height: size,
                  fill: "#111",
                  stroke: "#39ff14",
                  strokeWidth: 2,
                  opacity: 0.9
                }),
                React.createElement("text", {
                  x: cx,
                  y: cy - size/2 - 3,
                  fill: "#39ff14",
                  fontSize: "7px",
                  textAnchor: "middle",
                  fontFamily: "monospace"
                }, baseDesignator),
                // Silkscreen pin labels on the 2D SVG
                React.createElement("text", { x: cx - size/2 - 2, y: cy - size/2 + 7, fill: "#fff", fontSize: "3.5px", textAnchor: "middle" }, "+"),
                React.createElement("text", { x: cx + size/2 + 2, y: cy - size/2 + 7, fill: "#fff", fontSize: "3.5px", textAnchor: "middle" }, "O"),
                React.createElement("text", { x: cx + size/2 + 2, y: cy + size/2 - 2, fill: "#fff", fontSize: "3.5px", textAnchor: "middle" }, "-"),
                React.createElement("text", { x: cx - size/2 - 2, y: cy + size/2 - 2, fill: "#fff", fontSize: "3.5px", textAnchor: "middle" }, "I")
              );
            } else if (baseDesignator.startsWith("SLOGAN") || baseDesignator.startsWith("LABEL") || baseDesignator.startsWith("J")) {
              return null;
            }
            return null;
          });
        })(),

        // Helper to resolve the real component designator (e.g. U1, J_MID1) from a physical ID
        (() => {
          const getComponentName = (pcbCompId) => {
            if (!pcbCompId) return "";
            const comp = pcbComponents.find(c => c.pcb_component_id === pcbCompId);
            if (!comp) return "";
            const srcComp = circuitJson.find(e => e.type === "source_component" && e.source_component_id === comp.source_component_id);
            return srcComp?.name || "";
          };

          return circuitJson.filter(e => {
            if (e.type !== "pcb_silkscreen_text") return false;
            if (e.pcb_component_id) {
              const name = getComponentName(e.pcb_component_id);
              const cleanName = name.replace(/^R\d+_C\d+_/, "");
              if (cleanName.startsWith("U") || cleanName.startsWith("J")) {
                return false; // Filter out footprint texts inside LEDs and solder headers
              }
            }
            return true;
          }).map((txt, idx) => {
          const cxRaw = txt.center?.x !== undefined ? txt.center.x : (txt.x || 0);
          const cyRaw = txt.center?.y !== undefined ? txt.center.y : (txt.y || 0);
          const cx = toSvgX(cxRaw);
          const cy = toSvgY(cyRaw);
          const rotation = txt.rotation || 0;
          return React.createElement("text", {
            x: cx,
            y: cy,
            transform: `rotate(${-rotation}, ${cx}, ${cy})`,
            fill: "rgba(255, 255, 255, 0.45)",
            fontSize: `${(txt.font_size || 0.6) * scale}px`,
            fontFamily: "monospace",
            textAnchor: "middle",
            dominantBaseline: "middle",
            key: `silk-txt-${idx}`
          }, txt.text);
        });
        })()
      ),
      
      // --- Hover Tooltip Display ---
      hoveredItem && React.createElement("div", {
        style: {
          position: "absolute",
          left: `${tooltipPos.x}px`,
          top: `${tooltipPos.y}px`,
          background: "rgba(10, 10, 15, 0.95)",
          border: "2px solid #ff007f",
          boxShadow: "0 0 10px rgba(255, 0, 127, 0.6)",
          padding: "8px 12px",
          borderRadius: "4px",
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: "11px",
          color: "#fff",
          pointerEvents: "none",
          zIndex: 100
        }
      },
        React.createElement("div", { style: { fontWeight: "bold", borderBottom: "1px solid #39ff14", paddingBottom: "3px", marginBottom: "4px", color: "#39ff14" } }, hoveredItem.title),
        hoveredItem.details.map((d, i) => React.createElement("div", { key: i, style: { margin: "2px 0" } },
          React.createElement("span", { style: { color: "#888", marginRight: "6px" } }, `${d.label}:`),
          React.createElement("span", { style: { color: "#eee" } }, d.value)
        ))
      ),
      
      // --- Floating Trace/Net Color Legend (Fixed bottom right) ---
      React.createElement("div", {
        style: {
          position: "absolute",
          bottom: "16px",
          right: "16px",
          background: "rgba(0, 0, 0, 0.85)",
          border: "2px solid #39ff14",
          boxShadow: "0 0 8px rgba(57, 255, 20, 0.4)",
          padding: "10px 14px",
          borderRadius: "4px",
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: "11px",
          color: "#fff",
          zIndex: 10,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        }
      },
        React.createElement("div", { style: { fontWeight: "bold", borderBottom: "1px solid #00f0ff", paddingBottom: "4px", marginBottom: "2px", color: "#00f0ff" } }, "NET ROUTING LEGEND"),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("span", { style: { display: "inline-block", width: "12px", height: "6px", background: "#ff3b30", borderRadius: "1px" } }),
          React.createElement("span", null, "VCC / 5V Power")
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("span", { style: { display: "inline-block", width: "12px", height: "6px", background: "#34c759", borderRadius: "1px" } }),
          React.createElement("span", null, "DATA / DIN / DOUT")
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("span", { style: { display: "inline-block", width: "12px", height: "6px", background: "#007aff", borderRadius: "1px" } }),
          React.createElement("span", null, "GND / Ground")
        )
      )
    )
  );
}

// --- Custom 2D Schematic Renderer (SVG-based) ---
export function SVGSchematicViewer({ circuitJson }) {
  const sourceComps = circuitJson.filter(e => e.type === "source_component");
  const leds = sourceComps.filter(c => c.name && c.name.startsWith("U"));

  // Calculate viewBox to fit all components
  const totalLeds = leds.length;
  const svgW = Math.max(800, totalLeds * 75 + 200);
  const svgH = 380;

  return (
    React.createElement("div", { className: "schematic-svg-container" },
      React.createElement("svg", { width: "100%", height: "100%", viewBox: `0 0 ${svgW} ${svgH}` },
        React.createElement("text", { x: svgW / 2, y: 30, fill: "#39ff14", fontSize: "16px", textAnchor: "middle", fontFamily: "monospace", fontWeight: "bold" }, "V6 LED STRIP SCHEMATIC"),

        // VCC Bus line
        React.createElement("line", { x1: 30, y1: 80, x2: svgW - 30, y2: 80, stroke: "#39ff14", strokeWidth: 2 }),
        React.createElement("text", { x: 10, y: 84, fill: "#39ff14", fontSize: "10px", fontFamily: "monospace" }, "VCC"),

        // GND Bus line
        React.createElement("line", { x1: 30, y1: 320, x2: svgW - 30, y2: 320, stroke: "#ff007f", strokeWidth: 2 }),
        React.createElement("text", { x: 10, y: 324, fill: "#ff007f", fontSize: "10px", fontFamily: "monospace" }, "GND"),

        // DATA Bus line
        React.createElement("line", { x1: 30, y1: 200, x2: svgW - 30, y2: 200, stroke: "#00f0ff", strokeWidth: 1.5, strokeDasharray: "4,3" }),
        React.createElement("text", { x: 10, y: 204, fill: "#00f0ff", fontSize: "10px", fontFamily: "monospace" }, "DATA"),

        // Render LEDs
        leds.map((led, idx) => {
          const x = 80 + idx * 70;
          const y = 120;
          return React.createElement("g", { key: `led-${idx}` },
            // LED body
            React.createElement("rect", { x: x, y: y, width: 50, height: 70, fill: "#111", stroke: "#00f0ff", strokeWidth: 2, rx: 3 }),
            React.createElement("text", { x: x + 25, y: y + 30, fill: "#39ff14", fontSize: "10px", textAnchor: "middle", fontFamily: "monospace", fontWeight: "bold" }, led.name),
            React.createElement("text", { x: x + 25, y: y + 48, fill: "#ff007f", fontSize: "7px", textAnchor: "middle", fontFamily: "monospace" }, "WS2812B"),

            // Pin labels
            React.createElement("text", { x: x + 5, y: y + 15, fill: "#39ff14", fontSize: "6px", fontFamily: "monospace" }, "VDD"),
            React.createElement("text", { x: x + 35, y: y + 15, fill: "#00f0ff", fontSize: "6px", fontFamily: "monospace" }, "DOUT"),
            React.createElement("text", { x: x + 5, y: y + 65, fill: "#00f0ff", fontSize: "6px", fontFamily: "monospace" }, "DIN"),
            React.createElement("text", { x: x + 35, y: y + 65, fill: "#ff007f", fontSize: "6px", fontFamily: "monospace" }, "GND"),

            // VCC connection (up to bus)
            React.createElement("line", { x1: x + 10, y1: y, x2: x + 10, y2: 80, stroke: "#39ff14", strokeWidth: 1 }),
            // GND connection (down to bus)
            React.createElement("line", { x1: x + 40, y1: y + 70, x2: x + 40, y2: 320, stroke: "#ff007f", strokeWidth: 1 }),
            // DIN connection (from left bus)
            React.createElement("line", { x1: x, y1: y + 55, x2: x - 5, y2: 200, stroke: "#00f0ff", strokeWidth: 1 }),
            // DOUT connection (to right bus)
            idx < leds.length - 1 ? React.createElement("line", { x1: x + 50, y1: y + 10, x2: x + 55, y2: 200, stroke: "#00f0ff", strokeWidth: 1 }) : null
          );
        })
      )
    )
  );
}
