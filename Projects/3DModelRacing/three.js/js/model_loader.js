// model_loader.js — 3D Model Importer & Texture Generator
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VehicleStats } from './vehicle_stats.js';

export const PATTERNS = [
    { id: 0, name: 'Solid Paint', animated: false },
    { id: 1, name: 'Checkered Flag', animated: false },
    { id: 2, name: 'Twin Racing Stripes', animated: false },
    { id: 3, name: 'Carbon Fiber Weave', animated: false },
    { id: 4, name: 'Honeycomb Hex', animated: false },
    { id: 5, name: 'Urban Camo', animated: false },
    { id: 6, name: 'Neon Cyber Grid', animated: true },
    { id: 7, name: 'Energy Pulse', animated: true },
    { id: 8, name: 'Hologram Scanlines', animated: true },
    { id: 9, name: 'Solar Flame', animated: true }
];

export const COLORS = [
    '#e52521', // Mario Red
    '#2196f3', // Toad Blue
    '#2ecc71', // Luigi Green
    '#f1c40f', // Wario Yellow
    '#e91e63', // Peach Pink
    '#ff6f00', // Bowser Orange
    '#9b59b6', // Waluigi Purple
    '#ecf0f1', // Silver White
    '#1abc9c', // Cyan Pulse
    '#34495e'  // Stealth Carbon
];

const textureCache = new Map();

export const ModelLoader = {
    // Normalizes geometry to 3.0m longest axis
    normalizeGeometry(geom) {
        geom.computeBoundingBox();
        const bbox = geom.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 3.0 / maxDim;

        geom.center();
        geom.scale(scale, scale, scale);
        geom.computeVertexNormals();
        return geom;
    },

    // Parses raw file ArrayBuffer / string based on extension
    async parseFile(file) {
        const name = file.name.toLowerCase();
        const buffer = await file.arrayBuffer();

        if (name.endsWith('.stl')) {
            const loader = new STLLoader();
            const geom = loader.parse(buffer);
            return this.normalizeGeometry(geom);
        } else if (name.endsWith('.obj')) {
            const text = new TextDecoder().decode(buffer);
            const loader = new OBJLoader();
            const group = loader.parse(text);
            const geom = this._extractGeometryFromGroup(group);
            return this.normalizeGeometry(geom);
        } else if (name.endsWith('.glb') || name.endsWith('.gltf')) {
            const loader = new GLTFLoader();
            const gltf = await new Promise((resolve, reject) => {
                loader.parse(buffer, '', resolve, reject);
            });
            const geom = this._extractGeometryFromGroup(gltf.scene);
            return this.normalizeGeometry(geom);
        } else {
            throw new Error('Unsupported format. Please upload STL, OBJ, or GLB.');
        }
    },

    _extractGeometryFromGroup(group) {
        const geometries = [];
        group.updateMatrixWorld(true);
        group.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const clone = child.geometry.clone();
                clone.applyMatrix4(child.matrixWorld);
                geometries.push(clone);
            }
        });
        if (geometries.length === 0) {
            return VehicleStats.createDefaultRacer();
        }
        if (geometries.length === 1) {
            return geometries[0];
        }
        // Merge into one BufferGeometry
        const pos = [];
        for (const g of geometries) {
            const p = g.getAttribute('position');
            if (p) {
                for (let i = 0; i < p.count; i++) {
                    pos.push(p.getX(i), p.getY(i), p.getZ(i));
                }
            }
        }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        merged.computeVertexNormals();
        return merged;
    },

    // Generates high-resolution pattern canvas textures
    getPatternTexture(id) {
        if (id === 0) return null;
        if (textureCache.has(id)) return textureCache.get(id);

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        switch (id) {
            case 1: // Checkers
                ctx.fillStyle = '#111111';
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        if ((x + y) % 2 === 0) {
                            ctx.fillRect(x * 16, y * 16, 16, 16);
                        }
                    }
                }
                break;
            case 2: // Racing stripes
                ctx.fillStyle = '#111111';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(36, 0, 18, h);
                ctx.fillRect(74, 0, 18, h);
                break;
            case 3: // Carbon
                ctx.fillStyle = '#181818';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#333333';
                for (let y = 0; y < 16; y++) {
                    for (let x = 0; x < 16; x++) {
                        if ((x % 2 === 0 && y % 2 === 0) || (x % 2 === 1 && y % 2 === 1)) {
                            ctx.fillRect(x * 8, y * 8, 8, 8);
                        }
                    }
                }
                break;
            case 4: // Honeycomb Hex
                ctx.fillStyle = '#1a1a24';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#66ccff';
                ctx.lineWidth = 3;
                for (let y = 0; y < h + 20; y += 24) {
                    for (let x = 0; x < w + 20; x += 28) {
                        const ox = (y / 24) % 2 === 0 ? 0 : 14;
                        ctx.strokeRect(x + ox, y, 12, 12);
                    }
                }
                break;
            case 5: // Camo
                ctx.fillStyle = '#2c3e2e';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#5c7356';
                ctx.beginPath();
                ctx.arc(32, 32, 28, 0, Math.PI * 2);
                ctx.arc(96, 96, 32, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1d271f';
                ctx.beginPath();
                ctx.arc(80, 30, 24, 0, Math.PI * 2);
                ctx.arc(30, 90, 26, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 6: // Neon Cyber Grid
                ctx.fillStyle = '#0a0d18';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                for (let i = 0; i <= w; i += 16) {
                    ctx.beginPath();
                    ctx.moveTo(i, 0); ctx.lineTo(i, h);
                    ctx.moveTo(0, i); ctx.lineTo(w, i);
                    ctx.stroke();
                }
                break;
            case 7: // Energy Pulse
                const rad = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
                rad.addColorStop(0, '#ffffff');
                rad.addColorStop(0.4, '#ff9900');
                rad.addColorStop(1, '#220000');
                ctx.fillStyle = rad;
                ctx.fillRect(0, 0, w, h);
                break;
            case 8: // Hologram Scanlines
                ctx.fillStyle = '#061324';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#4deeea';
                for (let y = 0; y < h; y += 4) {
                    ctx.fillRect(0, y, w, 2);
                }
                break;
            case 9: // Solar Flame
                const flame = ctx.createLinearGradient(0, h, 0, 0);
                flame.addColorStop(0, '#ff1100');
                flame.addColorStop(0.5, '#ff8800');
                flame.addColorStop(1, '#ffee00');
                ctx.fillStyle = flame;
                ctx.fillRect(0, 0, w, h);
                break;
            default:
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        textureCache.set(id, texture);
        return texture;
    },

    createMaterial(colorHex, patternId) {
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            roughness: 0.35,
            metalness: 0.15,
            side: THREE.DoubleSide
        });

        const tex = this.getPatternTexture(patternId);
        if (tex) {
            mat.map = tex;
        }

        // Animated / hologram emissions
        if (patternId === 6 || patternId === 8) {
            mat.emissive = new THREE.Color(0x00ffff);
            mat.emissiveIntensity = 0.65;
        } else if (patternId === 7 || patternId === 9) {
            mat.emissive = new THREE.Color(0xff6600);
            mat.emissiveIntensity = 0.75;
        }

        return mat;
    }
};
