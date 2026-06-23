import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';

let wasm, Manifold;
let scene, camera, renderer, controls;
let mainGroup; // Holds caps and sheet representation
let overlaySvg = document.getElementById('dimensions-overlay');

// Current parameters state
const params = {
    sheetWidth: 9.75,       // inches
    sheetHeight: 7.75,      // inches
    sheetThickness: 0.5,    // mm
    rollDirection: 'width', // 'width' or 'height'
    holeDiam: 25.0,         // mm
    lipDepth: 8.0,          // mm
    wallThick: 2.0,         // mm
    tolerance: 0.20,        // mm
    ledCount: 4,            // vertical channels
    ledWidth: 10.0,         // mm
    ledDepth: 2.0,          // mm
    slipRing: 'none',       // 'none', 'bottom', 'top', 'both'
    bracketCount: 2,        // number of M3 side brackets
    opacity: 90,
    mode: 'blueprint'       // 'rendered' or 'blueprint'
};

const visibilities = {
    topCap: true,
    bottomCap: true,
    sheet: true,
    brackets: true
};

// Meshes references
let bottomCapMesh = null;
let topCapMesh = null;
let sheetMesh = null;
let bracketMeshes = [];

// Colors (Neon Cyan Theme)
const colors = {
    cyanIce: 0x00f3ff,
    glowCyan: 0x00aaff,
    limeAccent: 0xc8ff00,
    sheetBlue: 0x00bfff,
    blueprintLine: 0x00f3ff,
    blueprintFace: 0x011218
};

// Setup the Scene
function init() {
    const container = document.getElementById('canvas3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02090b, 0.0015);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(180, 150, 220);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 50, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.update();

    // Technical Blueprint Grid Helper
    const grid = new THREE.GridHelper(400, 40, 0x00f3ff, 0x002c33);
    grid.position.y = 0;
    scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x00222a, 2.0);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 250, 150);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x00f3ff, 2.0, 300);
    fillLight.position.set(-100, 100, 50);
    scene.add(fillLight);

    const glowLight = new THREE.PointLight(0xc8ff00, 2.0, 150);
    glowLight.position.set(0, 0, 0);
    scene.add(glowLight);

    mainGroup = new THREE.Group();
    // Rotate the CAD coordinates to match Three.js (Z is up in CAD, Y is up in ThreeJS)
    mainGroup.rotation.x = -Math.PI / 2;
    scene.add(mainGroup);

    window.addEventListener('resize', onWindowResize);
    setupUIListeners();
    initManifold();
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Initialize Manifold WASM
async function initManifold() {
    try {
        wasm = await Module();
        wasm.setup();
        Manifold = wasm.Manifold;
        console.log("Manifold geometry engine active");
        rebuild();
        animate();
    } catch(e) {
        console.error("Failed to load Manifold WASM.", e);
        const status = document.querySelector('footer div.status-left span:last-child');
        if (status) status.textContent = "KERNEL FAILED TO LOAD";
    }
}

// Bind sliders, inputs and buttons to parameters
function setupUIListeners() {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(paramKey === 'tolerance' ? 2 : 1) : val;
            rebuild();
        });
    };

    const bindNumberInput = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 1.0;
            params[paramKey] = val;
            rebuild();
        });
    };

    // Sliders
    bindSlider('input-holeDiam', 'holeDiam');
    bindSlider('input-lipDepth', 'lipDepth');
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-tolerance', 'tolerance');
    bindSlider('input-opacity', 'opacity', false);

    // Number fields
    bindNumberInput('input-sheetWidth', 'sheetWidth');
    bindNumberInput('input-sheetHeight', 'sheetHeight');
    bindNumberInput('input-sheetThickness', 'sheetThickness');

    // LED channel sliders
    bindSlider('input-ledCount', 'ledCount', false);
    bindSlider('input-ledWidth', 'ledWidth');
    bindSlider('input-ledDepth', 'ledDepth');

    // Slip ring select
    const slipRingSelect = document.getElementById('select-slipRing');
    if (slipRingSelect) {
        slipRingSelect.addEventListener('change', (e) => {
            params.slipRing = e.target.value;
            rebuild();
        });
    }

    // Bracket count slider
    bindSlider('input-bracketCount', 'bracketCount', false);

    // Bind custom spinner buttons
    document.querySelectorAll('.spin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const step = parseFloat(btn.getAttribute('data-step'));
            const input = document.getElementById(targetId);
            if (input) {
                let val = parseFloat(input.value) + step;
                const min = parseFloat(input.min);
                const max = parseFloat(input.max);
                if (!isNaN(min)) val = Math.max(min, val);
                if (!isNaN(max)) val = Math.min(max, val);
                
                // Format decimal output to step resolution
                input.value = val.toFixed(2);
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    // Roll Direction Radios
    const radios = document.getElementsByName('rollDirection');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            params.rollDirection = e.target.value;
            rebuild();
        });
    });

    // Render Mode Buttons
    document.getElementById('btn-render-mode').addEventListener('click', () => {
        document.getElementById('btn-render-mode').classList.add('active');
        document.getElementById('btn-blueprint-mode').classList.remove('active');
        params.mode = 'rendered';
        rebuild();
    });
    document.getElementById('btn-blueprint-mode').addEventListener('click', () => {
        document.getElementById('btn-blueprint-mode').classList.add('active');
        document.getElementById('btn-render-mode').classList.remove('active');
        params.mode = 'blueprint';
        rebuild();
    });

    // Visibility toggles
    const bindVisibility = (id, key) => {
        document.getElementById(id).addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuild();
        });
    };
    bindVisibility('show-topCap', 'topCap');
    bindVisibility('show-bottomCap', 'bottomCap');
    bindVisibility('show-sheet', 'sheet');
    bindVisibility('show-brackets', 'brackets');

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
    document.getElementById('btn-export-bracket').addEventListener('click', exportBracketSTL);
}

// Math/Geometry creation helpers
function makeCSGCylinder(r, h, x, y, z) {
    let cyl = Manifold.cylinder(h, r, r, 64, true);
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    return cyl;
}

function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// Generate the cap using Manifold WASM
function generateCapGeometry(D_in, D_out, hasSlipRing, isTopCap = false) {
    if (!Manifold) return null;

    const c = params.tolerance;
    const T_cap = params.wallThick;
    const H_lip = params.lipDepth;
    const H_cap = H_lip + T_cap;

    // Groove boundaries
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;

    // Cap boundaries
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Center Hole Radius (Slip ring overrides to 13mm diameter / 6.5mm radius)
    const R_hole = hasSlipRing ? 6.5 : (params.holeDiam / 2);

    // 1. Create outer body solid
    let capBody = makeCSGCylinder(R_cap_out, H_cap, 0, 0, H_cap / 2);

    // 2. Subtract LED strip channels on the inner lip
    if (params.ledCount > 0) {
        const count = params.ledCount;
        const w = params.ledWidth;
        const d = params.ledDepth;
        for (let i = 0; i < count; i++) {
            const theta = (i * 2 * Math.PI) / count;
            // Create channel box centered at origin
            let box = Manifold.cube([w, d, H_cap + 2.0], true);
            // Translate it radially to the outer edge of inner lip (R_g_in)
            let translated = box.translate([0, R_g_in - d / 2, H_cap / 2]);
            // Rotate around center axis
            let rotated = translated.rotate([0, 0, (theta * 180) / Math.PI]);
            box.delete();
            translated.delete();

            // Subtract from main body
            let tempBody = capBody.subtract(rotated);
            capBody.delete();
            rotated.delete();
            capBody = tempBody;
        }
    }

    // 2.5 Add Side Bracket Tabs and subtract vertical M3 screw holes (radius 1.5mm)
    // Positioned halfway between the LED channels to prevent intersection
    if (params.bracketCount > 0) {
        const count = params.bracketCount;
        const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
        const holeRad = 1.5; // M3 screw pilot radius (3.0mm diameter)
        const tabRad = 4.5;  // Tab radius (9.0mm diameter for solid bracket mount)

        // Union the solid tabs to the cap body first
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            // Create tab cylinder shifted 8mm inward (further inland to avoid damaging lips)
            let tab = makeCSGCylinder(tabRad, H_cap, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedTab = tab.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            tab.delete();

            let tempBody = capBody.add(rotatedTab);
            capBody.delete();
            rotatedTab.delete();
            capBody = tempBody;
        }

        // Subtract the vertical screw pilot holes through the tabs (cutting completely through caps)
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            let hole = makeCSGCylinder(holeRad, H_cap + 2.0, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedHole = hole.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            hole.delete();

            let tempBody = capBody.subtract(rotatedHole);
            capBody.delete();
            rotatedHole.delete();
            capBody = tempBody;
        }
    }

    // 3. Create groove cut solid (groove outer cylinder - groove inner cylinder)
    let grOuter = makeCSGCylinder(R_g_out, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let grInner = makeCSGCylinder(R_g_in, H_lip + 2.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let groove = grOuter.subtract(grInner);
    grOuter.delete();
    grInner.delete();

    // 4. Create central cavity cutout (hollow out the inside of the inner lip)
    // Starts at Z = T_cap (bottom plate thickness) and goes out of the top
    let cavity = makeCSGCylinder(R_cap_in, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);

    // 5. Create center hole cut solid
    let hole = makeCSGCylinder(R_hole, H_cap + 2.0, 0, 0, H_cap / 2);

    // 6. Subtract groove, cavity, and hole from body
    let temp1 = capBody.subtract(groove);
    capBody.delete();
    groove.delete();

    let temp2 = temp1.subtract(cavity);
    temp1.delete();
    cavity.delete();

    let finalizedCap = temp2.subtract(hole);
    temp2.delete();
    hole.delete();

    return finalizedCap;
}

// Generate a C-shaped seam-securing bracket using Manifold WASM
function generateBracketGeometry(D_out, tubeHeight_mm) {
    if (!Manifold) return null;

    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + params.tolerance;
    const R_cap_out = R_g_out + T_cap;
    const H_bracket = tubeHeight_mm + 2 * T_cap;

    // 1. Vertical bar on the side of the caps (extended by 6mm to prevent top/bottom notches)
    // Thicken the bar so it extends inwards from the outer edge (R_cap_out + 3.0) to touch the cylinder outer surface (D_out / 2)
    const W_vert = (R_cap_out + 3.0) - (D_out / 2);
    let vertBar = Manifold.cube([W_vert, 8.0, H_bracket + 6.0], true);
    let vertBarTrans = vertBar.translate([(D_out / 2) + W_vert / 2, 0, H_bracket / 2]);
    vertBar.delete();

    // 2. Top arm extending inwards over the top cap (extended to 12.0mm length radially to cover the inland hole)
    let topArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let topArmTrans = topArm.translate([R_cap_out - 4.5, 0, H_bracket + 1.5]);
    topArm.delete();

    // 3. Bottom arm extending inwards under the bottom cap (extended)
    let bottomArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let bottomArmTrans = bottomArm.translate([R_cap_out - 4.5, 0, -1.5]);
    bottomArm.delete();

    // Union vertical bar and arms
    let temp1 = vertBarTrans.add(topArmTrans);
    vertBarTrans.delete();
    topArmTrans.delete();

    let bracketBody = temp1.add(bottomArmTrans);
    temp1.delete();
    bottomArmTrans.delete();

    // Subtract vertical screw holes (radius 1.5mm) shifted 8mm inward to avoid damaging lips
    let topHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, H_bracket + 1.5);
    let bottomHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, -1.5);

    let temp2 = bracketBody.subtract(topHole);
    bracketBody.delete();
    topHole.delete();

    let temp3 = temp2.subtract(bottomHole);
    temp2.delete();
    bottomHole.delete();

    // 4. Subtract Cap and Cylinder geometries to prevent clipping
    const L_mm = params.rollDirection === 'width' ? params.sheetWidth * 25.4 : params.sheetHeight * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_in = D_mid - params.sheetThickness;

    // Generate cap volumes for subtraction (top cap must be generated with isTopCap=true so its slots align with the viewport top cap)
    let capB = generateCapGeometry(D_in, D_out, false, false);
    let capT = generateCapGeometry(D_in, D_out, false, true);
    
    // Position Top Cap volume (flipped and translated)
    let capTRot = capT.rotate([180, 0, 0]);
    let capTTrans = capTRot.translate([0, 0, tubeHeight_mm + 2 * T_cap]);
    capT.delete();
    capTRot.delete();

    // Subtract caps
    let temp4 = temp3.subtract(capB);
    temp3.delete();
    capB.delete();

    let temp5 = temp4.subtract(capTTrans);
    temp4.delete();
    capTTrans.delete();

    // Subtract Sheet Cylinder (slightly larger radius for fit/clearance subtraction)
    let sheetCutout = makeCSGCylinder(D_out / 2, tubeHeight_mm, 0, 0, T_cap + tubeHeight_mm / 2);
    let finalizedBracket = temp5.subtract(sheetCutout);
    temp5.delete();
    sheetCutout.delete();

    return finalizedBracket;
}

// Rebuild the 3D Viewport representation
function rebuild() {
    // Clear old meshes
    if (bottomCapMesh) {
        mainGroup.remove(bottomCapMesh);
        bottomCapMesh.geometry.dispose();
        bottomCapMesh = null;
    }
    if (topCapMesh) {
        mainGroup.remove(topCapMesh);
        topCapMesh.geometry.dispose();
        topCapMesh = null;
    }
    if (sheetMesh) {
        mainGroup.remove(sheetMesh);
        sheetMesh.geometry.dispose();
        sheetMesh = null;
    }

    if (!Manifold) return;

    // 1. Perform Math calculations
    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;
    const t_in = t_mm / 25.4;

    // Wrapping dimension L in mm
    let L_mm, tubeHeight_mm, rollLabel;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
        tubeHeight_mm = h_in * 25.4;
        rollLabel = `Width (${w_in.toFixed(2)}")`;
    } else {
        L_mm = h_in * 25.4;
        tubeHeight_mm = w_in * 25.4;
        rollLabel = `Height (${h_in.toFixed(2)}")`;
    }

    // Dynamic roll button label updates
    const lblWidth = document.getElementById('label-rollWidth');
    if (lblWidth) lblWidth.innerText = `ROLL WIDTH (${w_in.toFixed(2)}")`;
    const lblHeight = document.getElementById('label-rollHeight');
    if (lblHeight) lblHeight.innerText = `ROLL HEIGHT (${h_in.toFixed(2)}")`;

    // Midline (neutral axis), Outer, Inner Diameters
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Cap design dimensions
    const c = params.tolerance;
    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Limit maximum center hole size to prevent self-intersection of cap
    const maxHoleDiam = Math.max(0, R_cap_in * 2 - 1.0);
    const holeSlider = document.getElementById('input-holeDiam');
    if (holeSlider) {
        holeSlider.max = Math.ceil(maxHoleDiam);
        if (params.holeDiam > maxHoleDiam) {
            params.holeDiam = Math.min(params.holeDiam, maxHoleDiam);
            document.getElementById('val-holeDiam').innerText = params.holeDiam.toFixed(1);
            holeSlider.value = params.holeDiam;
        }
    }

    // 2. Update Spec sheets in UI
    document.getElementById('spec-circumference').innerText = `${L_mm.toFixed(2)} mm (${(L_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dmid').innerText = `${D_mid.toFixed(2)} mm (${(D_mid / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dout').innerText = `${D_out.toFixed(2)} mm (${(D_out / 25.4).toFixed(3)}")`;
    document.getElementById('spec-din').innerText = `${D_in.toFixed(2)} mm (${(D_in / 25.4).toFixed(3)}")`;
    document.getElementById('spec-height').innerText = `${tubeHeight_mm.toFixed(2)} mm (${(tubeHeight_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-cap-od').innerText = `${(R_cap_out * 2).toFixed(2)} mm`;

    // 3. Materials
    let bodyMat, lineColor;
    if (params.mode === 'rendered') {
        bodyMat = new THREE.MeshPhysicalMaterial({
            color: colors.cyanIce,
            emissive: 0x001a22,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.75,
            thickness: T_cap,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: params.opacity / 100,
            side: THREE.DoubleSide
        });
        lineColor = 0xffffff;
    } else {
        bodyMat = new THREE.MeshBasicMaterial({
            color: colors.blueprintFace,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        lineColor = colors.blueprintLine;
    }

    // 4. Generate & Render Bottom Cap
    if (visibilities.bottomCap) {
        const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
        const bottomCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingBottom, false);
        if (bottomCapGeom) {
            const bCapMesh = bottomCapGeom.getMesh();
            const bCapThreeGeom = manifoldToThree(bCapMesh);
            bottomCapGeom.delete();

            bottomCapMesh = new THREE.Mesh(bCapThreeGeom, bodyMat);
            bottomCapMesh.castShadow = true;
            bottomCapMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(bCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                bottomCapMesh.add(lines);
            }
            mainGroup.add(bottomCapMesh);
        }
    }

    // 5. Generate & Render Top Cap (translated to the top of the cylinder and flipped)
    if (visibilities.topCap) {
        const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';
        const topCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingTop, true);
        if (topCapGeom) {
            const tCapMesh = topCapGeom.getMesh();
            const tCapThreeGeom = manifoldToThree(tCapMesh);
            topCapGeom.delete();

            topCapMesh = new THREE.Mesh(tCapThreeGeom, bodyMat);
            topCapMesh.castShadow = true;
            topCapMesh.receiveShadow = true;

            // Rotate 180 degrees around X-axis so it faces down
            topCapMesh.rotation.x = Math.PI;
            // Translate Z to top position (Z-up in CAD coords)
            const H_cap = params.lipDepth + T_cap;
            topCapMesh.position.z = tubeHeight_mm + 2 * T_cap;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(tCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                topCapMesh.add(lines);
            }
            mainGroup.add(topCapMesh);
        }
    }

    // 6. Generate & Render Rolled Sheet (Semi-transparent cyan Cylinder)
    if (visibilities.sheet) {
        // Tube geometry: outer cylinder + inner cylinder.
        // It starts at Z = T_cap and ends at Z = T_cap + tubeHeight_mm.
        const sheetGeom = new THREE.CylinderGeometry(D_out/2, D_out/2, tubeHeight_mm, 64, 1, true);
        sheetGeom.rotateX(Math.PI/2); // Align with Z-axis
        
        const sheetMaterial = new THREE.MeshPhysicalMaterial({
            color: colors.sheetBlue,
            roughness: 0.2,
            metalness: 0.1,
            transmission: 0.8,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        sheetMesh = new THREE.Mesh(sheetGeom, sheetMaterial);
        // Translate along Z so it sits perfectly in the bottom cap groove
        sheetMesh.position.z = T_cap + tubeHeight_mm / 2;

        if (params.mode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(sheetGeom);
            const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.limeAccent, linewidth: 1.0 }));
            sheetMesh.add(lines);
        }

        mainGroup.add(sheetMesh);
    }

    // Clear old brackets meshes from 3D scene
    for (let m of bracketMeshes) {
        mainGroup.remove(m);
        m.geometry.dispose();
    }
    bracketMeshes = [];

    // 7. Generate & Render Brackets (C-shaped side fasteners)
    if (visibilities.brackets && params.bracketCount > 0) {
        const bracketGeom = generateBracketGeometry(D_out, tubeHeight_mm);
        if (bracketGeom) {
            const bMesh = bracketGeom.getMesh();
            const bThreeGeom = manifoldToThree(bMesh);
            bracketGeom.delete();

            let bracketMat, bLineColor;
            if (params.mode === 'rendered') {
                bracketMat = new THREE.MeshPhysicalMaterial({
                    color: colors.limeAccent,
                    emissive: 0x1a2200,
                    roughness: 0.2,
                    metalness: 0.3,
                    transmission: 0.4,
                    thickness: 3.0,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
                bLineColor = 0xffffff;
            } else {
                bracketMat = new THREE.MeshBasicMaterial({
                    color: 0x121c01,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                bLineColor = colors.limeAccent;
            }

            const count = params.bracketCount;
            const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;

            for (let j = 0; j < count; j++) {
                const theta = (j * 2 * Math.PI) / count + offsetAngle;
                const mesh = new THREE.Mesh(bThreeGeom, bracketMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Rotate around Z axis to match cap tabs position
                mesh.rotation.z = theta;

                if (params.mode === 'blueprint') {
                    const edges = new THREE.EdgesGeometry(bThreeGeom);
                    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: bLineColor, linewidth: 1.5 }));
                    mesh.add(lines);
                }

                mainGroup.add(mesh);
                bracketMeshes.push(mesh);
            }
        }
    }
}

// STL Export: Compile watertight binary STL
function exportSTL() {
    if (!Manifold) return;

    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;

    let L_mm;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
    } else {
        L_mm = h_in * 25.4;
    }

    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Helper to download single STL
    const downloadCap = (hasSlipRing, nameSuffix, isTop) => {
        const cap = generateCapGeometry(D_in, D_out, hasSlipRing, isTop);
        if (!cap) return;

        const mesh = cap.getMesh();
        cap.delete();

        const totalTriangles = mesh.triVerts.length / 3;
        const buffer = new ArrayBuffer(84 + totalTriangles * 50);
        const view = new DataView(buffer);

        const headerStr = `Cylinder Cap (${nameSuffix}) - Generated via Antigravity CAD (2026)`;
        for (let i = 0; i < Math.min(80, headerStr.length); i++) {
            view.setUint8(i, headerStr.charCodeAt(i));
        }

        view.setUint32(80, totalTriangles, true);

        let offset = 84;
        const getVert = (idx) => {
            return [
                mesh.vertProperties[idx * 3],
                mesh.vertProperties[idx * 3 + 1],
                mesh.vertProperties[idx * 3 + 2]
            ];
        };

        for (let i = 0; i < totalTriangles; i++) {
            const i0 = mesh.triVerts[i * 3];
            const i1 = mesh.triVerts[i * 3 + 1];
            const i2 = mesh.triVerts[i * 3 + 2];

            const v0 = getVert(i0);
            const v1 = getVert(i1);
            const v2 = getVert(i2);

            view.setFloat32(offset, 0, true);
            view.setFloat32(offset + 4, 0, true);
            view.setFloat32(offset + 8, 0, true);

            view.setFloat32(offset + 12, v0[0], true);
            view.setFloat32(offset + 16, v0[1], true);
            view.setFloat32(offset + 20, v0[2], true);

            view.setFloat32(offset + 24, v1[0], true);
            view.setFloat32(offset + 28, v1[1], true);
            view.setFloat32(offset + 32, v1[2], true);

            view.setFloat32(offset + 36, v2[0], true);
            view.setFloat32(offset + 40, v2[1], true);
            view.setFloat32(offset + 44, v2[2], true);

            view.setUint16(offset + 48, 0, true);
            offset += 50;
        }

        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cylinder_cap_${nameSuffix}_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
        link.click();
    };

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    if (params.slipRing === 'bottom' || params.slipRing === 'top' || params.bracketCount > 0) {
        // Caps are asymmetric, download both
        downloadCap(hasSlipRingBottom, "bottom_cap", false);
        setTimeout(() => {
            downloadCap(hasSlipRingTop, "top_cap", true);
        }, 300);
    } else {
        // Caps are symmetric (either both have slip ring or neither, and no brackets)
        downloadCap(hasSlipRingBottom, params.slipRing === 'both' ? "with_slipring" : "standard", false);
    }
}

// STL Export: Compile single C-shaped bracket
function exportBracketSTL() {
    if (!Manifold) return;

    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;
    const L_mm = params.rollDirection === 'width' ? w_in * 25.4 : h_in * 25.4;
    const tubeHeight_mm = params.rollDirection === 'width' ? h_in * 25.4 : w_in * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;

    const bracket = generateBracketGeometry(D_out, tubeHeight_mm);
    if (!bracket) return;

    const mesh = bracket.getMesh();
    bracket.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "Cylinder Seam Bracket - Generated via Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    view.setUint32(80, totalTriangles, true);

    let offset = 84;
    const getVert = (idx) => {
        return [
            mesh.vertProperties[idx * 3],
            mesh.vertProperties[idx * 3 + 1],
            mesh.vertProperties[idx * 3 + 2]
        ];
    };

    for (let i = 0; i < totalTriangles; i++) {
        const i0 = mesh.triVerts[i * 3];
        const i1 = mesh.triVerts[i * 3 + 1];
        const i2 = mesh.triVerts[i * 3 + 2];

        const v0 = getVert(i0);
        const v1 = getVert(i1);
        const v2 = getVert(i2);

        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);

        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cylinder_seam_bracket_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
    link.click();
}

// Technical Dimensioning SVG Overlay
function updateLeaderLines() {
    overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1, color = '#00f3ff') => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        
        mainGroup.updateMatrixWorld();
        vector.applyMatrix4(mainGroup.matrixWorld);
        vector.project(camera);

        const x = (vector.x * .5 + .5) * width;
        const y = (-(vector.y * .5) + .5) * height;

        if (vector.z <= 1 && x >= 0 && x <= width && y >= 0 && y <= height) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', '#ffffff');
            group.appendChild(dot);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            const targetX = x + 35 * dirX;
            const targetY = y + 25 * dirY;
            const endX = targetX + 35 * dirX;
            line.setAttribute('points', `${x},${y} ${targetX},${targetY} ${endX},${targetY}`);
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', '1');
            line.setAttribute('fill', 'none');
            group.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', targetX);
            text.setAttribute('y', targetY - 5);
            text.setAttribute('fill', '#ffffff');
            text.setAttribute('font-size', '10px');
            text.setAttribute('font-family', 'Space Mono');
            if (dirX < 0) {
                text.setAttribute('text-anchor', 'end');
            }
            text.textContent = textLabel;
            group.appendChild(text);

            overlaySvg.appendChild(group);
        }
    };

    // Calculate dimensions variables
    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;
    const L_mm = params.rollDirection === 'width' ? w_in * 25.4 : h_in * 25.4;
    const tubeHeight_mm = params.rollDirection === 'width' ? h_in * 25.4 : w_in * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const T_cap = params.wallThick;
    const R_cap_out = R_g_out + T_cap;

    // Leader lines pointing to cap outer edge, sheet edge, and overall height
    if (visibilities.bottomCap) {
        const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
        const holeText = hasSlipRingBottom ? "Slip Ring Hole: Ø13.0mm" : `Hole: Ø${params.holeDiam.toFixed(1)}mm`;
        drawDimension(
            new THREE.Vector3(R_cap_out, 0, T_cap / 2),
            `Cap OD: Ø${(R_cap_out * 2).toFixed(1)}mm`,
            1, -1, colors.blueprintLine
        );
        drawDimension(
            new THREE.Vector3(0, 0, 0),
            holeText,
            -1, 1, colors.limeAccent
        );
        if (params.bracketCount > 0) {
            const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
            drawDimension(
                new THREE.Vector3((R_cap_out - 8.0) * Math.cos(offsetAngle), (R_cap_out - 8.0) * Math.sin(offsetAngle), T_cap + params.lipDepth),
                `M3 Screw Hole: Ø3.0mm`,
                1, 1, colors.limeAccent
            );
        }
    }
    if (visibilities.sheet) {
        drawDimension(
            new THREE.Vector3(0, D_out / 2, T_cap + tubeHeight_mm / 2),
            `Tube Height: ${tubeHeight_mm.toFixed(1)}mm`,
            1, 1, colors.limeAccent
        );
        drawDimension(
            new THREE.Vector3(-D_out / 2, 0, T_cap + tubeHeight_mm / 2),
            `Sheet Thickness: ${t_mm.toFixed(2)}mm`,
            -1, -1, colors.blueprintLine
        );
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Auto rotate very slowly if user is idle
    if (controls.state === -1) {
        mainGroup.rotation.z += 0.001;
    }

    renderer.render(scene, camera);
    updateLeaderLines();
}

// Setup and start
init();
