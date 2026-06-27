import { React } from "../../00-commonParts/tscircuit-core.js";
const { useState, useEffect, useRef } = React;
import { appState } from "./state.js";
import { compileCircuit, generateBOM, generatePNP, generateGerbers, panelizeCircuitJson } from "./circuit.js";
import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';

export function PCBStudioApp() {
  const [state, setState] = useState(appState.getState());
  const threeRef = useRef(null);
  const threeInstanceRef = useRef(null);

  // Local draft states for inputs
  const [ledCountInput, setLedCountInput] = useState(state.ledCount);
  const [spacingInput, setSpacingInput] = useState(state.spacing);
  const [useMouseBitesInput, setUseMouseBitesInput] = useState(state.useMouseBites);
  const [panelRowsInput, setPanelRowsInput] = useState(state.panelRows);
  const [panelColsInput, setPanelColsInput] = useState(state.panelCols);

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
  }, [state.ledCount, state.spacing, state.useMouseBites, state.panelRows, state.panelCols]);

  // Run Three.js viewport only on 3D view tab
  useEffect(() => {
    if (state.showView === "3d" && state.circuitJson) {
      initThreeJS();
    } else {
      destroyThreeJS();
    }
  }, [state.showView, state.circuitJson]);

  const triggerCompilation = async () => {
    appState.updateState({ isCompiling: true, error: null });
    try {
      const curState = appState.getState();
      
      // Compile single board layout
      const circuit = await compileCircuit({
        ledCount: curState.ledCount,
        spacing: curState.spacing,
        boardWidth: curState.boardWidth,
        boardHeight: curState.boardHeight
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
      
      appState.updateState({
        circuitJson,
        bomCsv: generateBOM(circuitJson),
        pnpCsv: generatePNP(circuitJson),
        gerberZip: generateGerbers(circuitJson),
        isCompiling: false
      });
    } catch (err) {
      console.error(err);
      appState.updateState({ isCompiling: false, error: err.message });
    }
  };

  const handleUpdate = () => {
    const newCount = Math.max(3, Math.min(24, parseInt(ledCountInput) || 3));
    const newSpacing = Math.max(8, Math.min(30, parseInt(spacingInput) || 8));
    // Calculate new board width: pitch * (count - 1) + 25mm margins
    const newBoardWidth = newSpacing * (newCount - 1) + 25;
    const newRows = Math.max(1, Math.min(5, parseInt(panelRowsInput) || 1));
    const newCols = Math.max(1, Math.min(5, parseInt(panelColsInput) || 1));
    
    appState.updateState({
      ledCount: newCount,
      spacing: newSpacing,
      boardWidth: newBoardWidth,
      useMouseBites: useMouseBitesInput,
      panelRows: newRows,
      panelCols: newCols
    });
    
    // Defer compile so state updates first
    setTimeout(() => triggerCompilation(), 50);
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
    if (!state.gerberZip) return;
    const { layers, drill } = state.gerberZip;
    
    // Load JSZip dynamically to zip the files in browser
    appState.updateState({ isCompiling: true });
    try {
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

  // --- Three.js 3D Viewport ---
  const initThreeJS = () => {
    if (!threeRef.current) return;
    destroyThreeJS();

    const container = threeRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 50, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(50, 100, 50);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x00f3ff, 0.3);
    dirLight2.position.set(-50, -50, 50);
    scene.add(dirLight2);

    // Build the PCB model
    const singleW = state.boardWidth;
    const singleH = state.boardHeight;
    const pcbW = state.useMouseBites ? (state.panelCols * singleW + (state.panelCols - 1) * 2.0) : singleW;
    const pcbH = state.useMouseBites ? (state.panelRows * singleH + (state.panelRows - 1) * 2.0) : singleH;
    
    // PCB Substrate Material
    const pcbMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c2518, // Matte Green
      roughness: 0.2,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    const cols = state.useMouseBites ? (state.panelCols || 2) : 1;
    const rows = state.useMouseBites ? (state.panelRows || 2) : 1;
    const colGap = 2.0;
    const rowGap = 2.0;

    // Render individual board substrates
    for (let r = 0; r < rows; r++) {
      const offsetY = (r - (rows - 1) / 2) * (singleH + rowGap);
      for (let c = 0; c < cols; c++) {
        const offsetX = (c - (cols - 1) / 2) * (singleW + colGap);
        
        const subGeom = new THREE.BoxGeometry(singleW, 1.6, singleH);
        const subMesh = new THREE.Mesh(subGeom, pcbMat);
        subMesh.position.set(offsetX, 0, -offsetY);
        scene.add(subMesh);
      }
    }

    // Render breakaway tabs in the gaps
    if (state.useMouseBites) {
      // 1. Vertical breakaway tabs (between columns)
      for (let r = 0; r < rows; r++) {
        const offsetY = (r - (rows - 1) / 2) * (singleH + rowGap);
        for (let c = 0; c < cols - 1; c++) {
          const offsetX = (c - (cols - 1) / 2) * (singleW + colGap);
          const tabX = offsetX + singleW / 2 + colGap / 2;

          [offsetY + 3.0, offsetY - 3.0].forEach(tabY => {
            // Tab width 2.0 (fills gap), length 4.0, thickness 1.6
            const tabGeom = new THREE.BoxGeometry(colGap, 1.6, 4.0);
            const tabMesh = new THREE.Mesh(tabGeom, pcbMat);
            tabMesh.position.set(tabX, 0, -tabY);
            scene.add(tabMesh);
          });
        }
      }

      // 2. Horizontal breakaway tabs (between rows)
      for (let r = 0; r < rows - 1; r++) {
        const offsetY = (r - (rows - 1) / 2) * (singleH + rowGap);
        const tabY = offsetY + singleH / 2 + rowGap / 2;
        for (let c = 0; c < cols; c++) {
          const offsetX = (c - (cols - 1) / 2) * (singleW + colGap);

          [offsetX - singleW / 3, offsetX, offsetX + singleW / 3].forEach(tabX => {
            // Tab width 4.0, length 2.0 (fills gap), thickness 1.6
            const tabGeom = new THREE.BoxGeometry(4.0, 1.6, rowGap);
            const tabMesh = new THREE.Mesh(tabGeom, pcbMat);
            tabMesh.position.set(tabX, 0, -tabY);
            scene.add(tabMesh);
          });
        }
      }
    }

    // Add components from circuitJson
    // Cross-reference pcb_component with source_component to get the designator name
    const pcbComps = state.circuitJson.filter(e => e.type === "pcb_component");
    const srcComps = state.circuitJson.filter(e => e.type === "source_component");
    const lensMaterials = [];
    
    pcbComps.forEach((comp) => {
      // Look up the real name from source_component
      const srcComp = srcComps.find(sc => sc.source_component_id === comp.source_component_id);
      const designator = srcComp?.name || comp.pcb_component_id || "";
      if (!designator || designator === "board") return;

      const baseDesignator = designator.replace(/^R\d+_C\d+_/, "");

      const x = comp.center?.x || 0;
      const y = comp.center?.y || 0;
      const rot = (comp.rotation || 0) * (Math.PI / 180);

      const compGroup = new THREE.Group();
      compGroup.position.set(x, 0.8, -y);
      compGroup.rotation.y = rot;

      if (baseDesignator.startsWith("U")) {
        // LED WS2812B-3535 body (white plastic)
        const bodyGeom = new THREE.BoxGeometry(3.5, 1.0, 3.5);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.5;
        compGroup.add(body);

        // LED emissive lens (yellowish)
        const lensGeom = new THREE.BoxGeometry(2.5, 0.1, 2.5);
        const lensMat = new THREE.MeshStandardMaterial({
          color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.2, roughness: 0.1
        });
        const lens = new THREE.Mesh(lensGeom, lensMat);
        lens.position.y = 1.05;
        compGroup.add(lens);
        lensMaterials.push(lensMat);
      } else if (baseDesignator.startsWith("J")) {
        const padMat3D = new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.7, roughness: 0.3 });
        
        if (baseDesignator === "J_BEG" || baseDesignator === "J_END") {
          // Beginning and End edge headers: vertical pad stack
          [-5.4, 0, 5.4].forEach(yOff => {
            const padGeom = new THREE.BoxGeometry(2.0, 0.08, 1.2);
            const pad = new THREE.Mesh(padGeom, padMat3D);
            pad.position.set(0, 0.04, -yOff);
            compGroup.add(pad);
          });
        } else {
          // Intermediate headers (J_MIDi): 3 horizontal pads top, 3 bottom
          // Top 3 pads (V5, DATA, GND) stacked horizontally side-by-side
          [-1.0, 0, 1.0].forEach(xOff => {
            const padGeom = new THREE.BoxGeometry(0.8, 0.08, 1.2);
            const pad = new THREE.Mesh(padGeom, padMat3D);
            pad.position.set(xOff, 0.04, -5.4);
            compGroup.add(pad);
          });
          
          // Bottom 3 pads (V5, DATA, GND) stacked horizontally side-by-side
          [-1.0, 0, 1.0].forEach(xOff => {
            const padGeom = new THREE.BoxGeometry(0.8, 0.08, 1.2);
            const pad = new THREE.Mesh(padGeom, padMat3D);
            pad.position.set(xOff, 0.04, 5.4);
            compGroup.add(pad);
          });
        }
      }
      scene.add(compGroup);
    });

    // Trace color mapping helper
    const getTraceColorHex = (traceId) => {
      const id = (traceId || "").toLowerCase();
      if (id.includes("vcc") || id.includes("vplus") || id.includes("vdd") || id.includes("pwr") || id.includes("v_") || id.includes("_v")) return 0xff3b30; // Red VCC
      if (id.includes("gnd") || id.includes("g_") || id.includes("_g")) return 0x007aff; // Blue GND
      if (id.includes("dat") || id.includes("din") || id.includes("dout") || id.includes("d_") || id.includes("_d")) return 0x34c759; // Green DATA
      return 0x00f0ff; // Cyan default
    };

    // Add copper traces on top and bottom surfaces
    const pcbTraces3D = state.circuitJson.filter(e => e.type === "pcb_trace");
    const sourceTraces3D = state.circuitJson.filter(e => e.type === "source_trace");
    
    pcbTraces3D.forEach((trace) => {
      if (!trace.route || trace.route.length < 2) return;
      const tw = trace.route[0]?.width || 0.15;
      
      // Look up trace name from source_trace
      const srcTrace = sourceTraces3D.find(st => st.source_trace_id === trace.source_trace_id);
      const traceName = srcTrace?.name || "";
      const colorVal = getTraceColorHex(traceName || trace.pcb_trace_id);
      
      const traceMat = new THREE.MeshStandardMaterial({ color: colorVal, metalness: 0.9, roughness: 0.2 });
      
      // Group points into consecutive sub-routes on the same layer
      let currentSubRoute = [];
      let currentLayerIsBottom = null;
      const subRoutes = [];
      
      trace.route.forEach((p) => {
        const isBottom = p.layer === "bottom" || p.route_layer === "bottom" || p.layer === "bottom_copper";
        if (currentLayerIsBottom === null) {
          currentLayerIsBottom = isBottom;
          currentSubRoute.push(p);
        } else if (isBottom === currentLayerIsBottom) {
          currentSubRoute.push(p);
        } else {
          // Layer changed, close current sub-route
          if (currentSubRoute.length >= 2) {
            subRoutes.push({ points: currentSubRoute, isBottom: currentLayerIsBottom });
          }
          currentSubRoute = [p];
          currentLayerIsBottom = isBottom;
        }
      });
      if (currentSubRoute.length >= 2) {
        subRoutes.push({ points: currentSubRoute, isBottom: currentLayerIsBottom });
      }

      // Draw each sub-route as a tube for smooth 3D wires
      subRoutes.forEach((subRoute) => {
        const layerY = subRoute.isBottom ? -0.81 : 0.81;
        
        // Build curve path
        const curvePath = new THREE.CurvePath();
        let validSegments = 0;
        
        for (let i = 0; i < subRoute.points.length - 1; i++) {
          const p1 = subRoute.points[i];
          const p2 = subRoute.points[i + 1];
          const dx = (p2.x || 0) - (p1.x || 0);
          const dy = (p2.y || 0) - (p1.y || 0);
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 0.01) continue;
          
          const v1 = new THREE.Vector3(p1.x || 0, layerY, -(p1.y || 0));
          const v2 = new THREE.Vector3(p2.x || 0, layerY, -(p2.y || 0));
          curvePath.add(new THREE.LineCurve3(v1, v2));
          validSegments++;
        }
        
        if (validSegments > 0) {
          // Render as TubeGeometry
          const tubeGeom = new THREE.TubeGeometry(
            curvePath,
            validSegments * 8, // segments along path
            tw / 2, // radius
            8, // radial segments (cross-section)
            false // closed
          );
          const tubeMesh = new THREE.Mesh(tubeGeom, traceMat);
          scene.add(tubeMesh);
        }
      });
    });

    // Add Vias (connecting top and bottom traces)
    const viaMat = new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.8, roughness: 0.2 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x151515 }); // dark hollow drill look
    const pcbVias3D = state.circuitJson.filter(e => e.type === "pcb_via");
    pcbVias3D.forEach((via) => {
      const hd = via.hole_diameter || 0.3;
      const od = via.outer_diameter || 0.6;
      const isPlated = od > hd;

      // Cylinder barrel representing the hollow drill hole (slightly taller to protrude and prevent Z-fighting)
      const barrelGeom = new THREE.CylinderGeometry(hd/2, hd/2, 1.62, 12);
      const barrel = new THREE.Mesh(barrelGeom, holeMat);
      barrel.position.set(via.x || 0, 0, -(via.y || 0));
      scene.add(barrel);
      
      // Top and bottom rings (rendered only for plated vias)
      if (isPlated) {
        const ringGeom = new THREE.CylinderGeometry(od/2, od/2, 0.04, 12);
        const topRing = new THREE.Mesh(ringGeom, viaMat);
        topRing.position.set(via.x || 0, 0.8, -(via.y || 0));
        scene.add(topRing);
        
        const bottomRing = new THREE.Mesh(ringGeom, viaMat);
        bottomRing.position.set(via.x || 0, -0.8, -(via.y || 0));
        scene.add(bottomRing);
      }
    });

    // Add SMT pads on top surface
    const padMat = new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.8, roughness: 0.2 });
    const smtPads3D = state.circuitJson.filter(e => e.type === "pcb_smtpad");
    smtPads3D.forEach((pad) => {
      const pw = pad.width || 0.5;
      const ph = pad.height || 0.5;
      const padGeom = new THREE.BoxGeometry(pw, 0.05, ph);
      const padMesh = new THREE.Mesh(padGeom, padMat);
      padMesh.position.set(pad.x || 0, 0.81, -(pad.y || 0));
      scene.add(padMesh);
    });

    // --- Dynamic 3D Silkscreen Decal/Texture overlay ---
    // --- Dynamic 3D Silkscreen Decal/Texture overlay ---
    const silkCanvas = document.createElement("canvas");
    silkCanvas.width = 2048;
    silkCanvas.height = 512;
    const silkCtx = silkCanvas.getContext("2d");
    silkCtx.clearRect(0, 0, silkCanvas.width, silkCanvas.height);

    // Draw borders & lines
    silkCtx.strokeStyle = "#39ff14";
    silkCtx.lineWidth = 4;
    silkCtx.strokeRect(10, 10, silkCanvas.width - 20, silkCanvas.height - 20);

    // Initialize collision detection/obstacles list
    const obstacles = [];
    obstacles.push({ minX: 0, maxX: 60, minY: 0, maxY: 512 });
    obstacles.push({ minX: 2048 - 60, maxX: 2048, minY: 0, maxY: 512 });
    obstacles.push({ minX: 0, maxX: 2048, minY: 0, maxY: 30 });
    obstacles.push({ minX: 0, maxX: 2048, minY: 512 - 30, maxY: 512 });

    // Draw silkscreen text for WS2812B and Headers based on layout
    srcComps.forEach(comp => {
      const pcbC = pcbComps.find(p => p.source_component_id === comp.source_component_id);
      if (!pcbC) return;
      const cx = (pcbC.center?.x || 0);
      const cy = (pcbC.center?.y || 0);
      
      const baseName = comp.name.replace(/^R\d+_C\d+_/, "");
      
      // Map PCB coords (-boardWidth/2 to boardWidth/2) to canvas X (0 to 2048)
      const scaleX = silkCanvas.width / pcbW;
      const scaleY = silkCanvas.height / pcbH;
      const drawX = (cx + pcbW/2) * scaleX;
      const drawY = (-cy + pcbH/2) * scaleY; // flip Y

      if (baseName.startsWith("U")) {
        // Designator U1, U2...
        silkCtx.fillStyle = "#39ff14";
        silkCtx.font = "bold 24px monospace";
        silkCtx.textAlign = "center";
        silkCtx.fillText(baseName, drawX, drawY - 25);

        // pin labels
        silkCtx.fillStyle = "#ffffff";
        silkCtx.font = "14px monospace";
        silkCtx.fillText("+", drawX - 18, drawY - 8);
        silkCtx.fillText("O", drawX + 18, drawY - 8);
        silkCtx.fillText("-", drawX + 18, drawY + 18);
        silkCtx.fillText("I", drawX - 18, drawY + 18);

        obstacles.push({
          minX: drawX - 70,
          maxX: drawX + 70,
          minY: drawY - 60,
          maxY: drawY + 40
        });
      } else if (baseName.startsWith("J")) {
        silkCtx.fillStyle = "#ffffff";
        silkCtx.font = "14px monospace";
        silkCtx.textAlign = "center";
        
        if (baseName === "J_BEG") {
          silkCtx.fillText("V5", drawX + 22, drawY - 32);
          silkCtx.fillText("DATA", drawX + 22, drawY);
          silkCtx.fillText("GND", drawX + 22, drawY + 32);
          obstacles.push({ minX: drawX - 40, maxX: drawX + 60, minY: drawY - 50, maxY: drawY + 50 });
        } else if (baseName === "J_END") {
          silkCtx.fillText("V5", drawX - 22, drawY - 32);
          silkCtx.fillText("DATA", drawX - 22, drawY);
          silkCtx.fillText("GND", drawX - 22, drawY + 32);
          obstacles.push({ minX: drawX - 60, maxX: drawX + 40, minY: drawY - 50, maxY: drawY + 50 });
        } else {
          // J_MIDi - draw the index 0, 1, 2... between top and bottom pads
          const match = baseName.match(/J_MID(\d+)/);
          if (match) {
            const idxStr = (parseInt(match[1]) - 1).toString();
            silkCtx.fillStyle = "#39ff14";
            silkCtx.font = "bold 26px monospace";
            silkCtx.fillText(idxStr, drawX, drawY + 8);
          }
          
          silkCtx.fillStyle = "#ffffff";
          silkCtx.font = "14px monospace";
          // Top row V5, DATA, GND
          silkCtx.fillText("V5", drawX - 18, drawY - 26);
          silkCtx.fillText("DATA", drawX, drawY - 26);
          silkCtx.fillText("GND", drawX + 18, drawY - 26);
          // Bottom row
          silkCtx.fillText("V5", drawX - 18, drawY + 38);
          silkCtx.fillText("DATA", drawX, drawY + 38);
          silkCtx.fillText("GND", drawX + 18, drawY + 38);

          obstacles.push({
            minX: drawX - 60,
            maxX: drawX + 60,
            minY: drawY - 60,
            maxY: drawY + 60
          });
        }
      }
    });

    // Spawn random slogans in collision-free zones
    const slogans = [
      "This kills fascism",
      "This kills fascism",
      "This machine kills fascists",
      "This machine kills fascists",
      "Parametric PCB",
      "Antigravity",
      "V6 LED Strip",
      "Made with tscircuit",
      "3535 LED"
    ];
    
    const fontFamilies = ["monospace", "serif", "sans-serif", "Courier New", "Arial", "Georgia"];
    const fontStyles = ["normal", "italic", "bold", "bold italic"];
    const numTextsToSpawn = Math.min(15, Math.floor(pcbW / 8));
    
    for (let t = 0; t < numTextsToSpawn; t++) {
      const slogan = slogans[Math.floor(Math.random() * slogans.length)];
      const fontSize = Math.floor(Math.random() * 8) + 12; // 12px to 20px
      const fontFamily = fontFamilies[Math.floor(Math.random() * fontFamilies.length)];
      const fontStyle = fontStyles[Math.floor(Math.random() * fontStyles.length)];
      
      const textWidth = slogan.length * (fontSize * 0.55);
      const textHeight = fontSize * 1.2;
      
      for (let attempt = 0; attempt < 100; attempt++) {
        const rx = Math.random() * (2048 - textWidth - 160) + 80 + textWidth / 2;
        const ry = Math.random() * (512 - textHeight - 100) + 50 + textHeight / 2;
        
        const box = {
          minX: rx - textWidth / 2 - 20,
          maxX: rx + textWidth / 2 + 20,
          minY: ry - textHeight / 2 - 15,
          maxY: ry + textHeight / 2 + 15
        };
        
        const collision = obstacles.some(obs => {
          return !(box.maxX < obs.minX || box.minX > obs.maxX || box.maxY < obs.minY || box.minY > obs.maxY);
        });
        
        if (!collision) {
          silkCtx.save();
          silkCtx.fillStyle = "rgba(255, 255, 255, 0.55)";
          silkCtx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
          silkCtx.textAlign = "center";
          silkCtx.textBaseline = "middle";
          silkCtx.fillText(slogan, rx, ry);
          silkCtx.restore();
          
          obstacles.push(box);
          break;
        }
      }
    }

    const silkTexture = new THREE.CanvasTexture(silkCanvas);
    silkTexture.needsUpdate = true;

    const silkGeom = new THREE.PlaneGeometry(pcbW, pcbH);
    const silkMat = new THREE.MeshBasicMaterial({
      map: silkTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const silkDecal = new THREE.Mesh(silkGeom, silkMat);
    silkDecal.rotation.x = -Math.PI / 2;
    silkDecal.position.set(0, 0.81, 0); // Position exactly on the top layer
    scene.add(silkDecal);

    // Animation Loop
    let animId;
    let time = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      time += 0.01;
      
      // Cycle HSL rainbow wave across WS2812B LEDs
      lensMaterials.forEach((mat, idx) => {
        const hue = (time + idx * 0.1) % 1.0;
        mat.color.setHSL(hue, 1.0, 0.5);
        mat.emissive.setHSL(hue, 1.0, 0.5);
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!threeRef.current) return;
      const w = threeRef.current.clientWidth;
      const h = threeRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    threeInstanceRef.current = {
      renderer,
      animId,
      resizeHandler: handleResize
    };
  };

  const destroyThreeJS = () => {
    if (threeInstanceRef.current) {
      const { renderer, animId, resizeHandler } = threeInstanceRef.current;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeHandler);
      renderer.dispose();
      if (threeRef.current) {
        threeRef.current.innerHTML = "";
      }
      threeInstanceRef.current = null;
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
              min: 3,
              max: 24,
              value: ledCountInput,
              onChange: (e) => setLedCountInput(e.target.value),
              style: {
                width: "100%",
                background: "#080808",
                border: "2px solid #39ff14",
                color: "#fff",
                padding: "8px",
                fontFamily: "monospace",
                outline: "none",
                marginTop: "6px"
              }
            })
          ),

          // Styled Number input 2: Spacing
          React.createElement("div", { className: "slider-group" },
            React.createElement("div", { className: "slider-labels" },
              React.createElement("span", null, "Spacing (Pitch mm)"),
              React.createElement("span", { className: "val-glow" }, "Min 8 / Max 30")
            ),
            React.createElement("input", {
              type: "number",
              min: 8,
              max: 30,
              value: spacingInput,
              onChange: (e) => setSpacingInput(e.target.value),
              style: {
                width: "100%",
                background: "#080808",
                border: "2px solid #39ff14",
                color: "#fff",
                padding: "8px",
                fontFamily: "monospace",
                outline: "none",
                marginTop: "6px"
              }
            })
          ),

          // Mousebite Toggle Control
          React.createElement("div", { className: "slider-group", style: { marginTop: "16px" } },
            React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#fff", fontFamily: "monospace" } },
              React.createElement("input", {
                type: "checkbox",
                checked: useMouseBitesInput,
                onChange: (e) => setUseMouseBitesInput(e.target.checked),
                style: {
                  width: "18px",
                  height: "18px",
                  accentColor: "#39ff14",
                  cursor: "pointer"
                }
              }),
              React.createElement("span", null, "Panelize (Mousebites)")
            )
          ),

          // Conditional Rows & Columns Inputs
          useMouseBitesInput && React.createElement(React.Fragment, null,
            // Panel Rows
            React.createElement("div", { className: "slider-group", style: { marginTop: "12px" } },
              React.createElement("div", { className: "slider-labels" },
                React.createElement("span", null, "Panel Rows"),
                React.createElement("span", { className: "val-glow" }, "Min 1")
              ),
              React.createElement("input", {
                type: "number",
                min: 1,
                value: panelRowsInput,
                onChange: (e) => setPanelRowsInput(e.target.value),
                style: {
                  width: "100%",
                  background: "#080808",
                  border: "2px solid #39ff14",
                  color: "#fff",
                  padding: "8px",
                  fontFamily: "monospace",
                  outline: "none",
                  marginTop: "6px"
                }
              })
            ),
            // Panel Columns
            React.createElement("div", { className: "slider-group", style: { marginTop: "12px" } },
              React.createElement("div", { className: "slider-labels" },
                React.createElement("span", null, "Panel Columns"),
                React.createElement("span", { className: "val-glow" }, "Min 1")
              ),
              React.createElement("input", {
                type: "number",
                min: 1,
                value: panelColsInput,
                onChange: (e) => setPanelColsInput(e.target.value),
                style: {
                  width: "100%",
                  background: "#080808",
                  border: "2px solid #39ff14",
                  color: "#fff",
                  padding: "8px",
                  fontFamily: "monospace",
                  outline: "none",
                  marginTop: "6px"
                }
              })
            )
          ),

          // Action update trigger button
          React.createElement("button", {
            onClick: handleUpdate,
            disabled: state.isCompiling,
            style: {
              width: "100%",
              background: "#39ff14",
              color: "#000",
              border: "none",
              padding: "12px",
              fontFamily: "monospace",
              fontWeight: "bold",
              cursor: "pointer",
              marginTop: "16px",
              marginBottom: "24px",
              textTransform: "uppercase",
              boxShadow: "0 0 10px rgba(57, 255, 20, 0.5)"
            }
          }, state.isCompiling ? "Compiling..." : "Update Generator"),

          // Board Info Details
          React.createElement("div", { className: "board-info" },
            React.createElement("div", null, "Board Size: ", React.createElement("strong", null, `${state.boardWidth}mm x ${state.boardHeight}mm`)),
            React.createElement("div", null, "LCSC LED Part: ", 
              React.createElement("a", { 
                href: "https://www.lcsc.com/product-detail/C52941388.html", 
                target: "_blank", 
                style: { color: "#39ff14", textDecoration: "underline", fontWeight: "bold" } 
              }, "C52941388 (WS2812B-3535)")
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
            onClick: () => appState.updateState({ showView: "3d" }) 
          }, "3D Model"),
          React.createElement("button", { 
            className: `tab-btn ${state.showView === "schematic" ? "active" : ""}`, 
            onClick: () => appState.updateState({ showView: "schematic" }) 
          }, "Schematic")
        ),

        React.createElement("div", { className: "viewport-display" },
          state.isCompiling && React.createElement("div", { className: "compile-overlay" },
            React.createElement("div", { className: "spinner" }),
            React.createElement("span", null, "Compiling tscircuit project...")
          ),
          state.error && React.createElement("div", { className: "error-overlay" },
            React.createElement("span", null, `Compilation Error: ${state.error}`)
          ),

          // PCB SVG Render View
          state.showView === "pcb" && state.circuitJson && React.createElement(SVGPCBViewer, { 
            circuitJson: state.circuitJson,
            boardWidth: state.useMouseBites ? (state.panelCols * state.boardWidth + (state.panelCols - 1) * 2.0) : state.boardWidth,
            boardHeight: state.useMouseBites ? (state.panelRows * state.boardHeight + (state.panelRows - 1) * 2.0) : state.boardHeight
          }),

          // Schematic SVG Render View
          state.showView === "schematic" && state.circuitJson && React.createElement(SVGSchematicViewer, { 
            circuitJson: state.circuitJson
          }),

          // 3D Viewport Element
          state.showView === "3d" && React.createElement("div", { 
            ref: threeRef, 
            className: "three-container" 
          })
        )
      )
    ));
  }

// --- Custom 2D PCB Renderer (SVG-based, high performance, neon glows) ---
function SVGPCBViewer({ circuitJson, boardWidth, boardHeight }) {
  const pcbComponents = circuitJson.filter(e => e.type === "pcb_component");
  const pcbPads = circuitJson.filter(e => e.type === "pcb_smtpad");
  const pcbTraces = circuitJson.filter(e => e.type === "pcb_trace");
  const sourceTraces = circuitJson.filter(e => e.type === "source_trace");

  // Zoom and Drag Pan State for Interactive SVG Viewport
  const [transform, setTransform] = React.useState({ x: 0, y: 0, zoom: 1 });
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
    const zoomFactor = 1.15;
    let newZoom = transform.zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(newZoom * zoomFactor, 12);
    } else {
      newZoom = Math.max(newZoom / zoomFactor, 0.4);
    }
    setTransform(prev => ({ ...prev, zoom: newZoom }));
  };

  return (
    React.createElement("div", { 
      className: "svg-viewer-container",
      style: {
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        cursor: isDragging ? "grabbing" : "grab"
      },
      onMouseDown: onMouseDown,
      onMouseMove: onMouseMove,
      onMouseUp: onMouseUpOrLeave,
      onMouseLeave: onMouseUpOrLeave,
      onWheel: onWheel
    },
      React.createElement("svg", { 
        width: svgWidth, 
        height: svgHeight, 
        style: { 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`, 
          transformOrigin: "center center",
          position: "absolute",
          left: "50%",
          top: "50%",
          marginLeft: `${-svgWidth / 2}px`,
          marginTop: `${-svgHeight / 2}px`
        }
      },
        // Glow Filter
        React.createElement("defs", null,
          React.createElement("filter", { id: "trace-glow", x: "-20%", y: "-20%", width: "140%", height: "140%" },
            React.createElement("feGaussianBlur", { stdDeviation: "1.5", result: "blur" }),
            React.createElement("feMerge", null,
              React.createElement("feMergeNode", { in: "blur" }),
              React.createElement("feMergeNode", { in: "SourceGraphic" })
            )
          )
        ),

        // PCB Substrate background
        React.createElement("rect", {
          x: padding,
          y: padding,
          width: boardWidth * scale,
          height: boardHeight * scale,
          rx: 4,
          ry: 4,
          fill: "#080808",
          stroke: "#39ff14", // Neon Lime
          strokeWidth: 3,
          opacity: 0.95
        }),

        // 1. Render Traces segment-by-segment with hover handlers
        pcbTraces.map((trace, idx) => {
          if (!trace.route || trace.route.length < 2) return null;
          
          // Diagnostic log for the first few compiles
          if (idx === 0) {
            console.log("[V6Led] Sample trace route details:", trace.route);
          }
          
          // Cross-reference source_trace to extract the human-readable trace name
          const srcTrace = sourceTraces.find(st => st.source_trace_id === trace.source_trace_id);
          const traceName = srcTrace?.name || `Trace_${idx}`;
          
          const getTraceColorStr = (name) => {
            const id = (name || "").toLowerCase();
            if (id.includes("vcc") || id.includes("vplus") || id.includes("vdd") || id.includes("pwr") || id.includes("v_") || id.includes("_v")) return "#ff3b30"; // Red VCC
            if (id.includes("gnd") || id.includes("g_") || id.includes("_g")) return "#007aff"; // Blue GND
            if (id.includes("dat") || id.includes("din") || id.includes("dout") || id.includes("d_") || id.includes("_d")) return "#34c759"; // Green DATA
            return "#00f0ff"; // default Cyan
          };
          
          const strokeColor = getTraceColorStr(traceName || trace.pcb_trace_id);
          
          // Calculate trace length
          let len = 0;
          for (let i = 0; i < trace.route.length - 1; i++) {
            const dx = (trace.route[i+1].x || 0) - (trace.route[i].x || 0);
            const dy = (trace.route[i+1].y || 0) - (trace.route[i].y || 0);
            len += Math.sqrt(dx * dx + dy * dy);
          }
          
          // Draw each segment individually to support multi-layer traces (top vs bottom)
          return React.createElement("g", { key: `trace-${idx}` },
            trace.route.slice(0, -1).map((p1, sIdx) => {
              const p2 = trace.route[sIdx + 1];
              if (!p1 || !p2) return null;
              
              const isBottom = p1.layer === "bottom" || p1.route_layer === "bottom" || p1.layer === "bottom_copper";
              
              return React.createElement(React.Fragment, { key: `seg-${sIdx}` },
                // Hover interactive line
                React.createElement("line", {
                  x1: toSvgX(p1.x),
                  y1: toSvgY(p1.y),
                  x2: toSvgX(p2.x),
                  y2: toSvgY(p2.y),
                  stroke: strokeColor,
                  strokeWidth: toSvgDim(trace.width || 0.3) + 3,
                  strokeLinecap: "round",
                  opacity: 0,
                  style: { cursor: "help" },
                  onMouseEnter: (e) => {
                    setHoveredItem({
                      title: traceName,
                      details: [
                        { label: "Type", value: "Copper Trace" },
                        { label: "Segment", value: `${sIdx + 1} of ${trace.route.length - 1}` },
                        { label: "Layer", value: isBottom ? "Bottom Layer (Dashed)" : "Top Layer (Solid)" },
                        { label: "Width", value: `${trace.width || 0.3} mm` },
                        { label: "Total Length", value: `${len.toFixed(2)} mm` }
                      ]
                    });
                  },
                  onMouseMove: (e) => {
                    const rect = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
                    setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
                  },
                  onMouseLeave: () => setHoveredItem(null)
                }),
                // Visible line segment
                React.createElement("line", {
                  x1: toSvgX(p1.x),
                  y1: toSvgY(p1.y),
                  x2: toSvgX(p2.x),
                  y2: toSvgY(p2.y),
                  stroke: strokeColor,
                  strokeWidth: toSvgDim(trace.width || 0.3),
                  strokeLinecap: "round",
                  opacity: isBottom ? 0.45 : 1.0,
                  strokeDasharray: isBottom ? "4,3" : "none",
                  style: { pointerEvents: "none" }
                })
              );
            })
          );
        }),

        // 2. Render Pads with hover handlers
        pcbPads.map((pad, idx) => {
          const cx = toSvgX(pad.x);
          const cy = toSvgY(pad.y);
          const padWidth = pad.width || 0.8;
          const padHeight = pad.height || 1.2;
          
          const hoverHandler = {
            onMouseEnter: () => {
              setHoveredItem({
                title: `Pad ${idx + 1}`,
                details: [
                  { label: "Type", value: "SMT Pad" },
                  { label: "Layer", value: pad.layer === "bottom" ? "Bottom Layer" : "Top Layer" },
                  { label: "Dimensions", value: `${padWidth} x ${padHeight} mm` },
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
          
          if (pad.shape === "rect" || pad.shape === "rotated_rect") {
            const w = toSvgDim(padWidth);
            const h = toSvgDim(padHeight);
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
            const r = toSvgDim(pad.radius || 0.6);
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
            } else if (baseDesignator.startsWith("J")) {
              if (baseDesignator === "J_BEG" || baseDesignator === "J_END") {
                // Vertical header style
                const pw = toSvgDim(2.5);
                const ph = toSvgDim(11);
                const labelX = (baseDesignator === "J_END") ? (cx - pw/2 - 3) : (cx + pw/2 + 3);
                const textAnchorSide = (baseDesignator === "J_END") ? "end" : "start";
                return React.createElement("g", { key: `comp-${idx}`, style: { cursor: "help" }, ...hoverComp },
                  React.createElement("rect", {
                    x: cx - pw/2,
                    y: cy - ph/2,
                    width: pw,
                    height: ph,
                    fill: "none",
                    stroke: "#ff007f",
                    strokeWidth: 1,
                    strokeDasharray: "3,2",
                    opacity: 0.6
                  }),
                  React.createElement("text", {
                    x: cx,
                    y: cy - ph/2 - 3,
                    fill: "#ff007f",
                    fontSize: "5px",
                    textAnchor: "middle",
                    fontFamily: "monospace"
                  }, baseDesignator),
                  // Silkscreen labels next to the vertical pads inside board margin
                  React.createElement("text", { x: labelX, y: cy - ph/2 + 6, fill: "#fff", fontSize: "4px", textAnchor: textAnchorSide }, "V5"),
                  React.createElement("text", { x: labelX, y: cy, fill: "#fff", fontSize: "4px", textAnchor: textAnchorSide }, "DATA"),
                  React.createElement("text", { x: labelX, y: cy + ph/2 - 5, fill: "#fff", fontSize: "4px", textAnchor: textAnchorSide }, "GND")
                );
              } else {
                // Horizontal edge header style (J_MIDi)
                const pw = toSvgDim(3.0);
                const ph = toSvgDim(11);
                
                // Silkscreen labels moved completely off pads (stacked vertically closer to components' center at ±2.5mm)
                const labelYTop = cy - toSvgDim(2.5);
                const labelYBottom = cy + toSvgDim(2.5);
                
                return React.createElement("g", { key: `comp-${idx}`, style: { cursor: "help" }, ...hoverComp },
                  React.createElement("rect", {
                    x: cx - pw/2,
                    y: cy - ph/2,
                    width: pw,
                    height: ph,
                    fill: "none",
                    stroke: "#ff007f",
                    strokeWidth: 1,
                    strokeDasharray: "3,2",
                    opacity: 0.6
                  }),
                  React.createElement("text", {
                    x: cx,
                    y: cy - ph/2 - 3,
                    fill: "#ff007f",
                    fontSize: "5px",
                    textAnchor: "middle",
                    fontFamily: "monospace"
                  }, baseDesignator),
                  
                  // Silkscreen labels completely on the PCB surface
                  React.createElement("text", { x: cx - pw/2 + 2, y: labelYTop, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "V5"),
                  React.createElement("text", { x: cx, y: labelYTop, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "DATA"),
                  React.createElement("text", { x: cx + pw/2 - 2, y: labelYTop, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "GND"),
                  
                  React.createElement("text", { x: cx - pw/2 + 2, y: labelYBottom, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "V5"),
                  React.createElement("text", { x: cx, y: labelYBottom, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "DATA"),
                  React.createElement("text", { x: cx + pw/2 - 2, y: labelYBottom, fill: "#fff", fontSize: "3px", textAnchor: "middle" }, "GND")
                );
              }
            }
            return null;
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
          React.createElement("span", { style: { fontWeight: "bold" } }, d.value)
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
function SVGSchematicViewer({ circuitJson }) {
  const sourceComps = circuitJson.filter(e => e.type === "source_component");
  const leds = sourceComps.filter(c => c.name && c.name.startsWith("U"));
  const headers = sourceComps.filter(c => c.name && c.name.startsWith("J"));

  // Calculate viewBox to fit all components
  const totalLeds = leds.length;
  const svgW = Math.max(800, totalLeds * 75 + 200);
  const svgH = 380;

  return (
    React.createElement("div", { className: "schematic-svg-container", style: { overflow: "auto" } },
      React.createElement("svg", { width: "100%", height: "100%", viewBox: `0 0 ${svgW} ${svgH}` },
        React.createElement("text", { x: svgW / 2, y: 30, fill: "#39ff14", fontSize: "16px", textAnchor: "middle", fontFamily: "monospace", fontWeight: "bold" }, "V6 LED STRIP SCHEMATIC (NO EXTERNAL CAPS)"),

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
        }),

        // Note about built-in caps
        React.createElement("text", { x: svgW / 2, y: svgH - 15, fill: "#666", fontSize: "10px", textAnchor: "middle", fontFamily: "monospace" }, "V6 WS2812B has built-in decoupling capacitors — no external caps required")
      )
    )
  );
}
