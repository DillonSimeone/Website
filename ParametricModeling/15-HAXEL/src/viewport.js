// Viewport module for HAXEL Dense Electronics Enclosure
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let frameCallback = null;

export function initViewport(onFrame) {
    frameCallback = onFrame;
    const container = document.getElementById('canvas3d');
    if (!container) return;

    context.scene = new THREE.Scene();
    context.scene.background = new THREE.Color(0xf3f0ea); // Neobrutalism warm cream
    context.scene.fog = new THREE.FogExp2(0xf3f0ea, 0.003);

    context.camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        1,
        2000
    );
    context.camera.position.set(80, 65, 90);

    context.renderer = new THREE.WebGLRenderer({ antialias: true });
    context.renderer.setPixelRatio(window.devicePixelRatio);
    context.renderer.setSize(container.clientWidth, container.clientHeight);
    context.renderer.shadowMap.enabled = true;
    context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    context.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    context.renderer.toneMappingExposure = 1.1;
    container.appendChild(context.renderer.domElement);

    context.controls = new OrbitControls(context.camera, context.renderer.domElement);
    context.controls.target.set(0, 12, 0);
    context.controls.enableDamping = true;
    context.controls.dampingFactor = 0.08;
    context.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    context.controls.update();

    // Grid — muted black lines on cream
    const grid = new THREE.GridHelper(200, 20, 0x000000, 0xcccccc);
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    grid.position.y = 0;
    context.scene.add(grid);

    // Lighting — warm and bright for neobrutalism
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    context.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(80, 150, 100);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    context.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xfff5e6, 0.5);
    fillLight.position.set(-60, 80, -40);
    context.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff5e97, 1.0, 200);
    rimLight.position.set(0, 40, -80);
    context.scene.add(rimLight);

    context.mainGroup = new THREE.Group();
    // CAD Z-up → Three.js Y-up
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

    // Gentle auto-rotate when idle
    if (context.controls.state === -1) {
        context.mainGroup.rotation.z += 0.0008;
    }

    context.renderer.render(context.scene, context.camera);
    if (frameCallback) frameCallback();
}
