// Viewport and Three.js 3D rendering module for 19-DeafDoorbellEnclosures
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context, params } from './state.js';

let scene, camera, renderer, controls;
let mainGroup, phantomGroup;

export function initViewport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c14);
    context.scene = scene;

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(55, 65, 80);
    context.camera = camera;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    context.renderer = renderer;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    context.controls = controls;

    // Studio Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00f3ff, 1.2);
    dirLight1.position.set(60, 80, 50);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff006e, 0.8);
    dirLight2.position.set(-50, -40, -40);
    scene.add(dirLight2);

    const topRimLight = new THREE.DirectionalLight(0xffffff, 0.9);
    topRimLight.position.set(0, 100, 0);
    scene.add(topRimLight);

    // Architectural Ground Grid
    const gridHelper = new THREE.GridHelper(180, 36, 0x00f3ff, 0x1a2638);
    gridHelper.position.y = -15;
    scene.add(gridHelper);

    mainGroup = new THREE.Group();
    scene.add(mainGroup);

    phantomGroup = new THREE.Group();
    scene.add(phantomGroup);

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

export function updateSceneMesh(geometryList) {
    if (!mainGroup) return;

    // Clear previous geometry
    while (mainGroup.children.length > 0) {
        const obj = mainGroup.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
        mainGroup.remove(obj);
    }

    geometryList.forEach(item => {
        if (!item || !item.geometry) return;
        const mesh = new THREE.Mesh(item.geometry, item.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.copy(item.position || new THREE.Vector3(0, 0, 0));
        mesh.rotation.copy(item.rotation || new THREE.Euler(0, 0, 0));
        mainGroup.add(mesh);
    });
}
