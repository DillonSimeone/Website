// Viewport module for Parametric Potentiometer Box Configurator
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context, colors } from './state.js';

let frameCallback = null;

export function initViewport(onFrame) {
    frameCallback = onFrame;
    const container = document.getElementById('canvas3d');
    if (!container) return;

    context.scene = new THREE.Scene();
    context.scene.fog = new THREE.FogExp2(0x0a0c14, 0.0012);

    context.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    context.camera.position.set(160, 140, 200);

    context.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    context.renderer.setPixelRatio(window.devicePixelRatio);
    context.renderer.setSize(container.clientWidth, container.clientHeight);
    context.renderer.shadowMap.enabled = true;
    context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(context.renderer.domElement);

    context.controls = new OrbitControls(context.camera, context.renderer.domElement);
    context.controls.target.set(0, 0, 0);
    context.controls.enableDamping = true;
    context.controls.dampingFactor = 0.05;
    context.controls.maxPolarAngle = Math.PI / 2 + 0.15;
    context.controls.update();

    // Cyberpunk Blueprint Grid Helper
    const grid = new THREE.GridHelper(300, 30, 0x00f3ff, 0x1a233a);
    grid.position.y = -20;
    context.scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x0f111a, 2.0);
    context.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(100, 200, 120);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    context.scene.add(keyLight);

    const pinkFillLight = new THREE.PointLight(colors.neonPink, 2.5, 200);
    pinkFillLight.position.set(-100, 60, 50);
    context.scene.add(pinkFillLight);

    const cyanGlowLight = new THREE.PointLight(colors.neonCyan, 2.5, 150);
    cyanGlowLight.position.set(100, -20, -50);
    context.scene.add(cyanGlowLight);

    context.mainGroup = new THREE.Group();
    // Rotate CAD coordinates to match Three.js (Z is up in CAD, Y is up in ThreeJS)
    context.mainGroup.rotation.x = -Math.PI / 2;
    context.scene.add(context.mainGroup);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    if (!container) return;
    context.camera.aspect = container.clientWidth / container.clientHeight;
    context.camera.updateProjectionMatrix();
    context.renderer.setSize(container.clientWidth, container.clientHeight);
}

export function animate() {
    requestAnimationFrame(animate);
    context.controls.update();

    // Slowly rotate view when user is idle
    if (context.controls.state === -1) {
        context.mainGroup.rotation.z += 0.0015;
    }

    context.renderer.render(context.scene, context.camera);
    if (frameCallback) frameCallback();
}
