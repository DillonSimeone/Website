/**
 * three.js/js/road/scenery_batcher.js — Geometry Merging, Bayer Dither Fade & Instanced Slot Pools
 *
 * Eliminates pop-in and reduces hundreds of individual prop/tree draw calls
 * down to ~11 batched InstancedMesh draw calls across the whole world.
 */
import * as THREE from 'three';

/**
 * Merges an array of { geometry, color, matrix } parts into a single indexed/non-indexed
 * BufferGeometry with position, normal, and vertex color attributes.
 */
export function mergeColoredGeometries(parts) {
    let totalVerts = 0;
    const prepared = [];

    for (const part of parts) {
        if (!part || !part.geometry) continue;
        const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        if (part.matrix) {
            g.applyMatrix4(part.matrix);
        }
        if (!g.attributes.normal) {
            g.computeVertexNormals();
        }
        const pos = g.attributes.position;
        if (!pos || pos.count === 0) continue;
        totalVerts += pos.count;
        prepared.push({
            geom: g,
            color: part.color instanceof THREE.Color ? part.color : new THREE.Color(part.color || 0xffffff),
            useExistingVertexColors: !!part.useExistingVertexColors
        });
    }

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    let offset = 0;

    for (const item of prepared) {
        const pos = item.geom.attributes.position;
        const norm = item.geom.attributes.normal;
        const vCol = item.geom.attributes.color;
        const count = pos.count;

        for (let i = 0; i < count; i++) {
            const o3 = (offset + i) * 3;
            positions[o3 + 0] = pos.getX(i);
            positions[o3 + 1] = pos.getY(i);
            positions[o3 + 2] = pos.getZ(i);

            if (norm) {
                normals[o3 + 0] = norm.getX(i);
                normals[o3 + 1] = norm.getY(i);
                normals[o3 + 2] = norm.getZ(i);
            } else {
                normals[o3 + 1] = 1.0;
            }

            if (item.useExistingVertexColors && vCol) {
                colors[o3 + 0] = vCol.getX(i);
                colors[o3 + 1] = vCol.getY(i);
                colors[o3 + 2] = vCol.getZ(i);
            } else {
                colors[o3 + 0] = item.color.r;
                colors[o3 + 1] = item.color.g;
                colors[o3 + 2] = item.color.b;
            }
        }
        offset += count;
        item.geom.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return merged;
}

/**
 * Patches a Three.js material with:
 * - Per-instance aInstanceFade [0..1] smooth spawn/despawn fade
 * - Radial distance fade [uFadeStart..uFadeEnd] relative to uFadeCameraPos
 * - Smooth vertical unfurl scale when spawning/despawning
 * - Branchless 4x4 Bayer ordered screen-door alpha discard (opaque depthWrite compatible!)
 * - Optional GPU vertex wind sway
 */
export function applyBayerDitherFade(material, sharedUniforms, options = {}) {
    const enableWind = !!options.enableWind;
    const cacheTag = `bayer-dither-${enableWind ? 'wind' : 'static'}`;
    material.customProgramCacheKey = () => cacheTag;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uFadeCameraPos = sharedUniforms.uFadeCameraPos;
        shader.uniforms.uFadeStart = sharedUniforms.uFadeStart;
        shader.uniforms.uFadeEnd = sharedUniforms.uFadeEnd;
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.uniforms.uWindStrength = sharedUniforms.uWindStrength;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `
            #include <common>
            #ifdef USE_INSTANCING
            attribute float aInstanceFade;
            #endif
            uniform vec3 uFadeCameraPos;
            uniform float uFadeStart;
            uniform float uFadeEnd;
            uniform float uTime;
            uniform float uWindStrength;
            varying float vBayerFade;
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
            float bFade = clamp(aInstanceFade, 0.0, 1.0);
            float unfurl = mix(0.55, 1.0, smoothstep(0.0, 1.0, bFade));
            transformed.xyz *= unfurl;
            if (uWindStrength > 0.001) {
                float swayH = max(0.0, transformed.y);
                vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                transformed.x += sin(uTime * 1.6 + instOrigin.x * 0.13 + instOrigin.z * 0.11) * uWindStrength * swayH * 0.045;
            }
            #endif
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            #include <project_vertex>
            #ifdef USE_INSTANCING
            vec4 bayerWorldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            #else
            vec4 bayerWorldPos = modelMatrix * vec4(transformed, 1.0);
            #endif
            float bayerDist = length(bayerWorldPos.xz - uFadeCameraPos.xz);
            float distAlpha = 1.0 - smoothstep(uFadeStart, uFadeEnd, bayerDist);
            #ifdef USE_INSTANCING
            vBayerFade = clamp(aInstanceFade, 0.0, 1.0) * distAlpha;
            #else
            vBayerFade = distAlpha;
            #endif
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            varying float vBayerFade;
            float bayer4x4(vec2 fragCoord) {
                vec2 p = mod(floor(fragCoord), 4.0);
                float x0 = mod(p.x, 2.0);
                float x1 = floor(p.x * 0.5);
                float y0 = mod(p.y, 2.0);
                float y1 = floor(p.y * 0.5);
                float idx = abs(x0 - y0) * 8.0 + y0 * 4.0 + abs(x1 - y1) * 2.0 + y1;
                return (idx + 0.5) / 16.0;
            }
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `
            #include <clipping_planes_fragment>
            if (vBayerFade <= 0.005 || (vBayerFade < 0.995 && vBayerFade < bayer4x4(gl_FragCoord.xy))) {
                discard;
            }
            `
        );
    };
}

/**
 * Fixed-capacity InstancedMesh slot pool with smooth fade-in / fade-out lifecycle.
 * Avoids runtime allocations, scene graph add/remove overhead, and object pop-in.
 */
export class InstancedPropPool {
    constructor(scene, geometry, material, capacity = 512, options = {}) {
        this.scene = scene;
        this.capacity = capacity;
        this.fadeInDuration = options.fadeInDuration || 1.1;
        this.fadeOutDuration = options.fadeOutDuration || 0.85;

        // Clone geometry wrapper so each pool owns its own aInstanceFade InstancedBufferAttribute
        const instGeo = geometry.clone();
        this.fadeArray = new Float32Array(capacity);
        this.fadeAttr = new THREE.InstancedBufferAttribute(this.fadeArray, 1);
        this.fadeAttr.setUsage(THREE.DynamicDrawUsage);
        instGeo.setAttribute('aInstanceFade', this.fadeAttr);

        this.mesh = new THREE.InstancedMesh(instGeo, material, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;

        if (options.castShadow) this.mesh.castShadow = true;
        if (options.receiveShadow) this.mesh.receiveShadow = true;

        this.scene.add(this.mesh);

        // Slot state: 0 = free, 1 = fading_in, 2 = active, 3 = fading_out
        this.slotState = new Uint8Array(capacity);
        this.freeList = [];
        for (let i = capacity - 1; i >= 0; i--) {
            this.freeList.push(i);
        }

        this.activeIndices = new Set();
        this.highWaterMark = 0;
        this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        this._matrixDirty = false;
        this._fadeDirty = false;

        // Initialize all matrices as hidden zero scale
        for (let i = 0; i < capacity; i++) {
            this.mesh.setMatrixAt(i, this._zeroMatrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    allocate(matrix, immediate = false) {
        if (this.freeList.length === 0) return -1;
        const slot = this.freeList.pop();
        this.mesh.setMatrixAt(slot, matrix);
        this._matrixDirty = true;

        if (immediate) {
            this.slotState[slot] = 2;
            this.fadeArray[slot] = 1.0;
        } else {
            this.slotState[slot] = 1;
            this.fadeArray[slot] = 0.01;
            this.activeIndices.add(slot);
        }
        this._fadeDirty = true;

        if (slot + 1 > this.highWaterMark) {
            this.highWaterMark = slot + 1;
            this.mesh.count = this.highWaterMark;
        }
        return slot;
    }

    free(slot, immediate = false) {
        if (slot < 0 || slot >= this.capacity) return;
        const st = this.slotState[slot];
        if (st === 0) return;

        if (immediate) {
            this.slotState[slot] = 0;
            this.fadeArray[slot] = 0.0;
            this.mesh.setMatrixAt(slot, this._zeroMatrix);
            this.activeIndices.delete(slot);
            this.freeList.push(slot);
            this._matrixDirty = true;
            this._fadeDirty = true;
        } else if (st !== 3) {
            this.slotState[slot] = 3;
            this.activeIndices.add(slot);
        }
    }

    update(delta) {
        if (this.activeIndices.size > 0) {
            const inStep = delta / this.fadeInDuration;
            const outStep = delta / this.fadeOutDuration;

            for (const slot of this.activeIndices) {
                const st = this.slotState[slot];
                if (st === 1) {
                    const next = Math.min(1.0, this.fadeArray[slot] + inStep);
                    this.fadeArray[slot] = next;
                    this._fadeDirty = true;
                    if (next >= 1.0) {
                        this.slotState[slot] = 2;
                        this.activeIndices.delete(slot);
                    }
                } else if (st === 3) {
                    const next = Math.max(0.0, this.fadeArray[slot] - outStep);
                    this.fadeArray[slot] = next;
                    this._fadeDirty = true;
                    if (next <= 0.005) {
                        this.slotState[slot] = 0;
                        this.fadeArray[slot] = 0.0;
                        this.mesh.setMatrixAt(slot, this._zeroMatrix);
                        this._matrixDirty = true;
                        this.activeIndices.delete(slot);
                        this.freeList.push(slot);
                    }
                } else {
                    this.activeIndices.delete(slot);
                }
            }
        }

        if (this._matrixDirty) {
            this.mesh.instanceMatrix.needsUpdate = true;
            this._matrixDirty = false;
        }
        if (this._fadeDirty) {
            this.fadeAttr.needsUpdate = true;
            this._fadeDirty = false;
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.activeIndices.clear();
        this.freeList.length = 0;
    }
}
