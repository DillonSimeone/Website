// script2.js — Kinetic Choreography & Graphic Parallax UI
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { generateMazeGeometry, mazeSDF } from './maze-gen.js';
import { poses } from './poses.js';

// ── Config ──
const VOXEL_COUNT = 48;
const SPRING_K = 4.5, DAMPING = 5.5; // Tighter, snappier physics
const CELL_SIZE = 2.0, MAZE_RADIUS = 14;
const CAM_MOVE_SPEED = 7.5; // High speed

// ── Globals ──
let renderer, scene, camera, composer, chromaticPass;
let clock, camLight, frustum = new THREE.Frustum(), projScreenMatrix = new THREE.Matrix4();
let voxelMeshes = [], voxelVelocities = [], voxelTargets = [];
let lightOrbs = [];
let mouseX = 0, mouseY = 0, idleTime = 0;

let railPath = [], railIndex = 0, railT = 0;
let camPos = new THREE.Vector3(1, 1, 1), camTarget = new THREE.Vector3(1, 1, 5), camTargetLookAt = new THREE.Vector3(1, 1, 5);
let camVelocity = new THREE.Vector3(), prevCamPos = new THREE.Vector3();

const POSE_NODES = [new THREE.Vector3(1, 1, 11), new THREE.Vector3(7, 1, 1), new THREE.Vector3(1, 11, 11)];
let mazeNodes = [], adjacency = new Map();

function initNavigation() {
    mazeNodes = []; adjacency.clear();
    const half = MAZE_RADIUS;
    for (let x = -half + 1; x <= half - 1; x += CELL_SIZE) {
        for (let y = -half + 1; y <= half - 1; y += CELL_SIZE) {
            for (let z = -half + 1; z <= half - 1; z += CELL_SIZE) {
                // In the new lattice, nodes are almost always safe
                if (mazeSDF(x, y, z, POSE_NODES) < -0.1) mazeNodes.push(new THREE.Vector3(x, y, z));
            }
        }
    }
    for (let i = 0; i < mazeNodes.length; i++) {
        const neighbors = [];
        for (let j = 0; j < mazeNodes.length; j++) {
            if (i === j) continue;
            if (mazeNodes[i].distanceTo(mazeNodes[j]) < CELL_SIZE * 1.1) neighbors.push(j);
        }
        adjacency.set(i, neighbors);
    }
}

function findPath(startIndex, endIndex) {
    if (startIndex === endIndex) return [startIndex];
    const queue = [[startIndex]], visited = new Set([startIndex]);
    while (queue.length > 0) {
        const path = queue.shift(), node = path[path.length - 1];
        if (node === endIndex) return path;
        for (const n of adjacency.get(node) || []) {
            if (!visited.has(n)) { visited.add(n); queue.push([...path, n]); }
        }
    }
    return [startIndex];
}

const ChromaticAberrationShader = {
    uniforms: { tDiffuse: { value: null }, uIntensity: { value: 0.0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uIntensity; varying vec2 vUv;
        void main(){
            vec2 d=vUv-0.5; float o=length(d)*uIntensity;
            vec2 off=d*o;
            gl_FragColor=vec4(texture2D(tDiffuse,vUv+off).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-off).b, 1.0);
        }`,
};

function init() {
    initNavigation();
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-mount').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a18, 0.025);
    scene.background = new THREE.Color(0x050510);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
    const startNode = mazeNodes[0] || new THREE.Vector3(1, 1, 1);
    camPos.copy(startNode); camera.position.copy(camPos);

    scene.add(new THREE.AmbientLight(0x334466, 0.6));
    camLight = new THREE.PointLight(0xffffff, 15.0, 45);
    scene.add(camLight);

    // ── Lattice Mesh ──
    const mazeGeo = generateMazeGeometry(0, 0, 0, MAZE_RADIUS + 2, 0.4, POSE_NODES);
    const mazeMesh = new THREE.Mesh(mazeGeo, new THREE.MeshStandardMaterial({
        color: 0x00ffff, emissive: 0x002244, roughness: 0.4, metalness: 0.8, side: THREE.FrontSide
    }));
    scene.add(mazeMesh);

    // ── Dynamic Light Orbs ──
    const orbColors = [0xff2244, 0x4422ff, 0x00ffff, 0xffaa00, 0xff00ff, 0x00ff88];
    for (let i = 0; i < 20; i++) {
        const node = mazeNodes[Math.floor(Math.random() * mazeNodes.length)];
        const color = orbColors[i % orbColors.length];
        const light = new THREE.PointLight(color, 0, 25);
        light.position.copy(node);
        scene.add(light);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0 }));
        mesh.position.copy(node); scene.add(mesh);
        lightOrbs.push({ light: light, mesh: mesh, baseIntensity: 30 + Math.random() * 20, currentIntensity: 0 });
    }

    // ── Voxels ──
    const geos = [new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.TetrahedronGeometry(0.14), new THREE.IcosahedronGeometry(0.12)];
    for (let i = 0; i < VOXEL_COUNT; i++) {
        const mesh = new THREE.Mesh(geos[0], new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.3, metalness: 0.7, flatShading: true }));
        mesh.position.copy(camPos); mesh.userData.geos = geos;
        mesh.castShadow = true; scene.add(mesh);
        voxelMeshes.push(mesh); voxelVelocities.push(new THREE.Vector3()); voxelTargets.push(new THREE.Vector3().copy(camPos));
    }

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.85));
    chromaticPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaticPass);

    window.addEventListener('mousemove', e => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        updateParallaxUI();
    });
    document.querySelectorAll('[data-pose]').forEach(btn => btn.addEventListener('click', () => setPose(parseInt(btn.dataset.pose))));

    setPose(0);
    animate();
}

function updateParallaxUI() {
    const root = document.documentElement;
    root.style.setProperty('--mouseX', mouseX);
    root.style.setProperty('--mouseY', mouseY);
}

function getNearestNodeIndex(pos) {
    let minDist = Infinity, index = 0;
    for (let i = 0; i < mazeNodes.length; i++) {
        const d = pos.distanceToSquared(mazeNodes[i]);
        if (d < minDist) { minDist = d; index = i; }
    }
    return index;
}

function setPose(index) {
    const pose = poses[index];
    const targetPos = POSE_NODES[index];
    const startIndex = getNearestNodeIndex(camera.position);
    const endIndex = getNearestNodeIndex(targetPos);
    railPath = findPath(startIndex, endIndex).map(idx => mazeNodes[idx].clone());
    railIndex = 0; railT = 0;

    document.getElementById('pose-label').textContent = pose.label;
    document.querySelectorAll('[data-pose]').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.pose) === index));
    camTargetLookAt.copy(targetPos);

    const center = POSE_NODES[index].clone();
    const geoIdx = index % 3;
    const palette = pose.colorPalette;
    for (let i = 0; i < VOXEL_COUNT; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / VOXEL_COUNT), theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = pose.formation === 'pillar' ? 0.4 : 2.2;
        voxelTargets[i].set(
            center.x + Math.sin(phi) * Math.cos(theta) * r,
            center.y + (pose.formation === 'pillar' ? (i / VOXEL_COUNT) * 6 : Math.sin(phi) * Math.sin(theta) * r),
            center.z + Math.cos(phi) * r
        );
        voxelMeshes[i].geometry = voxelMeshes[i].userData.geos[geoIdx];
        voxelMeshes[i].material.color.set(palette[i % palette.length]);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    idleTime += dt;
    prevCamPos.copy(camera.position);

    // ── Rail Navigation with Snap-Overshoot ──
    if (railPath.length > 0 && railIndex < railPath.length - 1) {
        const s = railPath[railIndex], e = railPath[railIndex + 1], l = s.distanceTo(e);
        railT += (dt * CAM_MOVE_SPEED) / Math.max(l, 0.1);
        if (railT >= 1.0) { camPos.copy(e); railIndex++; railT = 0; }
        else { 
            // Add a slight cubic ease for snappiness
            const t = railT < 0.5 ? 4 * railT * railT * railT : 1 - Math.pow(-2 * railT + 2, 3) / 2;
            camPos.lerpVectors(s, e, t); 
        }
        camTargetLookAt.copy(railPath[Math.min(railIndex + 2, railPath.length - 1)]);
    }

    // ── Camera Dutch Angles & Motion ──
    camVelocity.subVectors(camera.position, prevCamPos).divideScalar(dt);
    const roll = -camVelocity.x * 0.015; // Roll into turns
    
    camera.position.set(camPos.x + Math.sin(idleTime*0.4)*0.03 + mouseX*0.06, camPos.y + Math.cos(idleTime*0.3)*0.025 + mouseY*0.05, camPos.z);
    camTarget.lerp(camTargetLookAt, dt * 5.0);
    camera.lookAt(camTarget);
    camera.rotation.z += (roll - camera.rotation.z) * 0.1; // Smooth roll
    
    camLight.position.copy(camera.position);

    // Dynamic Orbs
    camera.updateMatrixWorld();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    for (const orb of lightOrbs) {
        const isVisible = frustum.containsPoint(orb.light.position) && camera.position.distanceTo(orb.light.position) < 30;
        if (isVisible) orb.currentIntensity = Math.min(orb.currentIntensity + dt, 1.0);
        else orb.currentIntensity = Math.max(orb.currentIntensity - dt, 0.0);
        orb.light.intensity = orb.currentIntensity * orb.baseIntensity;
        orb.mesh.material.opacity = orb.currentIntensity;
    }

    const velocity = camVelocity.length();
    chromaticPass.uniforms.uIntensity.value += (Math.min(velocity * 0.005, 0.2) - chromaticPass.uniforms.uIntensity.value) * 0.1;

    // Voxel Physics
    for (let i = 0; i < VOXEL_COUNT; i++) {
        const mesh = voxelMeshes[i], vel = voxelVelocities[i], target = voxelTargets[i];
        const force = new THREE.Vector3().subVectors(target, mesh.position).multiplyScalar(SPRING_K);
        force.addScaledVector(vel, -DAMPING);
        vel.addScaledVector(force, dt);
        mesh.position.addScaledVector(vel, dt);
        mesh.rotation.x += dt * 0.5; mesh.rotation.y += dt * 0.3;
    }

    composer.render();
}
init();
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    composer.setSize(window.innerWidth, window.innerHeight);
});
