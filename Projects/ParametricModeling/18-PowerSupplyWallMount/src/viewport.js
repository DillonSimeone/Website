// Viewport module for 18-PowerSupplyWallMount
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let frameCallback = null;

export function initViewport(onFrame) {
    frameCallback = onFrame;
    const container = document.getElementById('canvas3d');
    if (!container) return;

    context.scene = new THREE.Scene();
    context.scene.fog = new THREE.FogExp2(0x02090b, 0.0012);

    context.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    context.camera.position.set(200, 160, 240);

    context.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    context.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    context.renderer.setSize(container.clientWidth, container.clientHeight);
    context.renderer.shadowMap.enabled = true;
    context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(context.renderer.domElement);

    context.controls = new OrbitControls(context.camera, context.renderer.domElement);
    context.controls.target.set(0, 40, 60);
    context.controls.enableDamping = true;
    context.controls.dampingFactor = 0.05;
    context.controls.maxPolarAngle = Math.PI / 2 + 0.15;
    context.controls.update();

    // Technical Blueprint Grid Helper
    const grid = new THREE.GridHelper(400, 40, 0x00f3ff, 0x002c33);
    grid.position.y = -40;
    context.scene.add(grid);

    // Wall representation plane (behind the backplate)
    const wallGeom = new THREE.PlaneGeometry(380, 320);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x071118,
        roughness: 0.9,
        metalness: 0.1,
        transparent: true,
        opacity: 0.4
    });
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.position.set(0, 70, -0.5);
    context.scene.add(wallMesh);

    // Lighting setup
    const ambient = new THREE.AmbientLight(0x0a1a24, 2.2);
    context.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(150, 300, 200);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    context.scene.add(keyLight);

    const cyanRim = new THREE.PointLight(0x00f3ff, 2.5, 400);
    cyanRim.position.set(-150, 150, 100);
    context.scene.add(cyanRim);

    const orangeFill = new THREE.PointLight(0xffaa00, 1.8, 350);
    orangeFill.position.set(120, -50, 150);
    context.scene.add(orangeFill);

    context.mainGroup = new THREE.Group();
    // Rotate CAD coordinates (Z-up, Y-depth, X-width) into Three.js coordinates (Y-up, Z-forward, X-width)
    // In our CSG: X is width, Y is depth from wall (positive), Z is height along wall (positive).
    // In Three.js: X is width, Y is height, Z is depth from wall (positive).
    // So rotation: X -> X, Y -> Z, Z -> Y.
    // mainGroup rotation -90deg about X maps: Y_csg -> Z_three, Z_csg -> Y_three.
    context.mainGroup.rotation.x = -Math.PI / 2;
    context.scene.add(context.mainGroup);

    context.overlaySvg = document.getElementById('dimensions-overlay');

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    if (!container || !context.camera || !context.renderer) return;
    context.camera.aspect = container.clientWidth / container.clientHeight;
    context.camera.updateProjectionMatrix();
    context.renderer.setSize(container.clientWidth, container.clientHeight);
}

export function animate() {
    requestAnimationFrame(animate);
    if (context.controls) {
        context.controls.update();
        if (context.controls.state === -1 && context.mainGroup) {
            context.mainGroup.rotation.z += 0.0008; // subtle idle rotation
        }
    }
    if (context.renderer && context.scene && context.camera) {
        context.renderer.render(context.scene, context.camera);
    }
    if (frameCallback) frameCallback();
}
