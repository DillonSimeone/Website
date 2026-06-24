// Viewport module for Sheet-to-Tube Cylinder Cap Configurator
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let frameCallback = null;

export function initViewport(onFrame) {
    frameCallback = onFrame;
    const container = document.getElementById('canvas3d');
    if (!container) return;

    context.scene = new THREE.Scene();
    context.scene.fog = new THREE.FogExp2(0x02090b, 0.0015);

    context.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    context.camera.position.set(180, 150, 220);

    context.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    context.renderer.setPixelRatio(window.devicePixelRatio);
    context.renderer.setSize(container.clientWidth, container.clientHeight);
    context.renderer.shadowMap.enabled = true;
    context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(context.renderer.domElement);

    context.controls = new OrbitControls(context.camera, context.renderer.domElement);
    context.controls.target.set(0, 50, 0);
    context.controls.enableDamping = true;
    context.controls.dampingFactor = 0.05;
    context.controls.maxPolarAngle = Math.PI / 2 + 0.15;
    context.controls.update();

    // Technical Blueprint Grid Helper
    const grid = new THREE.GridHelper(400, 40, 0x00f3ff, 0x002c33);
    grid.position.y = 0;
    context.scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x00222a, 2.0);
    context.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 250, 150);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    context.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x00f3ff, 2.0, 300);
    fillLight.position.set(-100, 100, 50);
    context.scene.add(fillLight);

    const glowLight = new THREE.PointLight(0xc8ff00, 2.0, 150);
    glowLight.position.set(0, 0, 0);
    context.scene.add(glowLight);

    context.mainGroup = new THREE.Group();
    // Rotate the CAD coordinates to match Three.js (Z is up in CAD, Y is up in ThreeJS)
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

    // Auto rotate very slowly if user is idle
    if (context.controls.state === -1) {
        context.mainGroup.rotation.z += 0.001;
    }

    context.renderer.render(context.scene, context.camera);
    if (frameCallback) frameCallback();
}
