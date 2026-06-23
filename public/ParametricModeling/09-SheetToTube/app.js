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
    opacity: 90,
    mode: 'blueprint'       // 'rendered' or 'blueprint'
};

const visibilities = {
    topCap: true,
    bottomCap: true,
    sheet: true
};

// Meshes references
let bottomCapMesh = null;
let topCapMesh = null;
let sheetMesh = null;

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

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
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
function generateCapGeometry(D_in, D_out) {
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

    // Center Hole Radius
    const R_hole = params.holeDiam / 2;

    // 1. Create outer body solid
    let capBody = makeCSGCylinder(R_cap_out, H_cap, 0, 0, H_cap / 2);

    // 2. Create groove cut solid (groove outer cylinder - groove inner cylinder)
    let grOuter = makeCSGCylinder(R_g_out, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let grInner = makeCSGCylinder(R_g_in, H_lip + 2.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let groove = grOuter.subtract(grInner);
    grOuter.delete();
    grInner.delete();

    // 3. Create center hole cut solid
    let hole = makeCSGCylinder(R_hole, H_cap + 2.0, 0, 0, H_cap / 2);

    // 4. Subtract groove and hole from body
    let temp1 = capBody.subtract(groove);
    capBody.delete();
    groove.delete();

    let finalizedCap = temp1.subtract(hole);
    temp1.delete();
    hole.delete();

    return finalizedCap;
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
        const bottomCapGeom = generateCapGeometry(D_in, D_out);
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
        const topCapGeom = generateCapGeometry(D_in, D_out);
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

    // Generate cap geometry
    const cap = generateCapGeometry(D_in, D_out);
    if (!cap) return;

    const mesh = cap.getMesh();
    cap.delete();

    // Binary STL compiler
    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    // 80 bytes header
    const headerStr = "Cylinder Cap for Rolled Sheet - Generated via Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    // Number of triangles (4 bytes)
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

        // Face Normal (zeros)
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        // Vertices 1, 2, 3
        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);

        // Attribute byte count (2 bytes)
        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    const label = `cylinder_cap_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}_t_${t_mm.toFixed(2)}mm.stl`;
    link.download = label;
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
        drawDimension(
            new THREE.Vector3(R_cap_out, 0, T_cap / 2),
            `Cap OD: Ø${(R_cap_out * 2).toFixed(1)}mm`,
            1, -1, colors.blueprintLine
        );
        drawDimension(
            new THREE.Vector3(0, 0, 0),
            `Hole: Ø${params.holeDiam.toFixed(1)}mm`,
            -1, 1, colors.limeAccent
        );
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
