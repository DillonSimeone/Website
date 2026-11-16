// Three.js viewport module for 25-SpoolLamp
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let scene, camera, renderer, controls, mainGroup;

export function manifoldToThreeGeometry(manifold) {
    if (!manifold) return null;
    const mesh = manifold.getMesh();
    const geom = new THREE.BufferGeometry();
    const numProp = mesh.numProp || 3;
    const numTriangles = mesh.triVerts.length / 3;
    const positions = new Float32Array(numTriangles * 9);

    for (let i = 0; i < numTriangles; i++) {
        for (let v = 0; v < 3; v++) {
            const vertIdx = mesh.triVerts[i * 3 + v];
            const outIdx = (i * 3 + v) * 3;
            positions[outIdx] = mesh.vertProperties[vertIdx * numProp];
            positions[outIdx + 1] = mesh.vertProperties[vertIdx * numProp + 1];
            positions[outIdx + 2] = mesh.vertProperties[vertIdx * numProp + 2];
        }
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
}

export function initViewport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070910);
    context.scene = scene;

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1500);
    camera.position.set(135, 115, 220);
    context.camera = camera;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    context.renderer = renderer;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    context.controls = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const keyLight = new THREE.DirectionalLight(0x00f0ff, 1.1);
    keyLight.position.set(120, 140, 160);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xff2a85, 0.65);
    fillLight.position.set(-140, 60, -90);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.85);
    rimLight.position.set(0, 120, -140);
    scene.add(rimLight);

    mainGroup = new THREE.Group();
    scene.add(mainGroup);

    window.addEventListener('resize', () => {
        if (!container || !renderer || !camera) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    };
    animate();
}

export function updateSceneMesh(items) {
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

    items.forEach(item => {
        if (!item || !item.geometry) return;
        const mesh = new THREE.Mesh(item.geometry, item.material);
        if (item.position) mesh.position.copy(item.position);
        if (item.rotation) mesh.rotation.copy(item.rotation);

        if (!item.noEdges) {
            const edgesGeom = new THREE.EdgesGeometry(item.geometry, 26);
            const edgeMat = new THREE.LineBasicMaterial({
                color: item.edgeColor || 0x05101a,
                transparent: true,
                opacity: 0.75
            });
            mesh.add(new THREE.LineSegments(edgesGeom, edgeMat));
        }

        mainGroup.add(mesh);
    });
}
