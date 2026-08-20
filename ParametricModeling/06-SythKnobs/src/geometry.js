// 3D Geometry calculations using Manifold WASM & Three.js
import { state } from './state.js';
import { THREE } from './viewport.js';

let Manifold = null;
let wasmModule = null;

export async function getManifold() {
  if (Manifold) return Manifold;
  const module = await import('https://unpkg.com/manifold-3d/manifold.js');
  wasmModule = await module.default();
  wasmModule.setup();
  Manifold = wasmModule.Manifold;
  return Manifold;
}

// ─── STAR / WAVE / POLYGON PROFILE EXTRUSION ────────────────────
function buildStarProfile(sides, outerR) {
  const innerR = outerR * 0.5;
  const pts = [];
  for (let i = 0; i < sides * 2; i++) {
    const angle = (i * Math.PI / sides) - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return pts;
}

function buildWaveProfile(outerR) {
  const lobes = 6;
  const amplitude = outerR * 0.35;
  const baseR = outerR - amplitude;
  const pts = [];
  const segments = 72;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const r = baseR + amplitude * Math.sin(lobes * angle);
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return pts;
}

export function manifoldToThreeMesh(model, colorHex, k) {
  if (!THREE) return null;
  const meshData = model.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertProperties, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.triVerts, 1));
  geometry.computeVertexNormals();
  
  let material;
  if (state.renderMode === 'rendered') {
    material = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.2,
        metalness: 0.8,
        side: THREE.DoubleSide
    });
  } else {
    material = new THREE.MeshBasicMaterial({
        color: 0x07294d,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  
  if (state.renderMode === 'blueprint') {
    const edges = new THREE.EdgesGeometry(geometry);
    const lineColor = (k && k.mountMode === 'slide') ? 0xffaa00 : 0x00f2ff;
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2 }));
    mesh.add(line);
  }
  
  return mesh;
}

export async function generateKnobManifold(k) {
  const M = await getManifold();
  
  const rimR = k.outerD / 2;
  const taperR = (k.outerD * k.taper) / 2;
  const discH = k.height;
  const texMode = k.texMode || 'flutes';
  const texDepth = k.texDepth || 3.0;
  const texScale = k.texScale || 3.0;
  const texCount = k.texCount || 8;
  const shaftType = k.shaftType || 'dshaft';
  
  // ── Build body based on profile type ──
  let body;
  
  if (k.star && wasmModule?.CrossSection) {
    const pts = buildStarProfile(k.sides, rimR);
    try {
      const cs = new wasmModule.CrossSection([pts]);
      const taperScale = taperR / rimR;
      body = Manifold.extrude(cs, discH, 0, 0, [taperScale, taperScale]);
      body = body.translate([0, 0, -discH / 2]);
      cs.delete();
    } catch (e) {
      console.warn('CrossSection extrude failed for star, falling back to cylinder:', e);
      body = M.cylinder(discH, rimR, taperR, k.sides * 2, true);
    }
  } else if (k.wave && wasmModule?.CrossSection) {
    const pts = buildWaveProfile(rimR);
    try {
      const cs = new wasmModule.CrossSection([pts]);
      const taperScale = taperR / rimR;
      body = Manifold.extrude(cs, discH, 0, 0, [taperScale, taperScale]);
      body = body.translate([0, 0, -discH / 2]);
      cs.delete();
    } catch (e) {
      console.warn('CrossSection extrude failed for wave, falling back to cylinder:', e);
      body = M.cylinder(discH, rimR, taperR, 36, true);
    }
  } else {
    body = M.cylinder(discH, rimR, taperR, k.sides, true);
  }
  
  // ── Bore (defined here, subtracted at the end) ──
  const activeSlotH = (texMode === 'vrings') ? Math.max(k.slotH, discH / 2 + 1.0) : k.slotH;
  let boreR = (k.boreD / 2) + k.clearance;
  let bore = M.cylinder(activeSlotH + 0.2, boreR, boreR, 64, true);
  
  if (shaftType === 'dshaft') {
    const flatDepth = (k.boreD === 6.0 && k.clearance === 0.15) ? 1.1 : 1.0;
    const flatBoxW = boreR * 2.5;
    const flatBoxH = boreR * 2.5;
    const flatBoxD = activeSlotH + 0.5;
    let flatBox = M.cube([flatBoxW, flatBoxH, flatBoxD], true)
                   .translate([0, boreR - flatDepth + flatBoxH/2, 0]);
    let newBore = bore.subtract(flatBox);
    bore.delete(); flatBox.delete();
    bore = newBore;
  } else if (shaftType === 'knurled') {
    const numSplines = 18;
    const splineW = 0.5;
    const splineH = 0.4;
    const splineLength = activeSlotH + 0.4;
    let splineUnion = null;
    for (let i = 0; i < numSplines; i++) {
      const angle = i * 360 / numSplines;
      let tooth = M.cube([splineW, splineH, splineLength], true)
                   .translate([0, boreR - splineH/3, 0])
                   .rotate([0, 0, angle]);
      if (!splineUnion) splineUnion = tooth;
      else {
        let temp = splineUnion.add(tooth);
        splineUnion.delete(); tooth.delete();
        splineUnion = temp;
      }
    }
    if (splineUnion) {
      let newBore = bore.add(splineUnion);
      bore.delete(); splineUnion.delete();
      bore = newBore;
    }
  }
  
  bore = bore.translate([0, 0, -discH/2 + (activeSlotH+0.2)/2 - 0.1]);
  
  // ── Textures ──
  const effectiveR = rimR;
  if (texMode !== 'smooth') {
    let textureCutter = null;
    
    if (texMode === 'flutes') {
      const fluteR = texScale / 2;
      const avgR = (effectiveR + taperR) / 2;
      const cx = Math.max(boreR + fluteR + 1.0, Math.max(avgR - fluteR + 0.3, avgR - texDepth + fluteR));
      for (let i = 0; i < texCount; i++) {
        const angle = i * 360 / texCount;
        let g = M.cylinder(discH * 1.4, fluteR, fluteR, 16, true)
                .translate([cx, 0, 0])
                .rotate([0, 0, angle]);
        if (!textureCutter) textureCutter = g;
        else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'twist') {
      const fluteR = texScale / 2;
      const avgR = (effectiveR + taperR) / 2;
      const cx = Math.max(boreR + fluteR + 1.0, Math.max(avgR - fluteR + 0.3, avgR - texDepth + fluteR));
      for (let i = 0; i < texCount; i++) {
        const angle = i * 360 / texCount;
        let g = M.cylinder(discH * 2.0, fluteR, fluteR, 16, true)
                .rotate([25, 0, 0]) // Tangential tilt (around X) instead of radial (around Y)
                .translate([cx, 0, 0])
                .rotate([0, 0, angle]);
        if (!textureCutter) textureCutter = g;
        else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'rings') {
      const ringCount = Math.max(2, texCount);
      const usableH = discH * 0.8;
      const spacing = usableH / (ringCount + 1);
      const ringThickness = Math.min(texScale * 0.6, spacing * 0.7);
      
      for (let i = 1; i <= ringCount; i++) {
        const zPos = -discH / 2 + discH * 0.1 + i * spacing;
        const t = (zPos + discH / 2) / discH;
        const localR = effectiveR * (1 - t) + taperR * t;
        const outerR = localR + 1.0;
        const innerR = Math.max(boreR + 1.0, localR - texDepth);

        let outer = M.cylinder(ringThickness, outerR, outerR, 64, true);
        let inner = M.cylinder(ringThickness + 0.1, innerR, innerR, 64, true);
        let ring = outer.subtract(inner);
        outer.delete(); inner.delete();
        ring = ring.translate([0, 0, zPos]);
        if (!textureCutter) textureCutter = ring;
        else { let n = textureCutter.add(ring); textureCutter.delete(); ring.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'vrings') {
      const ringCount = Math.max(2, texCount);
      const ringThickness = texScale * 0.5;
      const avgR = (effectiveR + taperR) / 2;
      
      for (let i = 0; i < ringCount; i++) {
        const angle = i * 180 / ringCount; // 180 because vertical ring wraps both sides
        const innerR = Math.max(boreR + 1.0, avgR - texDepth);
        
        let outer = M.cylinder(ringThickness, avgR + 1.0, avgR + 1.0, 64, true).rotate([90, 0, 0]);
        let inner = M.cylinder(ringThickness + 0.1, innerR, innerR, 64, true).rotate([90, 0, 0]);
        let ring = outer.subtract(inner);
        outer.delete(); inner.delete();
        
        let rotatedRing = ring.rotate([0, 0, angle]);
        ring.delete();
        
        if (!textureCutter) textureCutter = rotatedRing;
        else { let n = textureCutter.add(rotatedRing); textureCutter.delete(); rotatedRing.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'knurl') {
      const knurlR = texScale / 3;
      const numAxial = Math.max(4, texCount);
      
      for (let set = 0; set < 2; set++) {
        const tiltAngle = set === 0 ? 35 : -35;
        for (let i = 0; i < numAxial; i++) {
          const angle = i * 360 / numAxial;
          const cx = effectiveR - texDepth * 0.6 + knurlR;
          let g = M.cylinder(discH * 2.0, knurlR, knurlR, 8, true)
                  .rotate([tiltAngle, 0, 0])
                  .translate([cx, 0, 0])
                  .rotate([0, 0, angle]);
          if (!textureCutter) textureCutter = g;
          else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
        }
      }
    }
    
    else if (texMode === 'scallops') {
      const sRadius = texScale / 1.5;
      const numRings = Math.max(1, Math.floor(discH / (sRadius * 2.5)));
      const vertSpacing = discH / (numRings + 1);
      
      for (let ring = 0; ring < numRings; ring++) {
        const zPos = -discH / 2 + vertSpacing * (ring + 1);
        const countInRing = texCount;
        const ringOffset = ring % 2 === 0 ? 0 : (360 / countInRing / 2);
        
        const t = (zPos + discH / 2) / discH;
        const localR = effectiveR * (1 - t) + taperR * t;
        const cx = Math.max(boreR + sRadius + 1.0, Math.max(localR - sRadius + 0.3, localR - texDepth + sRadius));

        for (let i = 0; i < countInRing; i++) {
          const angle = i * 360 / countInRing + ringOffset;
          let g = M.sphere(sRadius, 12)
                  .translate([cx, 0, zPos])
                  .rotate([0, 0, angle]);
          if (!textureCutter) textureCutter = g;
          else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
        }
      }
    }
    
    else if (texMode === 'bumps') {
      const sRadius = texScale / 1.5;
      const numRings = Math.max(1, Math.floor(discH / (sRadius * 2.5)));
      const vertSpacing = discH / (numRings + 1);
      
      for (let ring = 0; ring < numRings; ring++) {
        const zPos = -discH / 2 + vertSpacing * (ring + 1);
        const countInRing = texCount;
        const ringOffset = ring % 2 === 0 ? 0 : (360 / countInRing / 2);
        
        const t = (zPos + discH / 2) / discH;
        const localR = effectiveR * (1 - t) + taperR * t;
        const cx = localR - sRadius * 0.4;

        for (let i = 0; i < countInRing; i++) {
          const angle = i * 360 / countInRing + ringOffset;
          let g = M.sphere(sRadius, 12)
                  .translate([cx, 0, zPos])
                  .rotate([0, 0, angle]);
          if (!textureCutter) textureCutter = g;
          else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
        }
      }
    }
    
    if (textureCutter) {
      let n;
      if (texMode === 'bumps') {
        n = body.add(textureCutter);
      } else {
        n = body.subtract(textureCutter);
      }
      body.delete(); textureCutter.delete();
      body = n;
    }
  }
  
  // ── Set-Screw Hole ──
  if (k.mountMode === 'slide' && k.setScrew !== 'none') {
    let screwD = 3.0;
    if (k.setScrew === 'm2') screwD = 2.0;
    else if (k.setScrew === 'm4') screwD = 4.0;
    
    const screwR = screwD / 2;
    const screwL = rimR * 2;
    
    const zScrew = -discH/2 + k.slotH / 2;
    let screw = M.cylinder(screwL, screwR, screwR, 32, true)
                 .rotate([90, 0, 0])
                 .translate([0, rimR - 0.1, zScrew]);
    
    let temp = body.subtract(screw);
    body.delete(); screw.delete();
    body = temp;
  }
  // ── Create solid shaft sleeve (bridges bottom and inner ball/caps for printing) ──
  const sleeveR = boreR + 1.5;
  let sleeve = M.cylinder(activeSlotH, sleeveR, sleeveR, 64, true)
                .translate([0, 0, -discH/2 + activeSlotH/2]);
  
  let bodyWithSleeve = body.add(sleeve);
  body.delete(); sleeve.delete();
  body = bodyWithSleeve;

  // ── Subtract Bore (deferred to cut through sleeve/textures/inner ball) ──
  let tempBody = body.subtract(bore);
  body.delete(); bore.delete();
  body = tempBody;
  
  return body;
}
