import * as THREE from 'three';

const DEBRIS_COLORS = {
  wall: 0xcbb763,
  drywall: 0xd4c07b,
  floor: 0x6e5e34,
  subfloor: 0x4a3822,
  ceiling: 0xd3d3cd,
  subceiling: 0x3a352c,
  fixture: 0x90e6ff,
  scaffolding: 0x8b5a2b,
  ceramic: 0xe6f4f8,
  concrete: 0x686865
};

/**
 * DebrisSystem: High-performance procedural destruction fragments.
 * Renders up to 450 tumbling, bouncing 3D debris chunks in a SINGLE draw call
 * using THREE.InstancedMesh with per-instance colors.
 */
export class DebrisSystem {
  constructor(scene, maxCount = 450) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.active = [];

    const geo = new THREE.BoxGeometry(0.22, 0.16, 0.20);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.12
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.count = 0;

    // Initialize instanceColor buffer
    const defaultCol = new THREE.Color(0xffffff);
    for (let i = 0; i < maxCount; i++) {
      this.instancedMesh.setColorAt(i, defaultCol);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.scene.add(this.instancedMesh);

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
  }

  spawnShatter(origin, type = 'wall', count = 16, impulseDir = null) {
    const baseHex = DEBRIS_COLORS[type] ?? 0xcbb763;
    const baseColor = this._color.setHex(baseHex);

    for (let i = 0; i < count; i++) {
      if (this.active.length >= this.maxCount) {
        this.active.shift(); // Recycle oldest settled fragment
      }

      const spread = 0.65;
      const vx = (Math.random() - 0.5) * 5.2 + (impulseDir ? impulseDir.x * 2.2 : 0);
      const vy = Math.random() * 3.8 + 0.8;
      const vz = (Math.random() - 0.5) * 5.2 + (impulseDir ? impulseDir.z * 2.2 : 0);

      // Slight per-piece shade variation
      const shade = 0.8 + Math.random() * 0.35;
      const floorY = Math.floor(origin.y / 20.0) * 20.0 + 0.08;

      this.active.push({
        x: origin.x + (Math.random() - 0.5) * spread,
        y: origin.y + (Math.random() - 0.5) * spread,
        z: origin.z + (Math.random() - 0.5) * spread,
        vx,
        vy,
        vz,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        avx: (Math.random() - 0.5) * 14,
        avy: (Math.random() - 0.5) * 14,
        avz: (Math.random() - 0.5) * 14,
        sx: 0.45 + Math.random() * 0.85,
        sy: 0.35 + Math.random() * 0.75,
        sz: 0.45 + Math.random() * 0.85,
        r: Math.min(1, baseColor.r * shade),
        g: Math.min(1, baseColor.g * shade),
        b: Math.min(1, baseColor.b * shade),
        floorY,
        life: 2.8 + Math.random() * 1.4,
        maxLife: 4.2
      });
    }
  }

  update(dt) {
    const len = this.active.length;
    if (len === 0) {
      if (this.instancedMesh.count !== 0) {
        this.instancedMesh.count = 0;
      }
      return;
    }

    const dummy = this._dummy;
    const col = this._color;
    let writeIdx = 0;

    for (let i = len - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        continue;
      }

      // Gravity & ballistic motion
      p.vy -= 18.0 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Floor bounce & friction
      if (p.y < p.floorY) {
        p.y = p.floorY;
        if (Math.abs(p.vy) > 1.2) {
          p.vy = -p.vy * 0.38;
          p.vx *= 0.65;
          p.vz *= 0.65;
          p.avx *= 0.5;
          p.avy *= 0.5;
          p.avz *= 0.5;
        } else {
          p.vy = 0;
          p.vx *= 0.82;
          p.vz *= 0.82;
          p.avx *= 0.75;
          p.avy *= 0.75;
          p.avz *= 0.75;
        }
      }

      p.rx += p.avx * dt;
      p.ry += p.avy * dt;
      p.rz += p.avz * dt;

      // Smooth shrink-out in final 0.6s
      const fadeScale = p.life < 0.6 ? Math.max(0.01, p.life / 0.6) : 1.0;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.sx * fadeScale, p.sy * fadeScale, p.sz * fadeScale);
      dummy.updateMatrix();

      this.instancedMesh.setMatrixAt(writeIdx, dummy.matrix);
      col.setRGB(p.r, p.g, p.b);
      this.instancedMesh.setColorAt(writeIdx, col);
      writeIdx++;
    }

    this.instancedMesh.count = writeIdx;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * DustSystem: Atmospheric drifting dust motes around the player (single Points draw call).
 */
export class DustSystem {
  constructor(scene, count = 160) {
    this.count = count;
    this.rangeX = 14;
    this.rangeY = 5;
    this.rangeZ = 14;

    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.rangeX;
      positions[i * 3 + 1] = Math.random() * this.rangeY;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.rangeZ;

      this.velocities[i * 3] = (Math.random() - 0.5) * 0.18;
      this.velocities[i * 3 + 1] = (Math.random() - 0.3) * 0.10;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe8a8,
      size: 0.035,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });

    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, playerPos) {
    const pos = this.points.geometry.attributes.position.array;
    const halfX = this.rangeX * 0.5;
    const halfZ = this.rangeZ * 0.5;
    const baseFloor = Math.floor(playerPos.y / 20.0) * 20.0;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      pos[idx] += this.velocities[idx] * dt;
      pos[idx + 1] += this.velocities[idx + 1] * dt;
      pos[idx + 2] += this.velocities[idx + 2] * dt;

      // Wrap seamlessly around player volume
      if (pos[idx] - playerPos.x > halfX) pos[idx] -= this.rangeX;
      else if (pos[idx] - playerPos.x < -halfX) pos[idx] += this.rangeX;

      if (pos[idx + 2] - playerPos.z > halfZ) pos[idx + 2] -= this.rangeZ;
      else if (pos[idx + 2] - playerPos.z < -halfZ) pos[idx + 2] += this.rangeZ;

      if (pos[idx + 1] < baseFloor) pos[idx + 1] += this.rangeY;
      else if (pos[idx + 1] > baseFloor + this.rangeY) pos[idx + 1] -= this.rangeY;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
