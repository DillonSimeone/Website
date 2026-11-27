// Viewport and Three.js 3D rendering module for 21-HypercubeFrame
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let scene, camera, renderer, controls;
let mainGroup, gridHelper;

export function initViewport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c14);
    context.scene = scene;

    // Z-up CAD coordinate convention so Z=0 is the Bambu A1 PEI build plate
    THREE.Object3D.DefaultUp.set(0, 0, 1);

    camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 1500);
    camera.up.set(0, 0, 1);
    camera.position.set(145, -155, 125);
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
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 35);
    context.controls = controls;

    // Build plate grid (256x256mm Bambu A1 bed scale reference in XY plane at Z=0)
    gridHelper = new THREE.GridHelper(256, 16, 0x00f3ff, 0x1a2639);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(0, 0, 0);
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xd8f3ff, 1.25);
    keyLight.position.set(120, -140, 180);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaabbee, 0.85);
    fillLight.position.set(-130, 110, 90);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff88cc, 0.65);
    rimLight.position.set(0, 150, -100);
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

        const mesh = new THREE.Mesh(item.geometry, item.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (item.position) mesh.position.copy(item.position);
        if (item.rotation) mesh.rotation.copy(item.rotation);
        if (item.quaternion) mesh.quaternion.copy(item.quaternion);

        const edgesGeom = new THREE.EdgesGeometry(item.geometry, 24);
        const edgeColor = item.edgeColor || 0x05101a;
        const edgeMat = new THREE.LineBasicMaterial({
            color: edgeColor,
            linewidth: 1.5,
            transparent: true,
            opacity: item.edgeOpacity !== undefined ? item.edgeOpacity : 0.88
        });
        const edgeLines = new THREE.LineSegments(edgesGeom, edgeMat);
        mesh.add(edgeLines);

        mainGroup.add(mesh);
    });
}
