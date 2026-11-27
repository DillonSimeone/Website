// Viewport and Three.js 3D rendering module for 19-DeafDoorbellEnclosures (with CAD Edge Shading)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let scene, camera, renderer, controls;
let mainGroup;

export function initViewport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e111a); // Studio dark background
    context.scene = scene;

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(70, 75, 105);
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

    // Studio 3-Point Lighting with balanced contrast
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    // Key Light (warm technical cyan)
    const keyLight = new THREE.DirectionalLight(0xd0f0ff, 1.2);
    keyLight.position.set(80, 100, 70);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Fill Light (soft cool violet)
    const fillLight = new THREE.DirectionalLight(0x99aacc, 0.8);
    fillLight.position.set(-80, 40, -50);
    scene.add(fillLight);

    // Rim Light (sharp contrast from top-rear)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
    rimLight.position.set(0, 80, -90);
    scene.add(rimLight);

    mainGroup = new THREE.Group();
    scene.add(mainGroup);

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

        // Solid Body Mesh
        const mesh = new THREE.Mesh(item.geometry, item.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.copy(item.position || new THREE.Vector3(0, 0, 0));
        mesh.rotation.copy(item.rotation || new THREE.Euler(0, 0, 0));

        // CAD Edge Shading (Clean sharp feature outlines at 24° threshold)
        const edgesGeom = new THREE.EdgesGeometry(item.geometry, 24);
        const edgeColor = item.edgeColor || 0x05101a;
        const edgeMat = new THREE.LineBasicMaterial({
            color: edgeColor,
            linewidth: 1.5,
            transparent: true,
            opacity: 0.9
        });
        const edgeLines = new THREE.LineSegments(edgesGeom, edgeMat);
        mesh.add(edgeLines);

        mainGroup.add(mesh);
    });
}
