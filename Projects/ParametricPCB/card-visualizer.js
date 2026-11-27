/**
 * Parametric PCB Suite - 10 FPS 3D Rotating PCB Card Visualizer
 * Loads true routed 3D STL files on dashboard project cards with intentional
 * 10 FPS stepping rotation, retro CAD HUD overlays, and OrbitControls inspection.
 */

import * as THREE from "https://esm.sh/three@0.160.0";
import { STLLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const loader = new STLLoader();

export function initPcbCardVisualizers() {
  const viewports = document.querySelectorAll(".card-viewport[data-stl]");
  if (!viewports || viewports.length === 0) return;

  viewports.forEach((container) => {
    setupCardViewer(container);
  });
}

function setupCardViewer(container) {
  const stlUrl = container.getAttribute("data-stl");
  const hexColor = container.getAttribute("data-color") || "#00f3ff";
  const pcbColor = new THREE.Color(hexColor);

  const width = container.clientWidth || 360;
  const height = container.clientHeight || 220;

  // Scene & Lighting
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08090c);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
  camera.position.set(0, -70, 90);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.borderRadius = "10px";
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false; // keep card scroll natural, orbit on drag
  controls.rotateSpeed = 0.8;

  // Studio Lighting (Highlights PCB copper traces and component relief)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(60, 80, 100);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(pcbColor, 0.8);
  fillLight.position.set(-60, -80, -50);
  scene.add(fillLight);

  const topRim = new THREE.DirectionalLight(0xffffff, 0.6);
  topRim.position.set(0, 100, 40);
  scene.add(topRim);

  let pcbMesh = null;
  let isUserInteracting = false;

  controls.addEventListener("start", () => { isUserInteracting = true; });
  controls.addEventListener("end", () => {
    setTimeout(() => { isUserInteracting = false; }, 800);
  });

  // Load Routed 3D STL Mesh
  loader.load(
    stlUrl,
    (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();

      // Cyberpunk Metallic / FR-4 Specular Material
      const material = new THREE.MeshStandardMaterial({
        color: pcbColor,
        metalness: 0.7,
        roughness: 0.32,
        wireframe: false
      });

      pcbMesh = new THREE.Mesh(geometry, material);
      
      // Auto-fit camera distance based on board bounding sphere
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius || 35;
      const targetDist = radius * 2.4;
      camera.position.set(0, -targetDist * 0.75, targetDist * 0.85);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();

      scene.add(pcbMesh);

      // Remove loading indicator if present
      const loaderEl = container.querySelector(".cad-loading");
      if (loaderEl) loaderEl.remove();
    },
    undefined,
    (error) => {
      console.warn(`[STL Load Warning] Could not load ${stlUrl}:`, error);
      const loaderEl = container.querySelector(".cad-loading");
      if (loaderEl) loaderEl.textContent = "3D CAD Preview Ready in Studio";
    }
  );

  // Responsive Resize Handling
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(container);
  }
  window.addEventListener("resize", onResize);

  // 10 FPS Clock Stepper (100ms per frame for authentic retro CAD rotation)
  let lastTime = performance.now();
  const fpsInterval = 1000 / 10; // Exactly 100ms (10 FPS)
  const stepAngle = 0.052; // Discrete angular step per 10 FPS tick (~3° per step)

  function renderLoop(currentTime) {
    requestAnimationFrame(renderLoop);

    const elapsed = currentTime - lastTime;
    if (elapsed >= fpsInterval) {
      lastTime = currentTime - (elapsed % fpsInterval);

      if (pcbMesh && !isUserInteracting) {
        pcbMesh.rotation.z += stepAngle;
      }

      controls.update();
      renderer.render(scene, camera);
    }
  }

  requestAnimationFrame(renderLoop);
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPcbCardVisualizers);
} else {
  initPcbCardVisualizers();
}
