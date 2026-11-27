import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';

// Lazy-load Manifold WASM
let M = null;
async function getManifold() {
    if (M) return M;
    const module = await import('https://unpkg.com/manifold-3d/manifold.js');
    const wasm = await module.default();
    wasm.setup();
    M = wasm.Manifold;
    return M;
}

// Modeling helper shortcuts
const box = (w, d, h) => M.cube([w, d, h], true);
const cyl = (r, h, s=32) => M.cylinder(h, r, r, s, true);

// Core App State
const parts = {
    'part-18650': {
        name: 'BatteryHolder',
        props: { batD: 18.6, batL: 66.0, wall: 3.0 },
        mesh: null,
        model: null,
        rotation: 0,
        build: (p) => {
            const outerW = p.batD + 2 * p.wall;
            const outerH = p.batD + 2 * p.wall;
            const outerL = p.batL + 2 * p.wall;
            
            let outer = box(outerW, outerH, outerL);
            let batCut = cyl(p.batD/2, p.batL + 0.1, 48).rotate([90, 0, 0]);
            let topCut = box(p.batD - 2, p.batD + p.wall*2 + 2, p.batL - 6).translate([0, p.batD/2 + p.wall, 0]);
            let endCut = box(p.batD - 4, p.batD - 4, outerL + 2).translate([0, 0, 0]);
            let entrySlope = box(p.batD + 4, p.wall * 2, p.batL - 6).rotate([15, 0, 0]).translate([0, p.batD/2 + p.wall + 1, 0]);
            
            let model = outer.subtract(batCut).subtract(topCut).subtract(endCut).subtract(entrySlope);
            
            [outer, batCut, topCut, endCut, entrySlope].forEach(m => m.delete());
            return model;
        }
    },
    'part-esp32': {
        name: 'ESP32Cradle',
        props: { boardW: 28.5, boardL: 52.5, wallH: 7.5 },
        mesh: null,
        model: null,
        rotation: 0,
        build: (p) => {
            const wall = 3.0;
            const baseH = 2.5;
            const grip = 1.2;
            const outerW = p.boardW + 2 * wall;
            const outerL = p.boardL + 2 * wall;
            
            let base = box(outerW, outerL, baseH);
            let wallLeft = box(wall, outerL, p.wallH).translate([-(p.boardW/2 + wall/2), 0, p.wallH/2 - baseH/2]);
            let wallRight = box(wall, outerL, p.wallH).translate([(p.boardW/2 + wall/2), 0, p.wallH/2 - baseH/2]);
            let wallBack = box(outerW, wall, p.wallH).translate([0, -(p.boardL/2 + wall/2), p.wallH/2 - baseH/2]);
            
            let gripLeft = box(grip, outerL, 1.2).translate([-(p.boardW/2 - grip/2), 0, p.wallH - baseH/2 - 0.6]);
            let gripRight = box(grip, outerL, 1.2).translate([(p.boardW/2 - grip/2), 0, p.wallH - baseH/2 - 0.6]);
            
            let earsL = box(8, 12, baseH).translate([-(outerW/2 + 4), 0, 0]);
            let earsR = box(8, 12, baseH).translate([(outerW/2 + 4), 0, 0]);
            let holeL = cyl(1.6, 6).translate([-(outerW/2 + 4), 0, 0]);
            let holeR = cyl(1.6, 6).translate([(outerW/2 + 4), 0, 0]);
            
            let ears = earsL.add(earsR).subtract(holeL).subtract(holeR);
            
            let model = base.add(wallLeft).add(wallRight).add(wallBack).add(gripLeft).add(gripRight).add(ears);
            
            [base, wallLeft, wallRight, wallBack, gripLeft, gripRight, earsL, earsR, holeL, holeR, ears].forEach(m => m.delete());
            return model;
        }
    },
    'part-tp4056': {
        name: 'TP4056Cradle',
        props: { w: 17.5, l: 28.5, wall: 2.0 },
        mesh: null,
        model: null,
        rotation: 0,
        build: (p) => {
            const outerW = p.w + 2 * p.wall;
            const outerL = p.l + 2 * p.wall;
            const wallH = 6.0;
            
            let base = box(outerW, outerL, 2.0);
            let leftW = box(p.wall, outerL, wallH).translate([-(p.w/2 + p.wall/2), 0, wallH/2 - 1.0]);
            let rightW = box(p.wall, outerL, wallH).translate([(p.w/2 + p.wall/2), 0, wallH/2 - 1.0]);
            let backW = box(outerW, p.wall, wallH).translate([0, -(p.l/2 + p.wall/2), wallH/2 - 1.0]);
            let portsCut = box(12, p.wall + 2, 4.0).translate([0, p.l/2 + p.wall/2, 1.0]);
            
            let clipsL = box(0.8, 6.0, 1.0).translate([-(p.w/2 - 0.4), 0, wallH - 1.5]);
            let clipsR = box(0.8, 6.0, 1.0).translate([(p.w/2 - 0.4), 0, wallH - 1.5]);
            
            let model = base.add(leftW).add(rightW).add(backW).subtract(portsCut).add(clipsL).add(clipsR);
            
            [base, leftW, rightW, backW, portsCut, clipsL, clipsR].forEach(m => m.delete());
            return model;
        }
    },
    'part-l298n': {
        name: 'L298NCradle',
        props: { w: 24.5, l: 22.5, baseT: 2.5 },
        mesh: null,
        model: null,
        rotation: 0,
        build: (p) => {
            const wall = 2.5;
            const h = 7.0;
            const outerW = p.w + 2 * wall;
            const outerL = p.l + 2 * wall;
            
            let base = box(outerW, outerL, p.baseT);
            let wallL = box(wall, outerL, h).translate([-(p.w/2 + wall/2), 0, h/2 - p.baseT/2]);
            let wallR = box(wall, outerL, h).translate([(p.w/2 + wall/2), 0, h/2 - p.baseT/2]);
            
            let mountingTabL = box(6, 8, p.baseT).translate([-(outerW/2 + 3), 0, 0]);
            let mountingTabR = box(6, 8, p.baseT).translate([(outerW/2 + 3), 0, 0]);
            let screwL = cyl(1.6, 10).translate([-(outerW/2 + 3), 0, 0]);
            let screwR = cyl(1.6, 10).translate([(outerW/2 + 3), 0, 0]);
            
            let tabs = mountingTabL.add(mountingTabR).subtract(screwL).subtract(screwR);
            
            let model = base.add(wallL).add(wallR).add(tabs);
            
            [base, wallL, wallR, mountingTabL, mountingTabR, screwL, screwR, tabs].forEach(m => m.delete());
            return model;
        }
    },
    'part-motor': {
        name: 'HapticMotorClamp',
        props: { innerR: 8.0, clampL: 15.0, screwD: 3.2 },
        mesh: null,
        model: null,
        rotation: 0,
        build: (p) => {
            const wall = 3.0;
            const tabW = 10.0;
            const tabT = 4.0;
            
            // Create base cylinders
            let clOuter = cyl(p.innerR + wall, p.clampL, 48);
            let clInner = cyl(p.innerR, p.clampL + 2, 48);
            
            // Cradle (Bottom half, Y < 0)
            let cutTop = box(200, 200, p.clampL + 4).translate([0, 100, 0]);
            let cradleRing = clOuter.subtract(clInner).subtract(cutTop);
            
            // Cradle ears (flanges) aligned at Y = 0
            let cL = box(tabW, tabT, p.clampL).translate([-(p.innerR + tabW/2), -tabT/2, 0]);
            let cR = box(tabW, tabT, p.clampL).translate([(p.innerR + tabW/2), -tabT/2, 0]);
            let cradleBody = cradleRing.add(cL).add(cR);
            
            // Strap (Top half, Y > 0)
            let cutBtm = box(200, 200, p.clampL + 4).translate([0, -100, 0]);
            let strapRing = clOuter.subtract(clInner).subtract(cutBtm);
            
            // Strap ears (flanges) aligned at Y = 0
            let sL = box(tabW, tabT, p.clampL).translate([-(p.innerR + tabW/2), tabT/2, 0]);
            let sR = box(tabW, tabT, p.clampL).translate([(p.innerR + tabW/2), tabT/2, 0]);
            let strapBody = strapRing.add(sL).add(sR);
            
            // Drill screw holes through flanges
            let screwL = cyl(p.screwD/2, 40, 16).rotate([90, 0, 0]).translate([-(p.innerR + tabW/2), 0, 0]);
            let screwR = cyl(p.screwD/2, 40, 16).rotate([90, 0, 0]).translate([(p.innerR + tabW/2), 0, 0]);
            
            let cradleFinal = cradleBody.subtract(screwL).subtract(screwR);
            let strapFinal = strapBody.subtract(screwL).subtract(screwR);
            
            // Exploded translation for the upper strap
            let strapExploded = strapFinal.translate([0, p.innerR + 8, 0]);
            
            let model = cradleFinal.add(strapExploded);
            
            [clOuter, clInner, cutTop, cutBtm, cradleRing, cL, cR, cradleBody, strapRing, sL, sR, strapBody, screwL, screwR, cradleFinal, strapFinal, strapExploded].forEach(m => m.delete());
            return model;
        }
    }
};

// Initialize Three.js Scissor Renderer
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x111115, 1.3));

const mainLight = new THREE.DirectionalLight(0x00f3ff, 1.5);
mainLight.position.set(30, 80, 40);
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0xff00ff, 0.8);
fillLight.position.set(-30, -50, -20);
scene.add(fillLight);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);

// Track resize events
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Convert Manifold geometry to a Three.js Mesh
function manifoldToThreeMesh(model, colorHex) {
    const meshData = model.getMesh();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.triVerts, 1));
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        roughness: 0.15,
        metalness: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(geometry, material);
}

// Core geometry generator and builder
async function updatePartGeometry(cardId) {
    const part = parts[cardId];
    if (!part) return;

    // Load Manifold
    await getManifold();

    // Clear old mesh
    if (part.mesh) {
        scene.remove(part.mesh);
        part.mesh.geometry.dispose();
        part.mesh.material.dispose();
    }
    if (part.model) {
        part.model.delete();
    }

    try {
        // Build new manifold
        const model = part.build(part.props);
        part.model = model;
        
        // Color mapping depending on type
        let color = 0x00f3ff;
        if (cardId === 'part-18650') color = 0x00ffaa;
        if (cardId === 'part-esp32') color = 0x00f3ff;
        if (cardId === 'part-tp4056') color = 0xff00ff;
        if (cardId === 'part-l298n') color = 0x3b82f6;
        if (cardId === 'part-motor') color = 0xf97316;

        const mesh = manifoldToThreeMesh(model, color);
        // Standardize base rotation so they render nicely
        mesh.rotation.x = -Math.PI / 4;
        part.mesh = mesh;
    } catch (err) {
        console.error(`Error generating CAD part: ${cardId}`, err);
    }
}

// Export STL file utility
function exportSTL(model, name) {
    if (!model) return;
    const mesh = model.getMesh();
    let stl = `solid ${name}\n`;
    for (let i = 0; i < mesh.triVerts.length; i += 3) {
        const i1 = mesh.triVerts[i], i2 = mesh.triVerts[i+1], i3 = mesh.triVerts[i+2];
        const v1 = [mesh.vertProperties[i1*3], mesh.vertProperties[i1*3+1], mesh.vertProperties[i1*3+2]];
        const v2 = [mesh.vertProperties[i2*3], mesh.vertProperties[i2*3+1], mesh.vertProperties[i2*3+2]];
        const v3 = [mesh.vertProperties[i3*3], mesh.vertProperties[i3*3+1], mesh.vertProperties[i3*3+2]];
        stl += `facet normal 0 0 0\n  outer loop\n    vertex ${v1[0]} ${v1[1]} ${v1[2]}\n    vertex ${v2[0]} ${v2[1]} ${v2[2]}\n    vertex ${v3[0]} ${v3[1]} ${v3[2]}\n  endloop\nendfacet\n`;
    }
    stl += `endsolid ${name}`;
    const blob = new Blob([stl], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.stl`; a.click();
    URL.revokeObjectURL(url);
}

// Render loop with low FPS (10 FPS) rotation constraint, but smooth 60 FPS scrolling
let lastTime = 0;
function renderLoop(time) {
    requestAnimationFrame(renderLoop);

    // Decouple rotation tick: rotation angle updates only every 100ms (~10 FPS)
    let updateRotation = false;
    if (time && time - lastTime >= 100) {
        updateRotation = true;
        lastTime = time;
    }

    // Always clear the screen at 60 FPS to keep viewports in sync with scrolling cards
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    // Render each card
    Object.keys(parts).forEach(cardId => {
        const part = parts[cardId];
        if (!part.mesh) return;

        const cardEl = document.getElementById(cardId);
        if (!cardEl) return;

        const placeholder = cardEl.querySelector('.viewport-placeholder');
        if (!placeholder) return;

        const rect = placeholder.getBoundingClientRect();
        
        // Only render if card is visible on screen
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        const canvasBottom = window.innerHeight - rect.bottom;
        renderer.setViewport(rect.left, canvasBottom, rect.width, rect.height);
        renderer.setScissor(rect.left, canvasBottom, rect.width, rect.height);

        // Increment rotation of the mesh at 10 FPS
        if (updateRotation) {
            part.rotation += 0.04;
        }
        part.mesh.rotation.y = part.rotation;

        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();

        // Compute bounding sphere for zoom fitting
        const dist = 75;
        camera.position.set(0, dist * 0.7, dist * 0.9);
        camera.lookAt(0, 0, 0);

        scene.add(part.mesh);
        renderer.render(scene, camera);
        scene.remove(part.mesh);
    });
}

// Initial setup and bindings
async function init() {
    // Build all models initially
    const keys = Object.keys(parts);
    for (let k of keys) {
        await updatePartGeometry(k);
    }

    // Bind slider change events
    document.querySelectorAll('.card').forEach(card => {
        const cardId = card.id;
        const part = parts[cardId];
        if (!part) return;

        card.querySelectorAll('.param-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const prop = e.target.getAttribute('data-prop');
                const val = parseFloat(e.target.value);
                
                // Update app state values
                part.props[prop] = val;

                // Update DOM texts
                const valDisplay = card.querySelector(`#val-${prop}`) || card.querySelector(`#val-${cardId}`);
                if (valDisplay) valDisplay.textContent = `${val.toFixed(1)} mm`;

                const hudDisplay = card.querySelector(`#hud-${prop}`) || card.querySelector(`#hud-${cardId}`);
                if (hudDisplay) hudDisplay.textContent = `${val.toFixed(1)}mm`;

                // Rebuild model geometry
                updatePartGeometry(cardId);
            });
        });

        // Download STL binding
        card.querySelector('.export-btn').addEventListener('click', () => {
            exportSTL(part.model, part.name);
        });
    });

    // Start the low-fps loop
    requestAnimationFrame(renderLoop);
}

init();
