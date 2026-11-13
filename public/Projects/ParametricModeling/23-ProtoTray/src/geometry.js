import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeBox, makeCylinder, manifoldToThree } from '../../00-CommonParts/helpers.js';
import { getPartPreset } from './parts-catalog.js';
import { state, getBinOuterSize } from './state.js';
import { stepSpring } from './juice.js';
import { buildTrayLidManifold, buildLedDiffusersManifold } from './lid.js';

let M = null;
let scene, camera, renderer, controls;
const trayRoot = new THREE.Group();
const binVisuals = new Map();
const shatterParticles = [];
let snapGhostGroup = null;
let lidPreviewGroup = null;
let hoveredId = null;
let lastTime = performance.now();

export async function initManifold() {
    if (M) return M;
    const mod = await import('https://unpkg.com/manifold-3d/manifold.js');
    const wasm = await mod.default();
    wasm.setup();
    M = wasm.Manifold;
    return M;
}

export function initViewport(containerEl) {
    scene = new THREE.Scene();
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 1500);
    camera.position.set(0, 115, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    containerEl.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;

    // Crisp CAD studio lighting
    scene.add(new THREE.HemisphereLight(0xf1f5f9, 0x1e293b, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(80, 150, 75);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rim.position.set(-90, 70, -80);
    scene.add(rim);

    const grid = new THREE.GridHelper(320, 32, 0x1e293b, 0x0f172a);
    scene.add(grid);

    trayRoot.rotation.x = -Math.PI / 2;
    scene.add(trayRoot);

    snapGhostGroup = new THREE.Group();
    snapGhostGroup.visible = false;
    trayRoot.add(snapGhostGroup);

    lidPreviewGroup = new THREE.Group();
    lidPreviewGroup.visible = false;
    trayRoot.add(lidPreviewGroup);

    window.addEventListener('resize', () => {
        const nw = containerEl.clientWidth;
        const nh = containerEl.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
    });

    const animate = (now) => {
        requestAnimationFrame(animate);
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        stepAnimations(dt);
        controls.update();
        renderer.render(scene, camera);
    };
    requestAnimationFrame(animate);

    return { scene, camera, renderer, controls, trayRoot };
}

function stepAnimations(dt) {
    for (const bin of state.bins) {
        const vis = binVisuals.get(bin.id);
        if (!vis) continue;
        const a = vis.anim;

        const sx = stepSpring(a.x, a.vx, bin.x, dt, 380, 26);
        const sy = stepSpring(a.y, a.vy, bin.y, dt, 380, 26);
        a.x = sx.val; a.vx = sx.vel;
        a.y = sy.val; a.vy = sy.vel;

        // Shortest angular delta for smooth 90-deg rotation
        let targetRot = bin.rot;
        if (targetRot - a.rotDeg > 180) a.rotDeg += 360;
        if (targetRot - a.rotDeg < -180) a.rotDeg -= 360;
        const sr = stepSpring(a.rotDeg, a.vRot, targetRot, dt, 340, 20);
        a.rotDeg = sr.val; a.vRot = sr.vel;

        // Spawn pop-in jiggle
        const ss = stepSpring(a.scale, a.vScale, 1.0, dt, 340, 12);
        a.scale = Math.max(0.01, ss.val); a.vScale = ss.vel;

        vis.group.position.set(a.x, a.y, 0);
        vis.group.rotation.z = THREE.MathUtils.degToRad(a.rotDeg);
        vis.group.scale.set(a.scale, a.scale, a.scale);

        // Selection & hover visual feedback
        const isSel = bin.id === state.selectedId;
        const isHov = bin.id === hoveredId;
        if (vis.binMesh) {
            vis.binMesh.material.emissive.setHex(isSel ? 0x0891b2 : (isHov ? 0x1e293b : 0x000000));
            vis.binMesh.material.emissiveIntensity = isSel ? 0.35 : (isHov ? 0.25 : 0);
        }
        if (vis.edgeLines) {
            vis.edgeLines.material.color.setHex(isSel ? 0x22d3ee : (isHov ? 0x38bdf8 : 0x0f172a));
        }
        if (vis.ghostMesh) {
            vis.ghostMesh.visible = state.showGhosts;
        }
    }

    // Step delete shatter particles (float up off-screen & despawn)
    for (let i = shatterParticles.length - 1; i >= 0; i--) {
        const p = shatterParticles[i];
        p.life -= dt;
        if (p.life <= 0) {
            trayRoot.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            shatterParticles.splice(i, 1);
            continue;
        }
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vz += 45 * dt; // accelerate upward in Manifold Z-up
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        const s = Math.max(0.01, p.life / p.maxLife);
        p.mesh.scale.setScalar(s);
    }
}

export function spawnDeleteShatter(bin) {
    if (!bin) return;
    const count = 14;
    const h = state.global.baseThickness + bin.wallHeight * 0.5;
    for (let i = 0; i < count; i++) {
        const size = 1.6 + Math.random() * 1.8;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? new THREE.Color(bin.color || '#06b6d4') : 0xe2e8f0,
            roughness: 0.4
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            bin.x + (Math.random() - 0.5) * bin.w * 0.7,
            bin.y + (Math.random() - 0.5) * bin.d * 0.7,
            h
        );
        trayRoot.add(mesh);
        shatterParticles.push({
            mesh,
            vx: (Math.random() - 0.5) * 32,
            vy: (Math.random() - 0.5) * 32,
            vz: 28 + Math.random() * 42,
            rx: (Math.random() - 0.5) * 10,
            ry: (Math.random() - 0.5) * 10,
            life: 0.75 + Math.random() * 0.35,
            maxLife: 1.1
        });
    }
}

export function setHoveredBin(binId) {
    hoveredId = binId;
}

export function getHitMeshes() {
    const arr = [];
    for (const vis of binVisuals.values()) {
        if (vis.hitMesh) arr.push(vis.hitMesh);
    }
    return arr;
}

export function showDragSnapGhost(bin, snapX, snapY) {
    if (!snapGhostGroup || !bin) return;
    const { ew, ed } = getBinOuterSize(bin, state.global.wallThickness);
    const h = state.global.baseThickness + bin.wallHeight;

    while (snapGhostGroup.children.length > 0) {
        const c = snapGhostGroup.children[0];
        snapGhostGroup.remove(c);
        c.geometry.dispose();
        c.material.dispose();
    }

    const boxGeo = new THREE.BoxGeometry(ew, ed, h);
    const fill = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
        color: 0x06b6d4, transparent: true, opacity: 0.22, depthWrite: false
    }));
    const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0x22d3ee })
    );
    snapGhostGroup.add(fill, wire);
    snapGhostGroup.position.set(snapX, snapY, h / 2);
    snapGhostGroup.visible = true;
}

export function hideDragSnapGhost() {
    if (snapGhostGroup) snapGhostGroup.visible = false;
}

/**
 * Open-top U-slot cutout (zero 3D-printing overhangs)
 */
function buildCutoutBox(side, innerW, innerD, wall, base, wallHeight, spec) {
    const maxSpan = (side === 'N' || side === 'S') ? innerW : innerD;
    const cutW = spec.width >= maxSpan ? maxSpan + 0.4 : Math.min(spec.width, maxSpan - 1.0);
    const zOff = spec.zOffset ?? 0.8;
    const cutH = wallHeight + 2.0; // Always cuts all the way through the top!
    const zCenter = base + zOff + cutH / 2;
    const thick = wall + 0.8;

    if (side === 'N') return makeBox(M, cutW, thick, cutH, true).translate([0, innerD / 2 + wall / 2, zCenter]);
    if (side === 'S') return makeBox(M, cutW, thick, cutH, true).translate([0, -innerD / 2 - wall / 2, zCenter]);
    if (side === 'E') return makeBox(M, thick, cutW, cutH, true).translate([innerW / 2 + wall / 2, 0, zCenter]);
    return makeBox(M, thick, cutW, cutH, true).translate([-innerW / 2 - wall / 2, 0, zCenter]);
}

function buildCradleWalls(innerW, innerD, wall, base) {
    const cradleH = 14.0;
    const wallT = Math.max(wall, 1.8);
    const parts = [];
    for (const dir of [-1, 1]) {
        const upright = makeBox(M, wallT, innerD * 0.72, cradleH, true)
            .translate([dir * (innerW / 2 - wallT / 2), 0, base + cradleH / 2]);
        const hole = makeCylinder(M, 2.4, wallT + 2, 24, true)
            .rotate([0, 90, 0])
            .translate([dir * (innerW / 2 - wallT / 2), 0, base + cradleH * 0.62]);
        const res = upright.subtract(hole);
        upright.delete();
        hole.delete();
        parts.push(res);
    }
    return parts;
}

function buildCarvedSCurveBlock(innerW, yCenter, blockLen, wallHeight, base) {
    // Smooth cubic Bezier S-letter negative cutout built from swept cylinders + segments
    const h = wallHeight;
    let block = makeBox(M, innerW + 0.4, blockLen, h, true)
        .translate([0, yCenter, base + h / 2]);

    const r = 2.2; // 4.4mm cable channel width
    const swing = Math.min(4.2, (innerW - r * 2) * 0.62);
    const y0 = yCenter + blockLen / 2 + 1.0;
    const y3 = yCenter - blockLen / 2 - 1.0;
    const p0 = [0, y0];
    const p1 = [swing * 1.45, y0 - blockLen * 0.28];
    const p2 = [-swing * 1.45, y3 + blockLen * 0.28];
    const p3 = [0, y3];

    const steps = 18;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
        const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
        pts.push([x, y]);
    }

    const chH = h + 1.2;
    const zC = base + 0.8 + chH / 2;
    const cuts = [];
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        cuts.push(makeCylinder(M, r, chH, 16, true).translate([x1, y1, zC]));
        if (i < pts.length - 1) {
            const [x2, y2] = pts[i + 1];
            const len = Math.hypot(x2 - x1, y2 - y1);
            const deg = THREE.MathUtils.radToDeg(Math.atan2(y2 - y1, x2 - x1));
            cuts.push(
                makeBox(M, len + 0.2, r * 2, chH, true)
                    .rotate([0, 0, deg])
                    .translate([(x1 + x2) / 2, (y1 + y2) / 2, zC])
            );
        }
    }

    let sCut = cuts[0];
    for (let i = 1; i < cuts.length; i++) {
        const n = sCut.add(cuts[i]); sCut.delete(); cuts[i].delete(); sCut = n;
    }

    const res = block.subtract(sCut);
    block.delete(); sCut.delete();
    return res;
}

function buildShapeLoopChannel(sides, outerSize, wall, base, wallHeight) {
    // 8mm LED strip channels joined into a Triangle / Square / Hexagon loop
    const chW = 8.6;
    const r = (outerSize / 2) - wall - chW / 2 - 1.0;
    const verts = [];
    const angleOffset = sides === 4 ? Math.PI / 4 : Math.PI / 2;
    for (let i = 0; i < sides; i++) {
        const a = angleOffset + (i * Math.PI * 2) / sides;
        verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }

    const outSegs = [];
    const inSegs = [];
    const totalH = base + wallHeight;

    for (let i = 0; i < sides; i++) {
        const [x1, y1] = verts[i];
        const [x2, y2] = verts[(i + 1) % sides];
        const segLen = Math.hypot(x2 - x1, y2 - y1) + chW + wall * 2;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const deg = THREE.MathUtils.radToDeg(Math.atan2(y2 - y1, x2 - x1));

        outSegs.push(
            makeBox(M, segLen, chW + wall * 2, totalH, true)
                .translate([0, 0, totalH / 2])
                .rotate([0, 0, deg])
                .translate([cx, cy, 0])
        );
        inSegs.push(
            makeBox(M, segLen - wall * 1.5, chW, wallHeight + 2.0, true)
                .translate([0, 0, base + (wallHeight + 2.0) / 2])
                .rotate([0, 0, deg])
                .translate([cx, cy, 0])
        );
    }

    let acc = outSegs[0];
    for (let i = 1; i < outSegs.length; i++) {
        const n = acc.add(outSegs[i]); acc.delete(); outSegs[i].delete(); acc = n;
    }
    for (const c of inSegs) {
        const n = acc.subtract(c); acc.delete(); c.delete(); acc = n;
    }
    return acc;
}

function buildSingleBinManifold(bin) {
    const preset = getPartPreset(bin.partId);
    const wall = state.global.wallThickness;
    const sideWall = wall + (preset.isLedStrip ? 1.0 : 0);
    const base = state.global.baseThickness;
    const innerW = bin.w + 2 * bin.tolerance;
    const tail = bin.strainRelief ? 26.0 : 0;
    const innerD = bin.d + 2 * bin.tolerance + tail;
    const ow = innerW + 2 * sideWall;
    const od = innerD + 2 * wall;
    const totalH = base + bin.wallHeight;

    let acc;
    if (preset.shapeLoopSides) {
        // Baseplate + 8mm LED channels joined into a Triangle / Square / Hexagon loop
        const basePlate = makeBox(M, ow, od, base, true).translate([0, 0, base / 2]);
        const loop = buildShapeLoopChannel(preset.shapeLoopSides, Math.min(ow, od), wall, base, bin.wallHeight);
        acc = basePlate.add(loop);
        basePlate.delete(); loop.delete();
        return acc;
    }

    acc = makeBox(M, ow, od, totalH, true).translate([0, 0, totalH / 2]);

    // 1. Main pocket cavity (circular for coin cell, box otherwise)
    let cav;
    if (preset.isCoinCell) {
        cav = makeCylinder(M, innerW / 2, bin.wallHeight + 2.0, 36, true)
            .translate([0, 0, base + (bin.wallHeight + 2.0) / 2]);
    } else {
        cav = makeBox(M, innerW, innerD, bin.wallHeight + 2.0, true)
            .translate([0, 0, base + (bin.wallHeight + 2.0) / 2]);
    }
    let next = acc.subtract(cav);
    acc.delete(); cav.delete(); acc = next;

    // 2. Coin cell 3mm inside wire notch
    if (preset.isCoinCell) {
        const notch = makeBox(M, 3.0, wall + 4.0, bin.wallHeight + 2.0, true)
            .translate([0, innerD / 2, base + (bin.wallHeight + 2.0) / 2]);
        next = acc.subtract(notch);
        acc.delete(); notch.delete(); acc = next;
    }

    // 3. 8x8 Matrix 3mm inner support ledge (hollow center, 3mm rim around inside)
    if (preset.innerLedge) {
        const lW = Math.max(4, innerW - preset.innerLedge * 2);
        const lD = Math.max(4, innerD - preset.innerLedge * 2);
        const centerCut = makeBox(M, lW, lD, base + 2.0, true).translate([0, 0, base / 2]);
        next = acc.subtract(centerCut);
        acc.delete(); centerCut.delete(); acc = next;
    }

    // 4. USB-C S-Curve Strain Relief (carved S-channel behind USB-C bay)
    if (preset.isStrainReliefOnly) {
        const blockLen = 16.0;
        const sBlock = buildCarvedSCurveBlock(innerW, -innerD / 2 + blockLen / 2, blockLen, bin.wallHeight, base);
        next = acc.add(sBlock);
        acc.delete(); sBlock.delete(); acc = next;
    } else if (bin.strainRelief) {
        const blockLen = 15.0;
        const sBlock = buildCarvedSCurveBlock(innerW, innerD / 2 - blockLen / 2, blockLen, bin.wallHeight, base);
        next = acc.add(sBlock);
        acc.delete(); sBlock.delete(); acc = next;
    }

    // 4b. LED Strip 45-deg Diamond V-Grooves (cut through both ends, zero overhangs)
    if (preset.isLedStrip) {
        const lenY = od + 1.0;
        const botDiag = 2.0;
        const topDiag = 1.8;
        for (const sideX of [-innerW / 2, innerW / 2]) {
            const botG = makeBox(M, botDiag, lenY, botDiag, true)
                .rotate([0, 45, 0])
                .translate([sideX, 0, base + 1.5]);
            const topG = makeBox(M, topDiag, lenY, topDiag, true)
                .rotate([0, 45, 0])
                .translate([sideX, 0, base + bin.wallHeight - 1.5]);
            next = acc.subtract(botG).subtract(topG);
            acc.delete(); botG.delete(); topG.delete(); acc = next;
        }
    }

    // 5. Upright Motor Cradle
    if (bin.cradle) {
        for (const cw of buildCradleWalls(innerW, innerD, wall, base)) {
            next = acc.add(cw);
            acc.delete(); cw.delete(); acc = next;
        }
    }

    // 6. Cooling Fans (Horizontal diamond base OR Vertical block with center diamond + 4 corner M2/M3 screws)
    if (preset.isFan) {
        const screwR = (bin.screwSize === 'M2' ? 2.2 : 3.2) / 2;
        const fSize = preset.fanSize || innerW;
        const fThick = Math.min(preset.fanThick || 10, innerD - 1.0);
        const pitch = preset.fanPitch || (fSize * 0.8);
        if (bin.fanOrientation === 'vertical') {
            // Thickened vertical frame: fan slots 45-deg into diamond pocket from +Y,
            // stopped by a back (-Y) lip with a smaller diamond airflow window,
            // side-entry M2/M3 lock screws (±X), and bottom cable cylinder cutout.
            const slotDepth = Math.min(fThick, 8.0) + 2 * bin.tolerance;
            const lipThick = 2.0;
            const frameT = Math.max(slotDepth + lipThick, 8.5);
            const diaSpan = (fSize + 2 * bin.tolerance) * Math.SQRT2;
            const frameW = Math.max(ow, diaSpan + wall * 4.5);
            const frameH = diaSpan + wall * 4.5;
            const zCenter = base + frameH / 2;

            const basePlate = makeBox(M, Math.max(ow, frameW), Math.max(od, frameT + 2.0), base, true)
                .translate([0, 0, base / 2]);
            const vFrame = makeBox(M, frameW, frameT, frameH, true)
                .translate([0, 0, zCenter]);
            let vHolder = basePlate.add(vFrame);
            basePlate.delete(); vFrame.delete();

            // Diamond pocket from +Y front (leaves lipThick on -Y back)
            const fanPocket = makeBox(M, fSize + 2 * bin.tolerance, slotDepth + 2.0, fSize + 2 * bin.tolerance, true)
                .rotate([0, 45, 0])
                .translate([0, lipThick / 2 + 1.0, zCenter]);
            // Smaller through-diamond airflow window in back lip
            const airWin = makeBox(M, Math.max(4, fSize - 4.0), frameT + 4.0, Math.max(4, fSize - 4.0), true)
                .rotate([0, 45, 0])
                .translate([0, 0, zCenter]);
            // Bottom cylindrical cable cutout
            const cableHole = makeCylinder(M, 2.5, frameT + 6.0, 20, true)
                .rotate([90, 0, 0])
                .translate([0, 0, base + 2.5]);

            let hn = vHolder.subtract(fanPocket).subtract(airWin).subtract(cableHole);
            vHolder.delete(); fanPocket.delete(); airWin.delete(); cableHole.delete();
            vHolder = hn;

            // M2/M3 locking screws aimed directly into the Top, Left, and Right corners of the diamond
            const screwY = lipThick / 2;
            const lrLen = (frameW - diaSpan * 0.5) / 2 + 2.0;
            const leftScrew = makeCylinder(M, screwR, lrLen, 16, true)
                .rotate([0, 90, 0])
                .translate([-frameW / 2 + lrLen / 2 - 1.0, screwY, zCenter]);
            const rightScrew = makeCylinder(M, screwR, lrLen, 16, true)
                .rotate([0, 90, 0])
                .translate([frameW / 2 - lrLen / 2 + 1.0, screwY, zCenter]);
            const topLen = (frameH - diaSpan * 0.5) / 2 + 2.0;
            const topScrew = makeCylinder(M, screwR, topLen, 16, true)
                .translate([0, screwY, base + frameH - topLen / 2 + 1.0]);

            hn = vHolder.subtract(leftScrew).subtract(rightScrew).subtract(topScrew);
            vHolder.delete(); leftScrew.delete(); rightScrew.delete(); topScrew.delete();
            vHolder = hn;

            acc.delete();
            return vHolder;
        } else {
            // Horizontal: support-free 45-deg diamond airflow cutout + side screw holes
            const diag = (innerW - 4.0) / Math.SQRT2;
            const diamond = makeBox(M, diag, diag, base + 2.0, true)
                .rotate([0, 0, 45])
                .translate([0, 0, base / 2]);
            next = acc.subtract(diamond);
            acc.delete(); diamond.delete(); acc = next;

            for (const py of [-pitch / 2, pitch / 2]) {
                const hole = makeCylinder(M, screwR, ow + 4.0, 16, true)
                    .rotate([0, 90, 0])
                    .translate([0, py, base + Math.min(bin.wallHeight * 0.55, 5.0)]);
                next = acc.subtract(hole);
                acc.delete(); hole.delete(); acc = next;
            }
        }
    }

    // 7. Wall U-Slot Cutouts (zero overhangs)
    for (const side of ['N', 'S', 'E', 'W']) {
        if (!bin.activeCutouts?.[side]) continue;
        const spec = preset.cutouts?.[side] || { width: 10, zOffset: 0.8 };
        const cut = buildCutoutBox(side, innerW, innerD, wall, base, bin.wallHeight, spec);
        next = acc.subtract(cut);
        acc.delete(); cut.delete(); acc = next;
    }

    // 8. Floor Pin Through-Slots (e.g. ESP32-C3)
    if (preset.floorSlots) {
        for (const fs of preset.floorSlots) {
            const slot = makeBox(M, fs.w, fs.d, base + 2.0, true)
                .translate([fs.xOffset, fs.yOffset - tail / 2, base / 2]);
            next = acc.subtract(slot);
            acc.delete(); slot.delete(); acc = next;
        }
    }

    return acc;
}

function getBinGeometrySig(bin) {
    const g = state.global;
    return JSON.stringify([
        bin.partId, bin.w, bin.d, bin.wallHeight, bin.tolerance,
        bin.cradle, bin.strainRelief, bin.fanOrientation, bin.screwSize,
        bin.activeCutouts, g.wallThickness, g.baseThickness
    ]);
}

function disposeGroup(group) {
    trayRoot.remove(group);
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
}

export async function rebuildTrayGeometry() {
    await initManifold();

    const activeIds = new Set(state.bins.map(b => b.id));
    for (const [id, vis] of binVisuals.entries()) {
        if (!activeIds.has(id)) {
            disposeGroup(vis.group);
            binVisuals.delete(id);
        }
    }

    for (const bin of state.bins) {
        const sig = getBinGeometrySig(bin);
        const existing = binVisuals.get(bin.id);
        if (existing && existing.sig === sig) continue;

        const prevAnim = existing ? existing.anim : {
            x: bin.x, y: bin.y, rotDeg: bin.rot,
            scale: 0.01, vx: 0, vy: 0, vRot: 0, vScale: 0
        };
        if (existing) disposeGroup(existing.group);

        const group = new THREE.Group();
        const mani = buildSingleBinManifold(bin);
        const rawGeo = manifoldToThree(mani.getMesh());
        mani.delete();

        // Split vertices for razor-sharp flat shading (eliminates corner gradients)
        const flatGeo = rawGeo.toNonIndexed();
        rawGeo.dispose();
        flatGeo.computeVertexNormals();

        const binMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.45,
            metalness: 0.08
        });
        const binMesh = new THREE.Mesh(flatGeo, binMat);
        group.add(binMesh);

        // Crisp CAD edge-line overlay
        const edgeGeo = new THREE.EdgesGeometry(flatGeo, 24);
        const edgeLines = new THREE.LineSegments(
            edgeGeo,
            new THREE.LineBasicMaterial({ color: 0x0f172a })
        );
        group.add(edgeLines);

        // Hit-box for raycasting
        const preset = getPartPreset(bin.partId);
        const sideWall = state.global.wallThickness + (preset.isLedStrip ? 1.0 : 0);
        const innerW = bin.w + 2 * bin.tolerance;
        const tail = bin.strainRelief ? 26.0 : 0;
        const innerD = bin.d + 2 * bin.tolerance + tail;
        const ow = innerW + 2 * sideWall;
        const od = innerD + 2 * state.global.wallThickness;
        const totalH = state.global.baseThickness + bin.wallHeight;
        const hitMesh = new THREE.Mesh(
            new THREE.BoxGeometry(ow, od, totalH),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitMesh.position.z = totalH / 2;
        hitMesh.userData.binId = bin.id;
        group.add(hitMesh);

        // Ghost module preview (auto-grounded so min.z rests cleanly on bin floor)
        let ghostMesh = null;
        if (preset.buildGhost) {
            const gm = preset.buildGhost(M);
            if (gm) {
                const isVertFan = preset.isFan && bin.fanOrientation === 'vertical';
                let oriented = gm;
                if (isVertFan) {
                    const fT = preset.fanThick || 10;
                    const slotD = Math.min(fT, 8.0) + 2 * bin.tolerance;
                    const lipT = 2.0;
                    oriented = gm
                        .translate([0, 0, -fT / 2])
                        .rotate([90, 0, 0])
                        .rotate([0, 45, 0])
                        .translate([0, lipT / 2 + (fT - slotD) / 2, 0]);
                }
                const gGeo = manifoldToThree(oriented.getMesh()).toNonIndexed();
                if (oriented !== gm) oriented.delete();
                gm.delete();
                gGeo.computeVertexNormals();
                gGeo.computeBoundingBox();
                const minZ = gGeo.boundingBox ? gGeo.boundingBox.min.z : 0;
                ghostMesh = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({
                    color: new THREE.Color(bin.color || '#06b6d4'),
                    transparent: true,
                    opacity: 0.42,
                    roughness: 0.3
                }));
                ghostMesh.position.z = state.global.baseThickness + (isVertFan ? state.global.wallThickness * 2.25 : 0) - minZ;
                ghostMesh.visible = state.showGhosts;
                group.add(ghostMesh);
            }
        }

        group.position.set(prevAnim.x, prevAnim.y, 0);
        group.rotation.z = THREE.MathUtils.degToRad(prevAnim.rotDeg);
        group.scale.set(prevAnim.scale, prevAnim.scale, prevAnim.scale);
        trayRoot.add(group);

        binVisuals.set(bin.id, {
            group, binMesh, edgeLines, hitMesh, ghostMesh,
            anim: prevAnim, sig
        });
    }
    await refreshLidPreview();
}

export async function refreshLidPreview() {
    if (!lidPreviewGroup) return;
    while (lidPreviewGroup.children.length > 0) {
        const c = lidPreviewGroup.children[0];
        lidPreviewGroup.remove(c);
        c.geometry.dispose();
        c.material.dispose();
    }
    if (!state.lid.preview || state.bins.length === 0) {
        lidPreviewGroup.visible = false;
        return;
    }
    await initManifold();
    const lidMani = buildTrayLidManifold(M, false);
    if (!lidMani) return;
    const raw = manifoldToThree(lidMani.getMesh());
    lidMani.delete();
    const flat = raw.toNonIndexed();
    raw.dispose();
    flat.computeVertexNormals();

    const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        roughness: 0.2
    }));
    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(flat, 24),
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
    );
    lidPreviewGroup.add(mesh, edges);
    lidPreviewGroup.position.z = 8.0; // Hover slightly above tray so user sees both
    lidPreviewGroup.visible = true;
}

export async function buildExportLidManifold() {
    await initManifold();
    return buildTrayLidManifold(M, true);
}

export async function buildExportDiffusersManifold() {
    await initManifold();
    return buildLedDiffusersManifold(M);
}

/**
 * Builds a single watertight merged Manifold for STL export (100% parity with viewport bins).
 */
export async function buildExportManifold() {
    if (state.bins.length === 0) return null;
    await initManifold();

    const parts = state.bins.map(bin => {
        const m = buildSingleBinManifold(bin);
        const placed = m.rotate([0, 0, bin.rot]).translate([bin.x, bin.y, 0]);
        m.delete();
        return placed;
    });

    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
        const n = acc.add(parts[i]);
        acc.delete();
        parts[i].delete();
        acc = n;
    }
    return acc;
}
