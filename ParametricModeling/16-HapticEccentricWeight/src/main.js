// Orchestrator — rebuild loop, mesh lifecycle, boot
import * as THREE from 'three';
import {
  context, params, visibilities, meshes, colors, library, MOTOR
} from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import {
  setupUIListeners,
  setRebuildCallback,
  setExportModels,
  updateSpecsPanel,
  renderGallery,
  updateSafetyBanner
} from './ui.js';
import {
  generateHub,
  generateFitCoupon,
  generateMotorGhost,
  generateGuard,
  generateEnvelopeGhost,
  generateEccentricRotor,
  manifoldToThree
} from './geometry.js';
import { getSelectedRotor, runMutation } from './mutation.js';

const active = {
  hub: null,
  fitCoupon: null,
  motor: null,
  rotor: null,
  guard: null,
  envelope: null
};

function toMesh(model, color, opacity = 1, xray = false) {
  const geometry = manifoldToThree(model);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: xray ? 0.05 : 0.35,
    roughness: xray ? 0.85 : 0.25,
    transparent: opacity < 0.99 || xray,
    opacity: xray ? Math.min(opacity, 0.25) : opacity,
    transmission: xray ? 0 : 0.15,
    thickness: 1.2,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(color),
    emissiveIntensity: xray ? 0.05 : 0.12
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function clearMesh(key) {
  if (!meshes[key]) return;
  context.mainGroup.remove(meshes[key]);
  meshes[key].geometry?.dispose?.();
  if (meshes[key].material) {
    if (Array.isArray(meshes[key].material)) meshes[key].material.forEach(m => m.dispose());
    else meshes[key].material.dispose();
  }
  meshes[key] = null;
}

function clearModel(key) {
  if (active[key]) {
    try { active[key].delete(); } catch (_) {}
    active[key] = null;
  }
}

export function rebuild() {
  if (!context.Manifold) return;
  const t0 = performance.now();
  const xray = params.mode === 'xray';
  const opacity = params.opacity / 100;
  const exp = params.explode / 100;
  const slide = params.slideAmount / 100;

  ['motor', 'hub', 'rotor', 'fitCoupon', 'guard', 'envelope'].forEach(clearMesh);
  ['motor', 'hub', 'rotor', 'fitCoupon', 'guard', 'envelope'].forEach(clearModel);

  try {
    // Assembly +Z up: motor (-Z) → shaft into hub bore → hex slot (+Z) → skirt weight
    const shaftInsert = params.shaftInsertMax;
    const hubH = params.hubHeight;

    active.hub = generateHub();
    if (visibilities.hub) {
      meshes.hub = toMesh(active.hub, colors.hub, opacity, xray);
      meshes.hub.position.set(0, 0, exp * 10);
      context.mainGroup.add(meshes.hub);
    }

    // Bore opens on -Z. Shaft tip seats at -hubH/2 + shaftInsert
    const motorZ =
      -hubH / 2 + shaftInsert - MOTOR.frameL / 2 - MOTOR.shaftLen;
    active.motor = generateMotorGhost();
    if (visibilities.motor) {
      meshes.motor = toMesh(active.motor, colors.motor, opacity * 0.7, xray);
      meshes.motor.position.set(0, 0, motorZ - exp * 18);
      context.mainGroup.add(meshes.motor);
    }

    // Weight skirt seats co-axial with hub; slideAmount lifts it off
    const selected = getSelectedRotor();
    let rotorModel = null;
    if (selected) {
      const gen = generateEccentricRotor({
        shape: selected.shape,
        od: selected.od,
        thickness: selected.thickness,
        ecc: selected.ecc
      });
      rotorModel = gen.model;
      Object.assign(selected, gen.meta);
      active.rotor = rotorModel;
    }

    if (rotorModel && visibilities.rotor) {
      const lift = slide * (hubH + 6) + exp * 20;
      meshes.rotor = toMesh(rotorModel, colors.rotor, opacity, xray);
      meshes.rotor.position.set(0, 0, lift);
      context.mainGroup.add(meshes.rotor);
    }

    active.fitCoupon = generateFitCoupon();
    if (visibilities.fitCoupon) {
      meshes.fitCoupon = toMesh(active.fitCoupon, colors.fitCoupon, opacity, xray);
      meshes.fitCoupon.position.set(16 + exp * 8, 0, 0);
      context.mainGroup.add(meshes.fitCoupon);
    }

    if (visibilities.guard) {
      active.guard = generateGuard();
      meshes.guard = toMesh(active.guard, colors.guard, 0.35, true);
      meshes.guard.position.set(0, 0, motorZ);
      context.mainGroup.add(meshes.guard);
    }

    if (visibilities.envelope) {
      active.envelope = generateEnvelopeGhost();
      meshes.envelope = toMesh(active.envelope, colors.envelope, 0.12, true);
      meshes.envelope.position.set(0, -28, 5);
      context.mainGroup.add(meshes.envelope);
    }

    setExportModels({ ...active, library: library.rotors });
    updateSpecsPanel();
    updateSafetyBanner();
    renderGallery();

    const dt = (performance.now() - t0).toFixed(1);
    const badge = document.getElementById('perf-badge');
    if (badge) badge.textContent = `MANIFOLD WASM · ${dt} ms`;
  } catch (e) {
    console.error('Rebuild error:', e);
    const badge = document.getElementById('perf-badge');
    if (badge) badge.textContent = '⚠ REBUILD ERROR';
  }
}

async function boot() {
  initViewport();
  setRebuildCallback(rebuild);
  setupUIListeners();
  await initManifold(async () => {
    await runMutation();
    rebuild();
  }, animate);
}

boot();
