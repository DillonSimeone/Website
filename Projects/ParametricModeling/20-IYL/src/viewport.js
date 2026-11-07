// Three.js Viewport & 3D Rendering Module for 20-IYL (Pedestal with Retaining Lip + Drop-In Lid + Universal Sled)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { context, params } from './state.js';
import {
    manifoldToThreeGeometry,
    buildBasePedestal,
    buildTopLid,
    buildPedestal,
    buildSled,
    buildESP32Reference
} from './geometry.js';

let scene, camera, renderer, controls;
let mainAssemblyGroup, handMesh, baseMesh, lidMesh, sledMesh, espGroup;
let gridHelper;

export function initViewport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14); // Studio dark futuristic background
    context.scene = scene;

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(115, 95, 145);
    context.camera = camera;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    context.renderer = renderer;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 36, 0); // Aim at center of hand/pedestal assembly
    context.controls = controls;

    // Studio 3-Point Lighting
    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x00f0ff, 1.3); // Neon Cyan Key
    keyLight.position.set(90, 140, 90);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xff00aa, 0.9); // Neon Magenta Fill
    fillLight.position.set(-90, 60, -70);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.1); // Crisp White Rim
    rimLight.position.set(0, 120, -110);
    scene.add(rimLight);

    // Subtle Ground Grid
    gridHelper = new THREE.GridHelper(260, 26, 0x1a2436, 0x111926);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    mainAssemblyGroup = new THREE.Group();
    scene.add(mainAssemblyGroup);

    // Load Hand STL
    loadHandModel();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewport-container');
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

export function loadHandModel() {
    const loader = new STLLoader();
    const stlPath = './ilyHandStand.stl';

    loader.load(
        stlPath,
        (geometry) => {
            geometry.computeVertexNormals();
            geometry.center();
            geometry.computeBoundingBox();
            const minZ = geometry.boundingBox.min.z;
            geometry.translate(0, 0, -minZ);

            // Re-orient: in Three.js Y is UP
            geometry.rotateX(-Math.PI / 2);
            geometry.rotateY(-Math.PI / 4);

            context.handGeometry = geometry;
            console.log("ilyHandStand.stl loaded and aligned successfully");
            rebuildScene();
        },
        undefined,
        (err) => {
            console.warn("Could not load local ilyHandStand.stl directly, will proceed with parametric geometry:", err);
            rebuildScene();
        }
    );
}

export function rebuildScene() {
    if (!context.Manifold || !mainAssemblyGroup) return;

    while (mainAssemblyGroup.children.length > 0) {
        const obj = mainAssemblyGroup.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
        mainAssemblyGroup.remove(obj);
    }

    const M = context.Manifold;
    const p = params;
    const explode = p.explodedOffset;
    const lidThick = p.lidThickness || 6.0;
    const shelfZ = p.height - lidThick;

    // --- 1. BUILD BASE PEDESTAL (WITH RETAINING LIP) ---
    if (p.showBase && p.displayMode !== 'sled' && p.displayMode !== 'hand' && p.displayMode !== 'lid') {
        const baseManifold = buildBasePedestal(M, p);
        context.currentBaseManifold = baseManifold;
        const baseGeom = manifoldToThreeGeometry(baseManifold);
        baseGeom.rotateX(-Math.PI / 2);

        const baseMat = new THREE.MeshPhysicalMaterial({
            color: p.xrayMode ? 0x00d4ff : 0x00f0ff,
            emissive: 0x002b3d,
            roughness: 0.2,
            metalness: 0.1,
            clearcoat: 0.4,
            transparent: p.xrayMode,
            opacity: p.xrayMode ? 0.35 : 0.95,
            wireframe: false
        });

        baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;

        const edgesGeom = new THREE.EdgesGeometry(baseGeom, 24);
        baseMesh.add(new THREE.LineSegments(
            edgesGeom,
            new THREE.LineBasicMaterial({ color: 0x004d66, linewidth: 1.5, transparent: true, opacity: 0.85 })
        ));
        mainAssemblyGroup.add(baseMesh);
    }

    // --- 2. BUILD DROP-IN TOP LID (100% FLAT BOTTOM AT Z = 0) ---
    if (p.showLid && p.displayMode !== 'sled' && p.displayMode !== 'hand' && p.displayMode !== 'base') {
        const lidManifold = buildTopLid(M, p);
        context.currentLidManifold = lidManifold;
        const lidGeom = manifoldToThreeGeometry(lidManifold);
        lidGeom.rotateX(-Math.PI / 2);

        const lidMat = new THREE.MeshPhysicalMaterial({
            color: p.xrayMode ? 0x00c4ee : 0x00e5ff,
            emissive: 0x002233,
            roughness: 0.18,
            metalness: 0.15,
            clearcoat: 0.45,
            transparent: p.xrayMode,
            opacity: p.xrayMode ? 0.4 : 0.96
        });

        lidMesh = new THREE.Mesh(lidGeom, lidMat);
        lidMesh.castShadow = true;
        lidMesh.receiveShadow = true;

        // In Exploded view: Lid lifts vertically straight UP out of the retaining lip
        const lidLift = explode * 0.75;
        lidMesh.position.set(0, shelfZ + lidLift, 0);

        const lidEdges = new THREE.EdgesGeometry(lidGeom, 24);
        lidMesh.add(new THREE.LineSegments(
            lidEdges,
            new THREE.LineBasicMaterial({ color: 0x005577, linewidth: 1.5, transparent: true, opacity: 0.9 })
        ));
        mainAssemblyGroup.add(lidMesh);
    }

    // --- 3. BUILD UNIVERSAL SLED (WITH SLOPED USB-C SLOT) ---
    if (p.showSled && p.displayMode !== 'hand' && p.displayMode !== 'base' && p.displayMode !== 'lid') {
        const sledManifold = buildSled(M);
        context.currentSledManifold = sledManifold;
        const sledGeom = manifoldToThreeGeometry(sledManifold);
        sledGeom.rotateX(-Math.PI / 2);

        const sledMat = new THREE.MeshPhysicalMaterial({
            color: 0xffaa00,
            emissive: 0x332200,
            roughness: 0.3,
            metalness: 0.2,
            clearcoat: 0.3,
            transparent: false
        });

        sledMesh = new THREE.Mesh(sledGeom, sledMat);
        sledMesh.castShadow = true;
        sledMesh.receiveShadow = true;

        const slideZ = explode * 1.2;
        sledMesh.position.set(0, 0, slideZ);

        const sledEdges = new THREE.EdgesGeometry(sledGeom, 24);
        sledMesh.add(new THREE.LineSegments(
            sledEdges,
            new THREE.LineBasicMaterial({ color: 0x664400, linewidth: 1.5, transparent: true, opacity: 0.9 })
        ));
        mainAssemblyGroup.add(sledMesh);

        // Reference ESP32-C3 + USB-C Cable Model
        espGroup = new THREE.Group();
        const espManifold = buildESP32Reference(M);
        const espGeom = manifoldToThreeGeometry(espManifold);
        espGeom.rotateX(-Math.PI / 2);
        const espMat = new THREE.MeshStandardMaterial({ color: 0x242e38, roughness: 0.4, metalness: 0.6 });
        const espMesh = new THREE.Mesh(espGeom, espMat);

        const mcuStartY = -43.0 + 6.0;
        const mcuCenterY = mcuStartY + 11.26;
        const mcuSeatZ = 1.6 + p.printClearance + 1.6;
        espMesh.position.set(0, mcuSeatZ, -mcuCenterY);
        espGroup.add(espMesh);

        const cableGeom = new THREE.CylinderGeometry(1.8, 1.8, 28, 16);
        cableGeom.rotateX(Math.PI / 2);
        const cableMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.8 });
        const cableMesh = new THREE.Mesh(cableGeom, cableMat);
        cableMesh.position.set(0, mcuSeatZ + 1.6, 43.0 + 10);
        espGroup.add(cableMesh);

        espGroup.position.set(0, 0, slideZ);
        mainAssemblyGroup.add(espGroup);
    }

    // --- 4. RENDER HAND MODEL ---
    if (context.handGeometry && p.showHand && p.displayMode !== 'sled' && p.displayMode !== 'base') {
        const handMat = new THREE.MeshPhysicalMaterial({
            color: 0x90e0ef,
            emissive: 0x03045e,
            roughness: 0.25,
            metalness: 0.15,
            clearcoat: 0.5,
            transmission: 0.35,
            transparent: true,
            opacity: 0.92
        });

        handMesh = new THREE.Mesh(context.handGeometry, handMat);
        handMesh.castShadow = true;
        handMesh.receiveShadow = true;

        // Seated on Top Lid socket with twist action
        const handLift = p.height - p.socketDepth + 0.3 + explode * 1.6;
        const handTwist = (1.0 - Math.min(explode / 25.0, 1.0)) * (Math.PI / 4);
        handMesh.position.set(0, handLift, 0);
        handMesh.rotation.y = handTwist;

        const handEdges = new THREE.EdgesGeometry(context.handGeometry, 30);
        handMesh.add(new THREE.LineSegments(
            handEdges,
            new THREE.LineBasicMaterial({ color: 0x0077b6, linewidth: 1.2, transparent: true, opacity: 0.6 })
        ));
        mainAssemblyGroup.add(handMesh);
    }
}
