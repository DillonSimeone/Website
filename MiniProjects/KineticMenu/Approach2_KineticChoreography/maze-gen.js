// maze-gen.js — High-Stability Geometric Lattice Engine
import * as THREE from 'three';

const CELL_SIZE = 2.0;
const LATTICE_THICKNESS = 0.25; // Thin, graphic lines

export function mazeSDF(x, y, z, clearancePoints = []) {
    // Room clearance
    for (const p of clearancePoints) {
        const dx = x - p.x, dy = y - p.y, dz = z - p.z;
        if (dx*dx + dy*dy + dz*dz < 7.5) return -1.0;
    }

    const sx = x / CELL_SIZE, sy = y / CELL_SIZE, sz = z / CELL_SIZE;
    const ipx = Math.floor(sx) + 0.5, ipy = Math.floor(sy) + 0.5, ipz = Math.floor(sz) + 0.5;
    const qx = sx - ipx, qy = sy - ipy, qz = sz - ipz;
    const ax = Math.abs(qx), ay = Math.abs(qy), az = Math.abs(qz);
    const dot = ipx * 111.67 + ipy * 147.31 + ipz * 27.53;
    const h = ((Math.sin(dot) * 43758.5453) % 1 + 1) % 1;
    
    let a, b;
    if (h > 0.666) { a = ax; b = az; }
    else if (h > 0.333) { a = ay; b = az; }
    else { a = ax; b = ay; }

    // Thin lattice: positive value means solid
    return (Math.max(a, b) * CELL_SIZE) - (2.0 - LATTICE_THICKNESS);
}

export function generateMazeGeometry(cx, cy, cz, radius, step, clearancePoints = []) {
    const positions = [], normals = [];
    const size = Math.round((radius * 2) / step);
    const min = -radius;
    const grid = new Float32Array((size + 1) * (size + 1) * (size + 1));
    const idx = (ix, iy, iz) => ix + (size + 1) * (iy + (size + 1) * iz);

    for (let iz = 0; iz <= size; iz++) {
        for (let iy = 0; iy <= size; iy++) {
            for (let ix = 0; ix <= size; ix++) {
                grid[idx(ix, iy, iz)] = mazeSDF(cx + min + ix * step, cy + min + iy * step, cz + min + iz * step, clearancePoints);
            }
        }
    }

    const addQuad = (v1, v2, v3, v4, n) => {
        positions.push(...v1, ...v2, ...v3, ...v1, ...v3, ...v4);
        for(let i=0; i<6; i++) normals.push(...n);
    };

    for (let iz = 0; iz < size; iz++) {
        for (let iy = 0; iy < size; iy++) {
            for (let ix = 0; ix < size; ix++) {
                const v000 = grid[idx(ix, iy, iz)] > 0;
                const v100 = grid[idx(ix+1, iy, iz)] > 0;
                const v010 = grid[idx(ix, iy+1, iz)] > 0;
                const v001 = grid[idx(ix, iy, iz+1)] > 0;

                const x0 = min + ix * step, x1 = x0 + step;
                const y0 = min + iy * step, y1 = y0 + step;
                const z0 = min + iz * step, z1 = z0 + step;

                if (v000 !== v100) {
                    const n = v000 ? [1, 0, 0] : [-1, 0, 0];
                    addQuad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], n);
                }
                if (v000 !== v010) {
                    const n = v000 ? [0, 1, 0] : [0, -1, 0];
                    addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], n);
                }
                if (v000 !== v001) {
                    const n = v000 ? [0, 0, 1] : [0, 0, -1];
                    addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], n);
                }
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
}
