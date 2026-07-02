import { React } from "../../00-commonParts/tscircuit-core.js";
const { useState, useEffect, useRef } = React;
import { appState } from "./state.js";
import { compileCircuit, generateBOM, generatePNP, generateGerbers, panelizeCircuitJson, runManufacturingDrc } from "./circuit.js";
import { applySlogansForState, DEFAULT_SLOGAN_PHRASES, resolveSloganPhrases } from "../../00-commonParts/slogan.js";
import { SVGPCBViewer, SVGSchematicViewer } from "./visualizer2d.js";
import { logDebug } from "./debug.js";
import { drcItemText, drcItemRefs } from "./drc-highlight.js";
import { TSCIRCUIT_BOARD_PARAM_DEFS, DRC_CHECK_PARAM_DEFS, parseRoutingInputs, routingInputsFromState } from "./pcb-rules.js";

function drcHighlightFromItem(item) {
  if (!item) return null;
  return { text: drcItemText(item), refs: drcItemRefs(item) };
}

function renderRoutingParamRow(def, idx, routingInputs, setRoutingInputs) {
  return React.createElement("div", {
    key: def.key,
    className: `slider-group routing-param-row${idx > 0 ? " slider-group-spaced" : ""}`
  },
    React.createElement("div", { className: "slider-labels" },
      React.createElement("span", null, def.label),
      React.createElement("span", { className: "val-glow" }, def.unit)
    ),
    React.createElement("input", {
      type: "number",
      className: "param-input routing-input",
      min: def.min,
      max: def.max,
      step: def.step,
      value: routingInputs[def.key] ?? "",
      onChange: (e) => setRoutingInputs((prev) => ({
        ...prev,
        [def.key]: e.target.value
      }))
    })
  );
}

function drcListPreview(text, maxLen = 72) {
  const s = String(text ?? "");
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function renderDrcListItem(item, className, key, setDrcHighlight) {
  const fullText = drcItemText(item);
  return React.createElement("li", {
    key,
    className: `drc-item ${className}`,
    title: fullText,
    onMouseEnter: () => setDrcHighlight(drcHighlightFromItem(item)),
    onMouseLeave: () => setDrcHighlight(null)
  }, drcListPreview(fullText));
}

export function PCBStudioApp() {
  const [state, setState] = useState(appState.getState());
  const [isCentered, setIsCentered] = useState(false);
  const [isThreeLoaded, setIsThreeLoaded] = useState(false);
  const threeRef = useRef(null);
  const threeInstanceRef = useRef(null);
  const compileOverlayRef = useRef(null);

  const showCompileOverlay = (mode = "compile") => {
    if (compileOverlayRef.current) {
      compileOverlayRef.current.classList.add("is-visible");
      compileOverlayRef.current.classList.toggle("slogan-mode", mode === "slogan");
    }
  };

  const setOverlayMessage = (message) => {
    if (compileOverlayRef.current) {
      const label = compileOverlayRef.current.querySelector(".vaporwave-text");
      if (label) label.textContent = message;
    }
  };

  const hideCompileOverlay = () => {
    if (compileOverlayRef.current) {
      compileOverlayRef.current.classList.remove("is-visible", "slogan-mode");
    }
    setOverlayMessage("Compiling Project...");
  };

  // Yield until the overlay has been painted, then run work on the next frame
  const afterOverlayPaint = (fn) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(fn);
    });
  };

  logDebug(`[Click Timing] PCBStudioApp rendered (showView: ${state.showView}) at ${performance.now().toFixed(1)}ms`);

  // Local draft states for inputs
  const [ledCountInput, setLedCountInput] = useState(state.ledCount);
  const [spacingInput, setSpacingInput] = useState(state.spacing);
  const [useMouseBitesInput, setUseMouseBitesInput] = useState(state.useMouseBites);
  const [panelRowsInput, setPanelRowsInput] = useState(state.panelRows);
  const [panelColsInput, setPanelColsInput] = useState(state.panelCols);
  const [sloganPhrasesInput, setSloganPhrasesInput] = useState(
    () => resolveSloganPhrases(state.sloganPhrases)
  );
  const [sloganCountInput, setSloganCountInput] = useState(state.sloganCount);
  const [isUpdatingSlogans, setIsUpdatingSlogans] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingInputs, setRoutingInputs] = useState(() => routingInputsFromState(state.routing));
  const [drcHighlight, setDrcHighlight] = useState(null);
  const [drc3dPopup, setDrc3dPopup] = useState(null);

  useEffect(() => {
    const unsub = appState.subscribe((newState) => {
      setState(newState);
    });
    // Trigger initial compilation
    triggerCompilation();
    return unsub;
  }, []);

  // Sync draft inputs if state changes from elsewhere
  useEffect(() => {
    setLedCountInput(state.ledCount);
    setSpacingInput(state.spacing);
    setUseMouseBitesInput(state.useMouseBites);
    setPanelRowsInput(state.panelRows);
    setPanelColsInput(state.panelCols);
    setSloganPhrasesInput(resolveSloganPhrases(state.sloganPhrases));
    setSloganCountInput(state.sloganCount);
    setRoutingInputs(routingInputsFromState(state.routing));
  }, [state.ledCount, state.spacing, state.useMouseBites, state.panelRows, state.panelCols, state.sloganPhrases, state.sloganCount, state.routing]);

  // Initialize and update the 3D viewport in the background as soon as 2D view reports centering is complete
  useEffect(() => {
    if (!threeRef.current || !state.circuitJson) return;
    // On first load, wait for 2D centering before starting the heavy 3D build
    if (!isCentered && !threeInstanceRef.current) return;

    (async () => {
      logDebug(`[3D Background Init] Dynamically importing visualizer3d.js...`);
      const { initThreeJS } = await import("./visualizer3d.js");
      logDebug(`[3D Background Init] Triggering initThreeJS in background at ${performance.now().toFixed(1)}ms`);
      initThreeJS(threeRef.current, state, threeInstanceRef, () => {
        logDebug(`[3D Build Timing] 3D Model loaded fully!`);
        setIsThreeLoaded(true);
      });
    })();
  }, [isCentered, state.circuitJson]);

  // Adjust camera aspect ratio and viewport size when tab transitions to active 3D view
  useEffect(() => {
    if (state.showView === "3d" && threeInstanceRef.current) {
      const { resizeHandler } = threeInstanceRef.current;
      if (resizeHandler) {
        logDebug(`[3D Tab Transition] Updating viewport dimensions on tab switch at ${performance.now().toFixed(1)}ms`);
        resizeHandler();
      }
    }
  }, [state.showView]);

  // DRC hover highlight in 3D view (markers + tracked popup position)
  useEffect(() => {
    if (!drcHighlight || state.showView !== "3d" || !state.circuitJson) {
      setDrc3dPopup(null);
      import("./visualizer3d.js").then(({ clearDrcHighlight }) => clearDrcHighlight(threeInstanceRef));
      return;
    }

    let rafId;
    let cancelled = false;

    (async () => {
      const { applyDrcHighlight, getDrcHighlightScreen } = await import("./visualizer3d.js");
      if (cancelled) return;
      applyDrcHighlight(threeInstanceRef, drcHighlight, state.circuitJson);

      const tick = () => {
        const screen = getDrcHighlightScreen(threeInstanceRef);
        if (screen) {
          setDrc3dPopup(screen);
        } else {
          setDrc3dPopup(null);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      setDrc3dPopup(null);
      import("./visualizer3d.js").then(({ clearDrcHighlight }) => clearDrcHighlight(threeInstanceRef));
    };
  }, [drcHighlight, state.showView, state.circuitJson]);

  // Clean up WebGL context on component unmount
  useEffect(() => {
    return () => {
      import("./visualizer3d.js").then(({ destroyThreeJS }) => {
        destroyThreeJS(null, threeInstanceRef);
      });
    };
  }, []);

  const runCompilation = async () => {
    try {
      const curState = appState.getState();
      
      // Compile single board layout
      const circuit = await compileCircuit({
        ledCount: curState.ledCount,
        spacing: curState.spacing,
        boardWidth: curState.boardWidth,
        boardHeight: curState.boardHeight,
        routing: curState.routing
      });
      let circuitJson = circuit.getCircuitJson();
      
      // Instantly panelize if enabled
      if (curState.useMouseBites) {
        circuitJson = panelizeCircuitJson(circuitJson, {
          boardWidth: curState.boardWidth,
          boardHeight: curState.boardHeight,
          panelRows: curState.panelRows,
          panelCols: curState.panelCols
        });
      }

      // Stamp silkscreen slogans once copper/layout is ready
      const sloganResult = await applySlogansForState(circuitJson, curState);
      circuitJson = sloganResult.circuitJson;

      const drc = runManufacturingDrc(circuitJson, curState.routing);
      
      appState.updateState({
        circuitJson,
        sloganPlacedCount: sloganResult.placedCount,
        sloganAttemptedCount: sloganResult.attemptedCount,
        drcOk: drc.ok,
        drcErrors: drc.errors,
        drcWarnings: drc.warnings,
        bomCsv: generateBOM(circuitJson),
        pnpCsv: generatePNP(circuitJson),
        gerberZip: true, // Enabled for on-demand generation on click
        isCompiling: false
      });
    } catch (err) {
      console.error(err);
      appState.updateState({ isCompiling: false, error: err.message });
    } finally {
      hideCompileOverlay();
    }
  };

  const triggerCompilation = () => {
    showCompileOverlay();
    afterOverlayPaint(() => {
      appState.updateState({ isCompiling: true, error: null });
      void runCompilation();
    });
  };

  const handleUpdateRouting = () => {
    showCompileOverlay();
    const parsedRouting = parseRoutingInputs(routingInputs);

    afterOverlayPaint(() => {
      appState.updateState({
        routing: parsedRouting,
        isCompiling: true,
        error: null
      });
      void runCompilation();
    });
  };

  const handleUpdate = () => {
    showCompileOverlay();

    const newCount = Math.max(3, Math.min(24, parseInt(ledCountInput) || 3));
    const newSpacing = Math.max(8, Math.min(30, parseInt(spacingInput) || 8));
    // Calculate new board width: pitch * (count - 1) + 25mm margins
    const newBoardWidth = newSpacing * (newCount - 1) + 25;
    const newRows = Math.max(1, Math.min(5, parseInt(panelRowsInput) || 1));
    const newCols = Math.max(1, Math.min(5, parseInt(panelColsInput) || 1));
    const newSloganCount = Math.max(0, Math.min(200, parseInt(sloganCountInput) || 0));

    afterOverlayPaint(() => {
      appState.updateState({
        ledCount: newCount,
        spacing: newSpacing,
        boardWidth: newBoardWidth,
        useMouseBites: useMouseBitesInput,
        panelRows: newRows,
        panelCols: newCols,
        sloganPhrases: resolveSloganPhrases(sloganPhrasesInput),
        sloganCount: newSloganCount,
        isCompiling: true,
        error: null
      });
      void runCompilation();
    });
  };

  const handleUpdateSlogan = () => {
    if (!state.circuitJson || state.isCompiling || isUpdatingSlogans) return;

    showCompileOverlay("slogan");
    setOverlayMessage("Updating Slogans...");

    const newSloganCount = Math.max(0, Math.min(200, parseInt(sloganCountInput) || 0));

    afterOverlayPaint(() => {
      void (async () => {
        setIsUpdatingSlogans(true);
        try {
          appState.updateState({
            sloganPhrases: resolveSloganPhrases(sloganPhrasesInput),
            sloganCount: newSloganCount
          });
          const curState = appState.getState();
          const sloganResult = await applySlogansForState(curState.circuitJson, curState, {
            randomize: true
          });
          appState.updateState({
            circuitJson: sloganResult.circuitJson,
            sloganPlacedCount: sloganResult.placedCount,
            sloganAttemptedCount: sloganResult.attemptedCount,
            error: null
          });
        } catch (err) {
          console.error(err);
          appState.updateState({ error: err.message });
        } finally {
          setIsUpdatingSlogans(false);
          hideCompileOverlay();
        }
      })();
    });
  };

  const handleSliderChange = (param, val) => {
    appState.updateState({ [param]: val });
    // Debounce/trigger compilation
    triggerCompilation();
  };

  // --- Downloads ---
  const downloadFile = (filename, content, type = "text/csv") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadGerbers = async () => {
    if (!state.circuitJson) return;

    appState.updateState({ isCompiling: true });
    try {
      const curState = appState.getState();
      const sloganResult = await applySlogansForState(curState.circuitJson, curState);
      const exportJson = sloganResult.circuitJson;

      const gerberData = generateGerbers(exportJson);
      if (!gerberData) throw new Error("Gerber generation failed");
      const { layers, drill } = gerberData;

      appState.updateState({
        circuitJson: exportJson,
        sloganPlacedCount: sloganResult.placedCount,
        sloganAttemptedCount: sloganResult.attemptedCount
      });
      
      const JSZip = (await import("https://esm.sh/jszip")).default;
      const zip = new JSZip();
      
      // Add Gerber layers
      Object.entries(layers).forEach(([layerName, content]) => {
        // Map standard internal layers to Gerber extension standard
        let filename = `gerber_${layerName}.gbr`;
        if (layerName.includes("top_copper")) filename = "v6_strip_TopCopper.gbr";
        else if (layerName.includes("bottom_copper")) filename = "v6_strip_BottomCopper.gbr";
        else if (layerName.includes("top_silkscreen")) filename = "v6_strip_TopSilkscreen.gbr";
        else if (layerName.includes("bottom_silkscreen")) filename = "v6_strip_BottomSilkscreen.gbr";
        else if (layerName.includes("top_soldermask")) filename = "v6_strip_TopSolderMask.gbr";
        else if (layerName.includes("bottom_soldermask")) filename = "v6_strip_BottomSolderMask.gbr";
        
        zip.file(filename, content);
      });
      
      // Add Drill file
      zip.file("v6_strip_Drill.drl", drill);
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "v6_led_strip_gerbers.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to zip Gerber files: " + err.message);
    } finally {
      appState.updateState({ isCompiling: false });
    }
  };

  return (
    React.createElement("div", { className: "studio-layout" },
      // Sidebar Controls
      React.createElement("div", { className: "sidebar" },
        React.createElement("div", { className: "brand-header" },
          React.createElement("div", { className: "badge-dot" }),
          React.createElement("h2", null, "V6 LED Strip Configurator")
        ),
        React.createElement("div", { className: "controls-section" },
          React.createElement("h3", null, "Parameters"),
          
          // Styled Number input 1: LED Count
          React.createElement("div", { className: "slider-group" },
            React.createElement("div", { className: "slider-labels" },
              React.createElement("span", null, "LEDs per strip"),
              React.createElement("span", { className: "val-glow" }, "Min 3 / Max 24")
            ),
            React.createElement("input", {
              type: "number",
              className: "param-input",
              min: 3,
              max: 24,
              value: ledCountInput,
              onChange: (e) => setLedCountInput(e.target.value)
            })
          ),

          // Styled Number input 2: Spacing/Pitch
          React.createElement("div", { className: "slider-group slider-group-spaced" },
            React.createElement("div", { className: "slider-labels" },
              React.createElement("span", null, "LED Pitch/Spacing"),
              React.createElement("span", { className: "val-glow" }, "8mm - 30mm")
            ),
            React.createElement("input", {
              type: "number",
              className: "param-input",
              min: 8,
              max: 30,
              value: spacingInput,
              onChange: (e) => setSpacingInput(e.target.value)
            })
          ),

          // Panelization Switch
          React.createElement("div", { className: "panel-toggle-group" },
            React.createElement("span", null, "PANELIZE GRID (MOUSEBITES)"),
            React.createElement("input", {
              type: "checkbox",
              className: "panel-toggle-checkbox",
              checked: useMouseBitesInput,
              onChange: (e) => setUseMouseBitesInput(e.target.checked)
            })
          ),

          // Conditional Panel Parameters
          useMouseBitesInput && React.createElement("div", { className: "panel-params-block" },
            React.createElement("div", { className: "slider-group" },
              React.createElement("div", { className: "slider-labels" },
                React.createElement("span", null, "Panel Rows"),
                React.createElement("span", { className: "val-glow" }, "1 - 5")
              ),
              React.createElement("input", {
                type: "number",
                className: "param-input panel-input",
                min: 1,
                max: 5,
                value: panelRowsInput,
                onChange: (e) => setPanelRowsInput(e.target.value)
              })
            ),
            React.createElement("div", { className: "slider-group slider-group-spaced" },
              React.createElement("div", { className: "slider-labels" },
                React.createElement("span", null, "Panel Columns"),
                React.createElement("span", { className: "val-glow" }, "1 - 5")
              ),
              React.createElement("input", {
                type: "number",
                className: "param-input panel-input",
                min: 1,
                max: 5,
                value: panelColsInput,
                onChange: (e) => setPanelColsInput(e.target.value)
              })
            )
          ),

          // Routing parameters (collapsible)
          React.createElement("div", { className: `routing-spoiler${routingOpen ? " is-open" : ""}` },
            React.createElement("button", {
              type: "button",
              className: "routing-spoiler-toggle",
              onClick: () => setRoutingOpen((open) => !open),
              "aria-expanded": routingOpen
            },
              React.createElement("span", null, "Board Rules (tscircuit)"),
              React.createElement("span", { className: "routing-spoiler-chevron" }, routingOpen ? "▾" : "▸")
            ),
            React.createElement("div", { className: "routing-spoiler-panel" },
              React.createElement("div", { className: "routing-spoiler-inner" },
                React.createElement("p", { className: "routing-param-note" },
                  "Trace and via sizes below are sent to tscircuit when you Update Routing. Clearances are advisory only (see DRC section)."
                ),
                React.createElement("div", { className: "routing-param-section-label" }, "Applied to autorouter"),
                TSCIRCUIT_BOARD_PARAM_DEFS.map((def, idx) =>
                  renderRoutingParamRow(def, idx, routingInputs, setRoutingInputs)
                ),
                React.createElement("div", { className: "routing-param-section-label routing-param-section-spaced" }, "Manufacturing check only"),
                DRC_CHECK_PARAM_DEFS.map((def, idx) =>
                  renderRoutingParamRow(def, idx, routingInputs, setRoutingInputs)
                ),
                React.createElement("button", {
                  className: "btn-update-routing",
                  onClick: handleUpdateRouting,
                  disabled: state.isCompiling || isUpdatingSlogans
                }, state.isCompiling ? "Compiling..." : "Update Routing")
              )
            )
          ),

          // Action update trigger button
          React.createElement("button", {
            className: "btn-update-generator",
            onClick: handleUpdate,
            disabled: state.isCompiling || isUpdatingSlogans
          }, state.isCompiling ? "Compiling..." : "Update Generator"),

          // Slogan generator (silkscreen-only update)
          React.createElement("div", { className: "slider-group slider-group-slogan" },
            React.createElement("div", { className: "slider-labels" },
              React.createElement("span", null, "Slogan Generator"),
              React.createElement("span", { className: "val-glow" }, "Comma-separated")
            ),
            React.createElement("input", {
              type: "text",
              className: "param-input slogan-input",
              value: sloganPhrasesInput,
              placeholder: DEFAULT_SLOGAN_PHRASES,
              onChange: (e) => setSloganPhrasesInput(e.target.value)
            })
          ),

            React.createElement("div", { className: "slider-group slider-group-slogan-count" },
            React.createElement("div", { className: "slider-labels" },
              React.createElement("span", null, "Slogan Amount"),
              React.createElement("span", { className: "val-glow" }, "0 - 200")
            ),
            React.createElement("input", {
              type: "number",
              className: "param-input slogan-input",
              min: 0,
              max: 200,
              value: sloganCountInput,
              onChange: (e) => setSloganCountInput(e.target.value)
            })
          ),

          React.createElement("button", {
            className: "btn-slogan-update",
            onClick: handleUpdateSlogan,
            disabled: !state.circuitJson || state.isCompiling || isUpdatingSlogans
          }, isUpdatingSlogans ? "Updating Slogans..." : "Update Slogan"),

          state.sloganAttemptedCount > 0 && React.createElement("div", { className: "slogan-stats" },
            `Placed ${state.sloganPlacedCount} / ${state.sloganAttemptedCount} slogans`
          ),

          // Board Info Details
          React.createElement("div", { className: "board-info board-info-spaced" },
            React.createElement("div", null, "Board Size: ", React.createElement("strong", null, `${state.boardWidth}mm x ${state.boardHeight}mm`)),
            React.createElement("div", null, "LCSC LED Part: ", 
              React.createElement("a", { 
                className: "board-info-link",
                href: "https://www.lcsc.com/product-detail/C52941388.html", 
                target: "_blank"
              }, "C52941388 (WS2812B-1313-V6)")
            ),
            React.createElement("div", { className: "drc-status" },
              state.drcOk && state.drcWarnings.length === 0
                ? React.createElement("span", { className: "drc-ok" }, "DRC: JLCPCB 2L rules OK")
                : React.createElement("span", { className: state.drcOk ? "drc-warn" : "drc-fail" },
                    state.drcOk
                      ? `DRC: OK (${state.drcWarnings.length} advisory warning(s))`
                      : `DRC: ${state.drcErrors.length} error(s), ${state.drcWarnings.length} warning(s)`
                  )
            ),
            (state.drcErrors.length > 0 || state.drcWarnings.length > 0) && React.createElement("ul", { className: "drc-list" },
              state.drcErrors.slice(0, 4).map((item, idx) =>
                renderDrcListItem(item, "drc-item-error", `drc-e-${idx}`, setDrcHighlight)
              ),
              state.drcWarnings.slice(0, 6).map((item, idx) =>
                renderDrcListItem(item, "drc-item-warn", `drc-w-${idx}`, setDrcHighlight)
              )
            )
          )
        ),

        // Downloads Section
        React.createElement("div", { className: "downloads-section" },
          React.createElement("h3", null, "Manufacturing Output"),
          React.createElement("button", { 
            className: "btn-dl primary-glow", 
            onClick: downloadGerbers, 
            disabled: !state.gerberZip || state.isCompiling 
          }, "Download Gerber ZIP"),
          React.createElement("button", { 
            className: "btn-dl", 
            onClick: () => downloadFile("v6_led_strip_bom.csv", state.bomCsv), 
            disabled: !state.bomCsv || state.isCompiling 
          }, "Download BOM CSV"),
          React.createElement("button", { 
            className: "btn-dl", 
            onClick: () => downloadFile("v6_led_strip_pnp.csv", state.pnpCsv), 
            disabled: !state.pnpCsv || state.isCompiling 
          }, "Download Pick & Place CSV")
        )
      ),

      // Main Viewport Area
      React.createElement("div", { className: "viewport-area" },
        React.createElement("div", { className: "viewport-tabs" },
          React.createElement("button", { 
            className: `tab-btn ${state.showView === "pcb" ? "active" : ""}`, 
            onClick: () => appState.updateState({ showView: "pcb" }) 
          }, "PCB Route"),
          React.createElement("button", { 
            className: `tab-btn ${state.showView === "3d" ? "active" : ""}`, 
            onClick: () => {
              window.tabClickTime = performance.now();
              logDebug(`[Click Timing] "3D Model" button clicked at ${window.tabClickTime.toFixed(1)}ms`);
              appState.updateState({ showView: "3d" });
            }
          }, "3D Model"),
          React.createElement("button", { 
            className: `tab-btn ${state.showView === "schematic" ? "active" : ""}`, 
            onClick: () => appState.updateState({ showView: "schematic" }) 
          }, "Schematic")
        ),

        React.createElement("div", { className: "viewport-display" },
          React.createElement("div", {
            ref: compileOverlayRef,
            className: "compile-overlay vaporwave-mode",
            "aria-hidden": true
          },
            React.createElement("div", { className: "vaporwave-sun" }),
            React.createElement("div", { className: "vaporwave-grid" }),
            React.createElement("div", { className: "vaporwave-content" },
              React.createElement("div", { className: "spinner-neon" }),
              React.createElement("span", { className: "vaporwave-text" }, "Compiling Project...")
            )
          ),
          state.error && React.createElement("div", { className: "error-overlay" },
            React.createElement("span", null, `Compilation Error: ${state.error}`)
          ),

          // PCB SVG Render View (always mounted to preserve zoom/pan position, hidden via CSS)
          React.createElement("div", {
            className: "viewport-pcb-pane",
            style: { display: state.showView === "pcb" ? "block" : "none" }
          },
            state.circuitJson && React.createElement(SVGPCBViewer, { 
              circuitJson: state.circuitJson,
              boardWidth: state.useMouseBites ? (state.panelCols * state.boardWidth + (state.panelCols - 1) * 2.0) : state.boardWidth,
              boardHeight: state.useMouseBites ? (state.panelRows * state.boardHeight + (state.panelRows - 1) * 2.0) : state.boardHeight,
              drcHighlight: state.showView === "pcb" ? drcHighlight : null,
              onCentered: () => {
                logDebug("[Click Timing] 2D SVG Viewport finished centering!");
                setIsCentered(true);
              }
            })
          ),

          // Schematic SVG Render View
          state.showView === "schematic" && state.circuitJson && React.createElement("div", { className: "viewport-pane" },
            React.createElement(SVGSchematicViewer, { 
              circuitJson: state.circuitJson
            })
          ),

          // 3D Viewport Element (always mounted, hidden via CSS to keep WebGL context alive)
          React.createElement("div", { 
            ref: threeRef, 
            className: "viewport-pane three-container",
            style: { display: state.showView === "3d" ? "block" : "none" }
          }),

          state.showView === "3d" && drc3dPopup && React.createElement("div", {
            className: "drc-viewport-popup drc-viewport-popup-3d",
            style: {
              left: `${drc3dPopup.x}px`,
              top: `${drc3dPopup.y - 48}px`
            }
          },
            React.createElement("div", { className: "drc-viewport-popup-title" }, drc3dPopup.label),
            React.createElement("div", { className: "drc-viewport-popup-body" }, drc3dPopup.text)
          )
        )
      )
    )
  );
}
