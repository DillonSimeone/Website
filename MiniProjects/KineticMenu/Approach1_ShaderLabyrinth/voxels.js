// voxels.js — Gravity-driven voxel formation engine with camera force field & afterimage trails.
import * as THREE from 'three';
import { VOXEL_COUNT, SPRING_K, DAMPING, REPULSION_STRENGTH, FORCE_FIELD_RADIUS } from './poses.js';

// Geometry cache — reuse across morphs
const GEOMETRIES = {
    box: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    tetrahedron: new THREE.TetrahedronGeometry(0.22),
    icosahedron: new THREE.IcosahedronGeometry(0.18),
};

// Minimum distance between any two voxels
const MIN_VOXEL_DIST = 0.7;
const SEPARATION_STRENGTH = 4.0;

// Formation generators — wider radii to prevent overlap
const FORMATIONS = {
    cluster(i, total) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / total);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = 3.0 + Math.random() * 1.0;
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta) - 1,
            z: r * Math.cos(phi),
        };
    },
    pillar(i, total) {
        const angle = (i / total) * Math.PI * 8 + Math.random() * 0.3;
        const height = (i / total) * 20 - 5;
        const radius = 1.8 + Math.random() * 0.8;
        return {
            x: Math.cos(angle) * radius,
            y: height,
            z: Math.sin(angle) * radius,
        };
    },
    explosion(i, total) {
        const phi = Math.acos(1 - 2 * Math.random());
        const theta = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 14;
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi),
        };
    },
};

export class VoxelFormation {
    constructor(scene) {
        this.scene = scene;
        this.meshes = [];
        this.velocities = [];
        this.targets = [];
        this.trails = [];
        this.currentGeometryKey = 'box';
        this.targetGeometryKey = 'box';
        this.morphProgress = 1;
        this.morphing = false;

        this.trailGroup = new THREE.Group();
        scene.add(this.trailGroup);

        this._initVoxels();
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
            mesh.position.set(
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30
            );
            mesh.userData.baseScale = 0.8 + Math.random() * 0.4;
            mesh.scale.setScalar(mesh.userData.baseScale);

            this.scene.add(mesh);
            this.meshes.push(mesh);
            this.velocities.push(new THREE.Vector3());
            this.targets.push(new THREE.Vector3().copy(mesh.position));
        }
    }

    setFormation(formationName, poseConfig, camera, uiRects = []) {
        const gen = FORMATIONS[formationName];
        if (!gen) return;

        // Step 1: Generate raw target positions
        for (let i = 0; i < VOXEL_COUNT; i++) {
            const p = gen(i, VOXEL_COUNT);
            this.targets[i].set(p.x, p.y, p.z);
        }

        // Step 2: Push apart any targets that are too close to each other
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

        // Step 3: UI avoidance — project targets from the FINAL camera viewpoint
        if (uiRects.length > 0 && poseConfig.cameraSequence && poseConfig.cameraSequence.length > 0) {
            const PAD = 0.25; // Very generous NDC padding for breathing room
            const lastStep = poseConfig.cameraSequence[poseConfig.cameraSequence.length - 1];

            // Build a virtual camera at the pose's final resting position
            const virtCam = new THREE.PerspectiveCamera(
                camera ? camera.fov : 70,
                window.innerWidth / window.innerHeight,
                0.1, 1000
            );
            virtCam.position.set(...lastStep.pos);
            virtCam.lookAt(new THREE.Vector3(...lastStep.lookAt));
            virtCam.updateMatrixWorld(true);
            virtCam.updateProjectionMatrix();

            const paddedRects = uiRects.map(r => ({
                x1: r.x1 - PAD,
                y1: r.y1 - PAD,
                x2: r.x2 + PAD,
                y2: r.y2 + PAD
            }));

            const screenPos = new THREE.Vector3();

            for (let i = 0; i < VOXEL_COUNT; i++) {
                for (let iter = 0; iter < 8; iter++) {
                    screenPos.copy(this.targets[i]).project(virtCam);
                    const sx = screenPos.x;
                    const sy = screenPos.y;
                    let hit = false;

                    for (const rect of paddedRects) {
                        if (sx > rect.x1 && sx < rect.x2 && sy > rect.y1 && sy < rect.y2) {
                            hit = true;
                            // Find shortest escape
                            const distToTop = rect.y2 - sy;
                            const distToBot = sy - rect.y1;
                            const distToLeft = sx - rect.x1;
                            const distToRight = rect.x2 - sx;
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
                            break; // Re-project and re-check
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
            const ci = i % palette.length;
            mat.color.set(palette[ci]);
            
            if (i % 3 === 0) {
                mat.emissive.copy(emissive).multiplyScalar(1.5);
            } else {
                mat.emissive.set(0x000000);
            }
        }

        // Start geometry morph if needed
        if (poseConfig.geometry !== this.currentGeometryKey) {
            this.targetGeometryKey = poseConfig.geometry;
            this.morphing = true;
            this.morphProgress = 0;
        }
    }

    update(dt, cameraPosition) {
        const cameraPos = cameraPosition;

        // Geometry morph: shrink → swap → grow
        if (this.morphing) {
            this.morphProgress += dt * 5.0; 
            if (this.morphProgress < 1.0) {
                const s = 1.0 - this.morphProgress;
                for (const mesh of this.meshes) {
                    mesh.scale.setScalar(mesh.userData.baseScale * Math.max(s, 0.05));
                }
            } else if (this.morphProgress < 1.05) {
                const newGeo = GEOMETRIES[this.targetGeometryKey];
                for (const mesh of this.meshes) { mesh.geometry = newGeo; }
                this.currentGeometryKey = this.targetGeometryKey;
            }
            if (this.morphProgress >= 1.0) {
                const s = Math.min(this.morphProgress - 1.0, 1.0);
                for (const mesh of this.meshes) {
                    mesh.scale.setScalar(mesh.userData.baseScale * s);
                }
                if (this.morphProgress >= 2.0) {
                    this.morphing = false;
                    for (const mesh of this.meshes) {
                        mesh.scale.setScalar(mesh.userData.baseScale);
                    }
                }
            }
        }

        // Physics step — spring + damping + camera repulsion + runtime separation
        const _toTarget = new THREE.Vector3();
        const _fromCamera = new THREE.Vector3();
        const _sep = new THREE.Vector3();

        for (let i = 0; i < VOXEL_COUNT; i++) {
            const mesh = this.meshes[i];
            const vel = this.velocities[i];
            const target = this.targets[i];

            // Spring force toward target
            _toTarget.subVectors(target, mesh.position);
            const springForce = _toTarget.multiplyScalar(SPRING_K);

            // Damping
            const dampForce = vel.clone().multiplyScalar(-DAMPING);

            // Camera repulsion force field
            _fromCamera.subVectors(mesh.position, cameraPos);
            const camDist = _fromCamera.length();
            let repelForce = new THREE.Vector3();
            if (camDist < FORCE_FIELD_RADIUS) {
                const strength = REPULSION_STRENGTH / (camDist * camDist + 0.1);
                repelForce = _fromCamera.normalize().multiplyScalar(strength);
            }

            // Runtime inter-voxel separation (sampled for performance)
            let sepX = 0, sepY = 0, sepZ = 0;
            for (let j = (i + 1) % 4; j < VOXEL_COUNT; j += 4) {
                if (j === i) continue;
                _sep.subVectors(mesh.position, this.meshes[j].position);
                const d = _sep.length();
                if (d < MIN_VOXEL_DIST && d > 0.001) {
                    const f = SEPARATION_STRENGTH * (MIN_VOXEL_DIST - d) / d;
                    sepX += _sep.x * f;
                    sepY += _sep.y * f;
                    sepZ += _sep.z * f;
                }
            }

            // Euler integration
            const totalForce = springForce.add(dampForce).add(repelForce);
            totalForce.x += sepX;
            totalForce.y += sepY;
            totalForce.z += sepZ;
            
            vel.add(totalForce.multiplyScalar(dt));
            mesh.position.add(vel.clone().multiplyScalar(dt));

            // Slow spin
            mesh.rotation.x += dt * 0.3;
            mesh.rotation.y += dt * 0.5;
        }

        // Update afterimage trails
        this._updateTrails();
    }

    _updateTrails() {
        if (Math.random() > 0.3) return;

        for (let i = 0; i < VOXEL_COUNT; i += 8) {
            const speed = this.velocities[i].length();
            if (speed < 2) continue;

            const ghost = this._getTrailMesh(this.meshes[i]);
            ghost.position.copy(this.meshes[i].position);
            ghost.rotation.copy(this.meshes[i].rotation);
            ghost.scale.copy(this.meshes[i].scale);
            ghost.material.opacity = 0.4;
            ghost.userData.life = 0.5;
        }

        const toRemove = [];
        for (const trail of this.trails) {
            trail.userData.life -= 0.016;
            trail.material.opacity = Math.max(trail.userData.life, 0);
            if (trail.userData.life <= 0) toRemove.push(trail);
        }
        for (const t of toRemove) {
            this.trailGroup.remove(t);
            t.material.dispose();
            this.trails.splice(this.trails.indexOf(t), 1);
        }
    }

    _getTrailMesh(source) {
        const mat = new THREE.MeshBasicMaterial({
            color: source.material.emissive.getHex() || source.material.color.getHex(),
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
        });
        const ghost = new THREE.Mesh(source.geometry, mat);
        this.trailGroup.add(ghost);
        this.trails.push(ghost);
        return ghost;
    }

    getRandomVoxelPosition() {
        const idx = Math.floor(Math.random() * VOXEL_COUNT);
        return this.meshes[idx].position.clone();
    }
}
