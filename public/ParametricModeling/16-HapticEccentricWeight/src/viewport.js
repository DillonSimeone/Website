// Three.js viewport — neon glassmorphic lab aesthetic
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { context } from './state.js';

let frameCallback = null;

export function initViewport(onFrame) {
  frameCallback = onFrame;
  const container = document.getElementById('canvas3d');
  if (!container) return;

  context.scene = new THREE.Scene();
  context.scene.background = new THREE.Color(0x0a0a12);
  context.scene.fog = new THREE.FogExp2(0x0a0a12, 0.008);

  context.camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / container.clientHeight,
    0.5,
    500
  );
  context.camera.position.set(45, 35, 55);

  context.renderer = new THREE.WebGLRenderer({ antialias: true });
  context.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  context.renderer.setSize(container.clientWidth, container.clientHeight);
  context.renderer.shadowMap.enabled = true;
  context.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  context.renderer.toneMappingExposure = 1.15;
  container.appendChild(context.renderer.domElement);

  context.controls = new OrbitControls(context.camera, context.renderer.domElement);
  context.controls.target.set(0, 8, 0);
  context.controls.enableDamping = true;
  context.controls.dampingFactor = 0.08;
  context.controls.update();

  const grid = new THREE.GridHelper(80, 40, 0x00f2ff, 0x1a1a2e);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  context.scene.add(grid);

  context.scene.add(new THREE.AmbientLight(0x6688aa, 0.45));

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(40, 80, 50);
  key.castShadow = true;
  context.scene.add(key);

  const cyan = new THREE.PointLight(0x00f2ff, 1.4, 120);
  cyan.position.set(-30, 25, 20);
  context.scene.add(cyan);

  const lime = new THREE.PointLight(0xc8ff00, 1.0, 100);
  lime.position.set(25, 20, -30);
  context.scene.add(lime);

  context.mainGroup = new THREE.Group();
  // CAD Z-up → Three.js Y-up
  context.mainGroup.rotation.x = -Math.PI / 2;
  context.scene.add(context.mainGroup);

  window.addEventListener('resize', () => {
    if (!container) return;
    context.camera.aspect = container.clientWidth / container.clientHeight;
    context.camera.updateProjectionMatrix();
    context.renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

export function animate() {
  requestAnimationFrame(animate);
  context.controls?.update();
  context.renderer?.render(context.scene, context.camera);
  if (frameCallback) frameCallback();
}

export { THREE };
