import * as THREE from 'three';

/**
 * SharedAssets: Central geometry and material cache.
 * Eliminates duplicate GPU buffer allocations across chunks, pickups, and buildables,
 * and prevents shared geometries from being prematurely disposed.
 */
const boxGeoCache = new Map();

export function getSharedBoxGeometry(w, h, d) {
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let geo = boxGeoCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d);
    geo.userData.isShared = true;
    boxGeoCache.set(key, geo);
  }
  return geo;
}

export const PICKUP_GEOMETRY = new THREE.BoxGeometry(0.18, 0.18, 0.18);
PICKUP_GEOMETRY.userData.isShared = true;

const PICKUP_COLORS = {
  drywall: 0xffe682,
  wood: 0x8b5a2b,
  copper: 0xff7b25,
  ballast: 0x00f0ff,
  fiber: 0x76b852,
  ceramic: 0xdcf2f8,
  scrap: 0x777b82,
  pvc: 0xc8d6e5,
  rebar: 0x4a4d52,
  plastic: 0xff8833,
  caster: 0x555555,
  piston: 0xdddddd,
  fitting: 0xb87333
};

const pickupMatCache = new Map();

export function getPickupMaterial(type) {
  let mat = pickupMatCache.get(type);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: PICKUP_COLORS[type] ?? 0xffe682
    });
    pickupMatCache.set(type, mat);
  }
  return mat;
}

export const SHARED_BUILDABLE_ASSETS = {
  barricadeGeo: getSharedBoxGeometry(2.4, 2.9, 0.35),
  barricadeMat: new THREE.MeshStandardMaterial({
    color: 0xd4c07b,
    roughness: 0.7,
    metalness: 0.1
  }),
  scaffoldingGeo: getSharedBoxGeometry(1.2, 1.5, 1.2),
  scaffoldingMat: new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.8,
    wireframe: true
  }),
  beaconGeo: getSharedBoxGeometry(0.24, 0.24, 0.24),
  beaconMat: new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 1.6,
    roughness: 0.3
  }),
  jumpPadGeo: getSharedBoxGeometry(1.1, 0.14, 1.1),
  jumpPadMat: new THREE.MeshStandardMaterial({
    color: 0xffb000,
    emissive: 0xff6600,
    emissiveIntensity: 0.7,
    roughness: 0.4,
    metalness: 0.6
  })
};
