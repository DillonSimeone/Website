
// voxels.js — Gravity-driven voxel formation engine with camera force field & afterimage trails.
import * as THREE from "three";
import { VOXEL_COUNT, SPRING_K, DAMPING, REPULSION_STRENGTH, FORCE_FIELD_RADIUS } from "./poses.js";

// Geometry cache — reuse across morphs
const GEOMETRIES = {
    box: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    tetrahedron: new THREE.TetrahedronGeometry(0.22),
    icosahedron: new THREE.IcosahedronGeometry(0.18),
};

// Minimum distance between any two voxels
const MIN_VOXEL_DIST = 0.7;
const SEPARATION_STRENGTH = 4.0;

export class VoxelFormation {
    constructor(scene) {
        this.scene = scene;
        this.meshes = [];
        this.velocities = [];
        this.targets = [];
        this.trails = [];
        this.currentGeometryKey = "box";
        this.targetGeometryKey = "box";
        this.morphProgress = 1;
        this.morphing = false;

        this.trailGroup = new THREE.Group();
        scene.add(this.trailGroup);

        this.isWindActive = false;
        this.activePoseIndex = -1;

        // Neural Mesh structures
        this.networkLines = new THREE.Group();
        this.scene.add(this.networkLines);
        this.packets = [];
        this.packetGeo = GEOMETRIES.box;
        this.lineMat = new THREE.LineBasicMaterial({ 
            color: 0x33ff33, 
            transparent: true, 
            opacity: 0.1,
            depthWrite: false
        });

        // Repairability structures
        this.swappedVoxels = new Set();
        this.repairTimer = 0;

        // De-Rez particles
        this.derezParticles = [];
        this.derezGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

        this._initVoxels();
    }

    setWind(active) {
        this.isWindActive = active;
    }

    _initVoxels() {
        const geo = GEOMETRIES.box;
        for (let i = 0; i < VOXEL_COUNT; i++) {
            const material = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? 0xffffff : 0x222222,
                emissive: 0x000000,
                metalness: 0.8,
                roughness: 0.1,
                transparent: true,
                opacity: 1.0,
            });
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
            mesh.userData.baseScale = 0.8 + Math.random() * 0.4;
            mesh.scale.setScalar(mesh.userData.baseScale);
            this.scene.add(mesh);
            this.meshes.push(mesh);
            this.velocities.push(new THREE.Vector3());
            this.targets.push(new THREE.Vector3().copy(mesh.position));
        }
    }

    _getFormationTargets(name) {
        const targets = [];
        if (name === "cluster") {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / VOXEL_COUNT);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                const r = 3.0 + Math.random() * 1.0;
                targets.push(new THREE.Vector3(
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.sin(phi) * Math.sin(theta) - 1,
                    r * Math.cos(phi)
                ));
            }
        } else if (name === "pillar") {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const angle = (i / VOXEL_COUNT) * Math.PI * 8 + Math.random() * 0.3;
                const height = (i / VOXEL_COUNT) * 20 - 5;
                const radius = 1.8 + Math.random() * 0.8;
                targets.push(new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius));
            }
        } else if (name === "explosion") {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const phi = Math.acos(1 - 2 * Math.random());
                const theta = Math.random() * Math.PI * 2;
                const r = 4 + Math.random() * 14;
                targets.push(new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)));
            }
        } else if (name === "grid") {
            const size = 5; 
            const spacing = 1.2;
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const gx = i % size;
                const gy = Math.floor(i / size) % size;
                const gz = Math.floor(i / (size * size));
                targets.push(new THREE.Vector3(
                    (gx - size/2) * spacing,
                    (gy - size/2) * spacing,
                    (gz - size/2) * spacing
                ));
            }
        } else if (name === "mandelbulb") {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / VOXEL_COUNT);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                const r = 2.0 + Math.sin(phi * 8) * Math.cos(theta * 8) * 0.5;
                targets.push(new THREE.Vector3(
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.sin(phi) * Math.sin(theta),
                    r * Math.cos(phi)
                ));
            }
        } else if (name === "circle") {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const angle = (i / VOXEL_COUNT) * Math.PI * 2;
                const r = 7.0; // Radius around the center/UI
                targets.push(new THREE.Vector3(
                    r * Math.cos(angle),
                    r * Math.sin(angle),
                    0
                ));
            }
        }
        return targets;
    }

    setFormation(formationName, poseConfig, camera, uiRects = []) {
        const newTargets = this._getFormationTargets(formationName);
        for (let i = 0; i < VOXEL_COUNT; i++) {
            this.targets[i].copy(newTargets[i] || new THREE.Vector3(0,0,0));
        }

        // Push apart
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i < VOXEL_COUNT; i++) {
                for (let j = i + 1; j < VOXEL_COUNT; j++) {
                    const dx = this.targets[i].x - this.targets[j].x;
                    const dy = this.targets[i].y - this.targets[j].y;
                    const dz = this.targets[i].z - this.targets[j].z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < MIN_VOXEL_DIST && dist > 0.001) {
                        const push = (MIN_VOXEL_DIST - dist) * 0.5 / dist;
                        this.targets[i].x += dx * push;
                        this.targets[i].y += dy * push;
                        this.targets[i].z += dz * push;
                        this.targets[j].x -= dx * push;
                        this.targets[j].y -= dy * push;
                        this.targets[j].z -= dz * push;
                    }
                }
            }
        }

        // UI Avoidance
        if (uiRects.length > 0 && poseConfig.cameraSequence && poseConfig.cameraSequence.length > 0) {
            const PAD = 0.25;
            const lastStep = poseConfig.cameraSequence[poseConfig.cameraSequence.length - 1];
            const virtCam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
            virtCam.position.set(...lastStep.pos);
            virtCam.lookAt(new THREE.Vector3(...lastStep.lookAt));
            virtCam.updateMatrixWorld(true);
            virtCam.updateProjectionMatrix();
            const paddedRects = uiRects.map(r => ({ x1: r.x1 - PAD, y1: r.y1 - PAD, x2: r.x2 + PAD, y2: r.y2 + PAD }));
            const screenPos = new THREE.Vector3();
            for (let i = 0; i < VOXEL_COUNT; i++) {
                for (let iter = 0; iter < 8; iter++) {
                    screenPos.copy(this.targets[i]).project(virtCam);
                    let hit = false;
                    for (const rect of paddedRects) {
                        if (screenPos.x > rect.x1 && screenPos.x < rect.x2 && screenPos.y > rect.y1 && screenPos.y < rect.y2) {
                            hit = true;
                            const distToTop = rect.y2 - screenPos.y;
                            const distToBot = screenPos.y - rect.y1;
                            const distToLeft = screenPos.x - rect.x1;
                            const distToRight = rect.x2 - screenPos.x;
                            const minV = Math.min(distToTop, distToBot);
                            const minH = Math.min(distToLeft, distToRight);
                            const depth = virtCam.position.distanceTo(this.targets[i]);
                            const scale = depth * 0.7;
                            if (minV < minH) {
                                const dir = distToTop < distToBot ? 1 : -1;
                                this.targets[i].y += dir * (minV + 0.1) * scale;
                            } else {
                                const dir = distToRight < distToLeft ? 1 : -1;
                                this.targets[i].x += dir * (minH + 0.1) * scale;
                            }
                            break;
                        }
                    }
                    if (!hit) break;
                }
            }
        }

        // Apply colors
        const palette = poseConfig.colorPalette;
        const emissive = new THREE.Color(poseConfig.emissiveColor);
        for (let i = 0; i < VOXEL_COUNT; i++) {
            const mat = this.meshes[i].material;
            mat.color.set(palette[i % palette.length]);
            if (i % 3 === 0) mat.emissive.copy(emissive).multiplyScalar(1.5);
            else mat.emissive.set(0x000000);
        }

        if (poseConfig.geometry !== this.currentGeometryKey) {
            this.targetGeometryKey = poseConfig.geometry;
            this.morphing = true;
            this.morphProgress = 0;
        }

        this.activePoseIndex = window.activePoseIndex; 
        this._updateNetworkMesh();
    }

    _updateNetworkMesh() {
        while(this.networkLines.children.length > 0) {
            const line = this.networkLines.children[0];
            line.geometry.dispose();
            this.networkLines.remove(line);
        }
        if (this.activePoseIndex !== 3) return;
        for (let i = 0; i < VOXEL_COUNT; i += 4) {
            const start = this.targets[i];
            const neighbors = [...Array(VOXEL_COUNT).keys()].filter(idx => idx !== i).sort((a, b) => start.distanceToSquared(this.targets[a]) - start.distanceToSquared(this.targets[b])).slice(0, 2);
            for (const nIdx of neighbors) {
                const geo = new THREE.BufferGeometry().setFromPoints([start, this.targets[nIdx]]);
                const line = new THREE.Line(geo, this.lineMat);
                this.networkLines.add(line);
            }
        }
    }

    update(dt, cameraPosition) {
        if (this.activePoseIndex === 0) {
            const angle = dt * 0.15; // Slow rotation speed
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            for (let i = 0; i < VOXEL_COUNT; i++) {
                const target = this.targets[i];
                const x = target.x;
                const y = target.y;
                target.x = x * cos - y * sin;
                target.y = x * sin + y * cos;
            }
        }

        if (this.morphing) {
            this.morphProgress += dt * 5.0; 
            if (this.morphProgress < 1.0) {
                const s = 1.0 - this.morphProgress;
                for (const mesh of this.meshes) mesh.scale.setScalar(mesh.userData.baseScale * Math.max(s, 0.05));
            } else if (this.morphProgress < 1.05) {
                const newGeo = GEOMETRIES[this.targetGeometryKey];
                for (const mesh of this.meshes) mesh.geometry = newGeo;
                this.currentGeometryKey = this.targetGeometryKey;
            }
            if (this.morphProgress >= 1.0) {
                const s = Math.min(this.morphProgress - 1.0, 1.0);
                for (const mesh of this.meshes) mesh.scale.setScalar(mesh.userData.baseScale * s);
                if (this.morphProgress >= 2.0) {
                    this.morphing = false;
                    for (const mesh of this.meshes) mesh.scale.setScalar(mesh.userData.baseScale);
                }
            }
        }

        const _toTarget = new THREE.Vector3();
        const _fromCamera = new THREE.Vector3();
        const _sep = new THREE.Vector3();

        for (let i = 0; i < VOXEL_COUNT; i++) {
            const mesh = this.meshes[i];
            const vel = this.velocities[i];
            const target = this.targets[i];

            _toTarget.subVectors(target, mesh.position);
            const springForce = _toTarget.multiplyScalar(SPRING_K);
            const dampForce = vel.clone().multiplyScalar(-DAMPING);

            _fromCamera.subVectors(mesh.position, cameraPosition);
            const camDist = _fromCamera.length();
            let repelForce = new THREE.Vector3();
            if (camDist < FORCE_FIELD_RADIUS) {
                repelForce = _fromCamera.normalize().multiplyScalar(REPULSION_STRENGTH / (camDist * camDist + 0.1));
            }

            let sepX = 0, sepY = 0, sepZ = 0;
            for (let j = (i + 1) % 4; j < VOXEL_COUNT; j += 4) {
                if (j === i) continue;
                _sep.subVectors(mesh.position, this.meshes[j].position);
                const d = _sep.length();
                if (d < MIN_VOXEL_DIST && d > 0.001) {
                    const f = SEPARATION_STRENGTH * (MIN_VOXEL_DIST - d) / d;
                    sepX += _sep.x * f; sepY += _sep.y * f; sepZ += _sep.z * f;
                }
            }

            const totalForce = springForce.add(dampForce).add(repelForce);
            totalForce.x += sepX; totalForce.y += sepY; totalForce.z += sepZ;

            const voltage = window.uVoltage || 0.0;
            if (voltage > 0.05) {
                const jitter = voltage * 15.0;
                totalForce.x += (Math.random() - 0.5) * jitter;
                totalForce.y += (Math.random() - 0.5) * jitter;
                totalForce.z += (Math.random() - 0.5) * jitter;
            }
            
            // Sync voxel opacity with Mandelbulb alpha
            const mAlpha = window.mandelbulbAlpha || 0.0;
            mesh.material.opacity = 1.0 - mAlpha;
            mesh.material.transparent = mesh.material.opacity < 0.99;
            
            vel.add(totalForce.multiplyScalar(dt));
            mesh.position.add(vel.clone().multiplyScalar(dt));

            if (window.uSourceType > 1.5 && window.uGridType === "ac") {
                const t = performance.now() * 0.001;
                mesh.position.y += Math.sin(t * Math.PI * 2.0 + i * 0.5) * 0.05;
            }

            if (this.isWindActive) {
                const spinSpeed = 2.0 + voltage * 8.0;
                mesh.rotation.y += dt * spinSpeed; mesh.rotation.x += dt * (spinSpeed * 0.3); 
            } else if (window.uSourceType === 0.0) {
                const time = performance.now() * 0.001;
                mesh.lookAt(new THREE.Vector3(Math.sin(time * 0.1) * 1.5, 0.8 + Math.cos(time * 0.2) * 0.4, 4.0));
            } else if (window.activePoseIndex === 5) {
                // Adaptive: face center
                mesh.lookAt(0,0,0);
            } else {
                mesh.rotation.x += dt * 0.3; mesh.rotation.y += dt * 0.5;
            }

            // Idle breathing — subtle scale + emissive pulse
            const breathe = 1.0 + Math.sin(performance.now() * 0.001 + i * 0.3) * 0.03;
            if (!this.morphing) {
                mesh.scale.setScalar(mesh.userData.baseScale * breathe);
            }
            if (mesh.material.emissive && i % 3 === 0) {
                const pulse = 0.8 + Math.sin(performance.now() * 0.002 + i) * 0.4;
                mesh.material.emissiveIntensity = pulse;
            }
        }

        this._updateTrails();
        // Repairability: Hot-Swap logic
        this._updateRepairability(dt);

        // Adaptive Compute: Fractal Mandelbulb
        this._updateAdaptiveCompute(dt);

        // Neural Mesh: Data flow
        this._updateNeuralMesh(dt);
    }

    _updateAdaptiveCompute(dt) {
        if (window.activePoseIndex !== 5) return;
        
        // Pull all voxels inside and hide them (shrink)
        for (let i = 0; i < VOXEL_COUNT; i++) {
            this.targets[i].set(0, 0, 0); // Pull to center
            const mesh = this.meshes[i];
            mesh.scale.setScalar(mesh.userData.baseScale * 0.01); // Hide inside
        }
    }

    _updateRepairability(dt) {
        // Update de-rez particles
        for (let i = this.derezParticles.length - 1; i >= 0; i--) {
            const p = this.derezParticles[i];
            p.life -= dt * 2.5;
            p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
            p.mesh.material.opacity = Math.max(p.life, 0);
            p.mesh.scale.multiplyScalar(0.96);
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
                this.derezParticles.splice(i, 1);
            }
        }

        if (window.activePoseIndex !== 4) {
            if (this.swappedVoxels.size > 0) {
                const gridTargets = this._getFormationTargets("grid");
                this.meshes.forEach((m, i) => { 
                    m.geometry = GEOMETRIES.box; 
                    m.scale.setScalar(m.userData.baseScale); 
                    this.targets[i].copy(gridTargets[i]);
                });
                this.swappedVoxels.clear();
            }
            return;
        }
        const intensity = window.repairIntensity || 0.2;
        this.repairTimer += dt;
        if (this.repairTimer > (2.0 - intensity * 1.8)) {
            this.repairTimer = 0;
            const idx = Math.floor(Math.random() * VOXEL_COUNT);
            const mesh = this.meshes[idx];
            const target = this.targets[idx];
            const side = Math.random() > 0.5 ? 1 : -1;
            const originalTarget = target.clone();
            
            // Spawn de-rez burst on ejection
            this._spawnDerez(mesh.position, mesh.material.color);
            
            target.x += side * 40; 
            setTimeout(() => {
                const keys = Object.keys(GEOMETRIES);
                mesh.geometry = GEOMETRIES[keys[Math.floor(Math.random() * keys.length)]];
                mesh.material.color.setHSL(Math.random(), 0.8, 0.5);
                mesh.material.emissive.setHSL(Math.random(), 0.8, 0.2);
                mesh.position.x = -side * 35;
                mesh.position.y = originalTarget.y + (Math.random() - 0.5) * 5;
                target.copy(originalTarget);
                this.swappedVoxels.add(idx);
                
                // Spawn de-rez burst on arrival
                this._spawnDerez(mesh.position, mesh.material.color);
            }, 1200);
        }
    }

    _spawnDerez(position, color) {
        const count = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: color.clone(),
                transparent: true,
                opacity: 0.9,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(this.derezGeo, mat);
            mesh.position.copy(position);
            mesh.scale.setScalar(0.5 + Math.random() * 0.5);
            this.scene.add(mesh);
            
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8
            );
            this.derezParticles.push({ mesh, vel, life: 1.0 });
        }
    }

    _updateNeuralMesh(dt) {
        if (window.activePoseIndex !== 3) {
            this.packets.forEach(p => { this.scene.remove(p.mesh); p.mesh.material.dispose(); });
            this.packets = []; return;
        }
        const intensity = window.neuralIntensity || 0.2;
        
        // Target central cluster (voxels 0-30) vs peripheral (voxels 31+)
        if (Math.random() < intensity && this.packets.length < 120) {
            const isToCenter = Math.random() > 0.3;
            let startIdx, endIdx;
            
            if (isToCenter) {
                startIdx = 30 + Math.floor(Math.random() * (VOXEL_COUNT - 30));
                endIdx = Math.floor(Math.random() * 30);
            } else {
                startIdx = Math.floor(Math.random() * 30);
                endIdx = 30 + Math.floor(Math.random() * (VOXEL_COUNT - 30));
            }

            if (startIdx !== endIdx) {
                const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
                const mat = new THREE.MeshBasicMaterial({ 
                    color: color, 
                    transparent: true, 
                    opacity: 0.7, 
                    depthWrite: false 
                });
                const mesh = new THREE.Mesh(this.packetGeo, mat);
                mesh.scale.setScalar(0.1); 
                this.scene.add(mesh);
                this.packets.push({ mesh, startIdx, endIdx, progress: 0, speed: 0.8 + Math.random() * 1.5 });
            }
        }

        for (let i = this.packets.length - 1; i >= 0; i--) {
            const p = this.packets[i];
            p.progress += dt * p.speed * (0.5 + intensity * 2.0);
            if (p.progress >= 1.0) { 
                this.scene.remove(p.mesh); 
                p.mesh.material.dispose(); 
                this.packets.splice(i, 1); 
            } else {
                const startPos = this.meshes[p.startIdx].position;
                const endPos = this.meshes[p.endIdx].position;
                p.mesh.position.lerpVectors(startPos, endPos, p.progress);
                
                // Add a slight arc
                const arc = Math.sin(p.progress * Math.PI) * 2.0;
                p.mesh.position.y += arc;
                
                p.mesh.scale.setScalar(0.05 + Math.sin(p.progress * Math.PI) * 0.2);
            }
        }
    }

    _updateTrails() {
        if (Math.random() > 0.3) return;
        for (let i = 0; i < VOXEL_COUNT; i += 8) {
            if (this.velocities[i].length() < 2) continue;
            const ghost = this._getTrailMesh(this.meshes[i]);
            ghost.position.copy(this.meshes[i].position); ghost.rotation.copy(this.meshes[i].rotation); ghost.scale.copy(this.meshes[i].scale);
            ghost.material.opacity = 0.4; ghost.userData.life = 0.5;
        }
        for (let i = this.trails.length - 1; i >= 0; i--) {
            const trail = this.trails[i];
            trail.userData.life -= 0.016;
            trail.material.opacity = Math.max(trail.userData.life, 0);
            if (trail.userData.life <= 0) { this.trailGroup.remove(trail); trail.material.dispose(); this.trails.splice(i, 1); }
        }
    }

    _getTrailMesh(source) {
        const mat = new THREE.MeshBasicMaterial({ color: source.material.emissive.getHex() || source.material.color.getHex(), transparent: true, opacity: 0.4, depthWrite: false });
        const ghost = new THREE.Mesh(source.geometry, mat);
        this.trailGroup.add(ghost); this.trails.push(ghost); return ghost;
    }

    getRandomVoxelPosition() { return this.meshes[Math.floor(Math.random() * VOXEL_COUNT)].position.clone(); }
}

