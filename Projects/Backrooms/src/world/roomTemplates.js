import * as THREE from 'three';
import { Floor, SubFloor, Wall, Pillar, Ceiling, SubCeiling, WaterBlock, Fixture } from './subfloor.js';

/**
 * RoomTemplates: Procedural architectural generators producing surreal, anomalous
 * Backrooms environments. Each template creates a self-contained room with:
 * - Its own floor-to-ceiling envelope (no shared heights between rooms)
 * - Perimeter walls with connectivity openings (doorways/archways) to neighbors
 * - Anomalous dressing, props, and architectural non-sequiturs
 *
 * The Backrooms are NOT a uniform maze. They are liminal, uncanny, dream-logic
 * spaces where domestic/office architecture breaks down into surreal non-sequiturs.
 */
export class RoomTemplates {
  constructor() {
    this.initTemplateMaterials();
  }

  initTemplateMaterials() {
    this.stairMat = new THREE.MeshStandardMaterial({
      color: 0x4a3c2c,
      roughness: 0.8,
      metalness: 0.1
    });

    this.doorFrameMat = new THREE.MeshStandardMaterial({
      color: 0x2d241e,
      roughness: 0.6,
      metalness: 0.3
    });

    this.insulationMat = new THREE.MeshStandardMaterial({
      color: 0xe67e22,
      roughness: 0.95,
      metalness: 0.0
    });

    this.concreteMat = new THREE.MeshStandardMaterial({
      color: 0x5a5a58,
      roughness: 0.9,
      metalness: 0.15
    });

    this.rustyMat = new THREE.MeshStandardMaterial({
      color: 0x6b3a2a,
      roughness: 0.95,
      metalness: 0.35
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PERIMETER WALL BUILDER (shared by all templates)
  // Generates walls on the 4 cardinal edges with doorway cutouts
  // controlled by the connectivity map from WorldManager.
  // ─────────────────────────────────────────────────────────────

  generatePerimeterWalls(chunk, origin, biome, roomH, connectivity) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const wallMat = biome.getWallMaterial();

    // Doorway dimensions (centered on each wall edge)
    const doorWidth = 2;   // In grid cells
    const doorHeight = Math.min(roomH, 2.5); // Max doorway height
    const doorStart = Math.floor((W - doorWidth) / 2); // Grid cell where door starts
    const doorEnd = doorStart + doorWidth;

    // Wall thickness
    const thick = 0.25;

    // North wall (z = origin.z)
    this._buildWallEdge(chunk, origin, biome, wallMat, roomH,
      'north', connectivity.north, V, W, thick, doorStart, doorEnd, doorHeight);

    // South wall (z = origin.z + W*V)
    this._buildWallEdge(chunk, origin, biome, wallMat, roomH,
      'south', connectivity.south, V, W, thick, doorStart, doorEnd, doorHeight);

    // West wall (x = origin.x)
    this._buildWallEdge(chunk, origin, biome, wallMat, roomH,
      'west', connectivity.west, V, W, thick, doorStart, doorEnd, doorHeight);

    // East wall (x = origin.x + W*V)
    this._buildWallEdge(chunk, origin, biome, wallMat, roomH,
      'east', connectivity.east, V, W, thick, doorStart, doorEnd, doorHeight);
  }

  _buildWallEdge(chunk, origin, biome, wallMat, roomH, direction, hasOpening, V, W, thick, doorStart, doorEnd, doorHeight) {
    // For each cell along this wall, place a wall segment unless it's in the door zone.
    // Walls span from floor to ceiling for the full roomH.
    const isNS = (direction === 'north' || direction === 'south');
    const cellCount = W;

    for (let i = 0; i < cellCount; i++) {
      const isInDoorway = hasOpening && (i >= doorStart && i < doorEnd);

      let wx, wz;
      if (direction === 'north') {
        wx = origin.x + (i * V) + (V / 2);
        wz = origin.z;
      } else if (direction === 'south') {
        wx = origin.x + (i * V) + (V / 2);
        wz = origin.z + (W * V);
      } else if (direction === 'west') {
        wx = origin.x;
        wz = origin.z + (i * V) + (V / 2);
      } else { // east
        wx = origin.x + (W * V);
        wz = origin.z + (i * V) + (V / 2);
      }

      if (isInDoorway) {
        // Place wall only ABOVE the doorway (transom/lintel)
        if (roomH > doorHeight + 0.3) {
          const transomH = roomH - doorHeight;
          const transomGeo = isNS
            ? new THREE.BoxGeometry(V, transomH, thick)
            : new THREE.BoxGeometry(thick, transomH, V);
          const transomMesh = new THREE.Mesh(transomGeo, wallMat);
          transomMesh.position.set(wx, origin.y + doorHeight + (transomH / 2), wz);
          const transomObj = new Wall(transomMesh, {
            title: 'Doorway Transom Wall',
            hp: 28,
            drops: biome.getDropTable('wall')
          });
          transomMesh.userData.bbox = new THREE.Box3().setFromObject(transomMesh);
          chunk.group.add(transomMesh);
          chunk.objects.push(transomObj);
          chunk.collidables.push(transomMesh);
        }
      } else {
        // Full solid wall segment
        const wallGeo = isNS
          ? new THREE.BoxGeometry(V, roomH, thick)
          : new THREE.BoxGeometry(thick, roomH, V);
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(wx, origin.y + (roomH / 2), wz);
        const wallObj = new Wall(wallMesh, {
          title: 'Drywall Partition',
          hp: 28,
          drops: biome.getDropTable('wall')
        });
        wallMesh.userData.bbox = new THREE.Box3().setFromObject(wallMesh);
        chunk.group.add(wallMesh);
        chunk.objects.push(wallObj);
        chunk.collidables.push(wallMesh);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FLOOR / CEILING ENVELOPE BUILDER
  // Generates the horizontal surfaces for any room height.
  // ─────────────────────────────────────────────────────────────

  generateEnvelope(chunk, origin, biome, roomH, options = {}) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;

    const floorMat = biome.getFloorMaterial();
    const subFloorMat = biome.getSubFloorMaterial();
    const ceilMat = biome.getCeilingMaterial();
    const fixMat = biome.getFixtureMaterial();
    const lightConfig = biome.getLightingStyle();

    const floorGeo = new THREE.BoxGeometry(V, 0.1, V);
    const subFloorGeo = new THREE.BoxGeometry(V, 0.14, V);
    const ceilGeo = new THREE.BoxGeometry(V, 0.08, V);

    // Optional: skip certain floor tiles (for holes, gaps, etc.)
    const skipFloor = options.skipFloor || null; // Set<"gx,gz">
    const skipCeiling = options.skipCeiling || null;

    // Fixture frequency: how often lights appear in the ceiling grid
    const fixtureFreq = options.fixtureFreq || 3;

    for (let gx = 0; gx < W; gx++) {
      for (let gz = 0; gz < W; gz++) {
        const px = origin.x + (gx * V) + (V / 2);
        const pz = origin.z + (gz * V) + (V / 2);
        const cellKey = `${gx},${gz}`;

        // Floor
        if (!skipFloor || !skipFloor.has(cellKey)) {
          const fMesh = new THREE.Mesh(floorGeo, floorMat);
          fMesh.position.set(px, origin.y, pz);
          const fObj = new Floor(fMesh, {
            title: `${biome.name} Floor`,
            drops: biome.getDropTable('floor')
          });
          chunk.group.add(fMesh);
          chunk.objects.push(fObj);

          // Subfloor
          const sfMesh = new THREE.Mesh(subFloorGeo, subFloorMat);
          sfMesh.position.set(px, origin.y - 0.12, pz);
          const sfObj = new SubFloor(sfMesh, {
            title: `${biome.name} Sub-Floor`,
            drops: biome.getDropTable('subfloor')
          });
          chunk.group.add(sfMesh);
          chunk.objects.push(sfObj);
        }

        // Ceiling
        if (!skipCeiling || !skipCeiling.has(cellKey)) {
          const isFixture = (gx % fixtureFreq === 1 && gz % fixtureFreq === 1);
          if (isFixture) {
            const fixMesh = new THREE.Mesh(ceilGeo, fixMat);
            fixMesh.position.set(px, origin.y + roomH, pz);

            const pLight = new THREE.PointLight(
              lightConfig.color, lightConfig.intensity,
              lightConfig.distance, lightConfig.decay
            );
            pLight.position.set(px, origin.y + roomH - 0.25, pz);
            chunk.group.add(pLight);

            const fixObj = new Fixture(fixMesh, pLight, {
              title: `${biome.name} Luminaire`,
              drops: biome.getDropTable('fixture')
            });
            chunk.group.add(fixMesh);
            chunk.objects.push(fixObj);
            chunk.lights.push(fixObj);
          } else {
            const cMesh = new THREE.Mesh(ceilGeo, ceilMat);
            cMesh.position.set(px, origin.y + roomH, pz);
            const cObj = new Ceiling(cMesh, {
              title: `${biome.name} Ceiling`,
              drops: biome.getDropTable('ceiling')
            });
            chunk.group.add(cMesh);
            chunk.objects.push(cObj);
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. STANDARD OFFICE ROOM (The Classic Backrooms)
  // 3.0m ceilings, damp carpet, yellow wallpaper, fluorescent hum.
  // Some rooms have cubicle dividers, others are open corridors.
  // ─────────────────────────────────────────────────────────────

  generateStandardRoom(chunk, origin, biome, propSpawner, roomH = 3.0) {
    this.generateEnvelope(chunk, origin, biome, roomH);
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const seed = chunk.pseudoRandom(chunk.cx * 17.3, chunk.cy * 11.7, chunk.cz * 23.9);

    // Variant: interior partitions (30% of standard rooms, never in spawn chunk)
    const isSpawnChunk = (chunk.cx === 0 && chunk.cy === 0 && chunk.cz === 0);
    if (seed < 0.30 && !isSpawnChunk) {
      // L-shaped partition cutting the room
      const partH = roomH * 0.85;
      const partLength = V * (2 + Math.floor(seed * 10) % 3);
      const wallMat = biome.getWallMaterial();

      // Horizontal partition
      const hGeo = new THREE.BoxGeometry(partLength, partH, 0.15);
      const hMesh = new THREE.Mesh(hGeo, wallMat);
      const pX = origin.x + V * 3;
      const pZ = origin.z + V * 4;
      hMesh.position.set(pX, origin.y + partH / 2, pZ);
      const hObj = new Wall(hMesh, { title: 'Office Divider Wall', hp: 22, drops: biome.getDropTable('wall') });
      hMesh.userData.bbox = new THREE.Box3().setFromObject(hMesh);
      chunk.group.add(hMesh);
      chunk.objects.push(hObj);
      chunk.collidables.push(hMesh);

      // Perpendicular stub
      const vGeo = new THREE.BoxGeometry(0.15, partH, V * 2);
      const vMesh = new THREE.Mesh(vGeo, wallMat);
      vMesh.position.set(pX + partLength / 2, origin.y + partH / 2, pZ + V);
      const vObj = new Wall(vMesh, { title: 'Office Divider Wall', hp: 22, drops: biome.getDropTable('wall') });
      vMesh.userData.bbox = new THREE.Box3().setFromObject(vMesh);
      chunk.group.add(vMesh);
      chunk.objects.push(vObj);
      chunk.collidables.push(vMesh);
    }

    // Scattered chairs (20% chance each quadrant)
    const quadrants = [
      { gx: 2, gz: 2 }, { gx: 5, gz: 2 },
      { gx: 2, gz: 5 }, { gx: 5, gz: 5 }
    ];
    for (const q of quadrants) {
      const cSeed = chunk.pseudoRandom(chunk.cx * 7 + q.gx, chunk.cy * 13, chunk.cz * 9 + q.gz);
      if (cSeed < 0.20) {
        const mutations = ['normal', 'normal', 'spiral_stack', 'oversized'];
        const mut = mutations[Math.floor(cSeed * 100) % mutations.length];
        const { group: cG, prop: cP } = propSpawner.spawnChair(
          origin.x + q.gx * V, origin.y, origin.z + q.gz * V, mut
        );
        chunk.group.add(cG);
        chunk.objects.push(cP);
      }
    }

    // Framed paintings on perimeter walls (35% chance)
    if (seed > 0.35) {
      const pX = origin.x + V * 2.5;
      const pZ = origin.z + 0.15;
      const { group: paintG, prop: paintP } = propSpawner.spawnPainting(pX, origin.y + 1.6, pZ, 0);
      chunk.group.add(paintG);
      chunk.objects.push(paintP);
    }

    // Out-of-context domestic sink (20% chance)
    if (seed > 0.75) {
      const sX = origin.x + W * V - 0.25;
      const sZ = origin.z + V * 4;
      const { group: sinkG, prop: sinkP } = propSpawner.spawnSink(sX, origin.y + 0.95, sZ, -Math.PI / 2);
      chunk.group.add(sinkG);
      chunk.objects.push(sinkP);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CATHEDRAL VOID (16m)
  // Massive cavernous chamber. The ceiling is impossibly far above.
  // Suspended troffers hang on long wire drops. Impossible ledges
  // jut from walls at random heights. The floor may have gaps
  // revealing structural sub-floor beams.
  // ─────────────────────────────────────────────────────────────

  generateCathedralVoid(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 16.0;

    // Floor gaps: remove some floor tiles to expose sub-floor darkness
    const skipFloor = new Set();
    const gapSeed = chunk.pseudoRandom(chunk.cx * 43.1, chunk.cy * 11.0, chunk.cz * 67.3);
    if (gapSeed > 0.5) {
      // Diagonal floor gap
      for (let i = 0; i < W; i++) {
        const gz = (i + Math.floor(gapSeed * 3)) % W;
        skipFloor.add(`${i},${gz}`);
      }
    }

    this.generateEnvelope(chunk, origin, biome, roomH, {
      skipFloor,
      fixtureFreq: 4 // Fewer fixtures, more darkness
    });
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    // Suspended Troffers on hanging wire drops from 16m ceiling
    const hangHeights = [3.5, 7.0, 11.0];
    hangHeights.forEach((hY, idx) => {
      const tX = origin.x + ((2 + idx * 2) % W) * V + V / 2;
      const tZ = origin.z + ((3 + idx * 2) % W) * V + V / 2;
      const { group: tGroup, fixtureObj } = propSpawner.spawnSuspendedTroffer(
        tX, origin.y + roomH, origin.y + hY,
        biome.getLightingStyle()
      );
      chunk.group.add(tGroup);
      chunk.objects.push(fixtureObj);
      chunk.lights.push(fixtureObj);
    });

    // Impossible Ledge Overhang at random height on East wall
    const ledgeY = 4.0 + gapSeed * 5.0;
    const ledgeGeo = new THREE.BoxGeometry(V * 2.5, 0.2, V * 2);
    const ledgeMesh = new THREE.Mesh(ledgeGeo, biome.getFloorMaterial());
    ledgeMesh.position.set(
      origin.x + (W * V) - (V * 1.5),
      origin.y + ledgeY,
      origin.z + (W * V / 2)
    );
    const ledgeObj = new Floor(ledgeMesh, {
      title: 'Impossible Overhang Ledge',
      hp: 30,
      drops: biome.getDropTable('floor')
    });
    chunk.group.add(ledgeMesh);
    chunk.objects.push(ledgeObj);

    // Anomaly: Inverted chair hanging from 16m ceiling
    const { group: chairG, prop: chairP } = propSpawner.spawnChair(
      origin.x + 4 * V, origin.y + roomH - 0.5, origin.z + 4 * V, 'ceiling_inverted'
    );
    chunk.group.add(chairG);
    chunk.objects.push(chairP);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. VAULTED HALL (10m)
  // Tall institutional hallway. Think abandoned mall food court or
  // airport terminal — unnervingly spacious but still enclosed.
  // ─────────────────────────────────────────────────────────────

  generateVaultedHall(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 10.0;

    this.generateEnvelope(chunk, origin, biome, roomH, { fixtureFreq: 3 });
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    // Central support column (large, reinforced)
    const colGeo = new THREE.BoxGeometry(1.2, roomH, 1.2);
    const colMesh = new THREE.Mesh(colGeo, this.concreteMat);
    colMesh.position.set(
      origin.x + (W * V / 2),
      origin.y + roomH / 2,
      origin.z + (W * V / 2)
    );
    const colObj = new Pillar(colMesh, {
      title: 'Reinforced Concrete Column',
      hp: 65,
      drops: biome.getDropTable('wall')
    });
    colMesh.userData.bbox = new THREE.Box3().setFromObject(colMesh);
    chunk.group.add(colMesh);
    chunk.objects.push(colObj);
    chunk.collidables.push(colMesh);

    // Mezzanine platform at mid-height on one side
    const seed = chunk.pseudoRandom(chunk.cx * 31.7, chunk.cy * 8.1, chunk.cz * 55.3);
    if (seed > 0.35) {
      const mezzH = 0.15;
      const mezzY = origin.y + 4.5;
      const mezzGeo = new THREE.BoxGeometry(V * 3, mezzH, V * W);
      const mezzMesh = new THREE.Mesh(mezzGeo, biome.getFloorMaterial());
      mezzMesh.position.set(origin.x + V * 1.5, mezzY, origin.z + (W * V / 2));
      const mezzObj = new Floor(mezzMesh, {
        title: 'Mezzanine Observation Platform',
        hp: 35,
        drops: biome.getDropTable('floor')
      });
      chunk.group.add(mezzMesh);
      chunk.objects.push(mezzObj);

      // Railing
      const railGeo = new THREE.BoxGeometry(V * 3, 1.1, 0.08);
      const railMesh = new THREE.Mesh(railGeo, this.rustyMat);
      railMesh.position.set(origin.x + V * 1.5, mezzY + 0.55, origin.z + (W * V / 2) + (V * W / 2) - 0.1);
      chunk.group.add(railMesh);
    }

    // Suspended troffer at medium height
    const { group: tG, fixtureObj: tF } = propSpawner.spawnSuspendedTroffer(
      origin.x + W * V / 2, origin.y + roomH, origin.y + 6.0,
      biome.getLightingStyle()
    );
    chunk.group.add(tG);
    chunk.objects.push(tF);
    chunk.lights.push(tF);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. STAIRS TO DRYWALL
  // A staircase climbs optimistically upward... and terminates
  // flush against solid drywall. A door frame embedded in the wall
  // leads only to pink fiberglass insulation. Dead-end exit sign.
  // ─────────────────────────────────────────────────────────────

  generateStairsToDrywall(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 4.0;

    this.generateEnvelope(chunk, origin, biome, roomH);
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    // Procedural Staircase (7 steps)
    const stepsCount = 7;
    const stepDepth = 0.5;
    const stepRise = 0.35;
    const stairWidth = 1.6;

    const startX = origin.x + (W * V / 2) - (stairWidth / 2);
    const startZ = origin.z + 2.0;

    for (let s = 0; s < stepsCount; s++) {
      const stepH = (s + 1) * stepRise;
      const stepGeo = new THREE.BoxGeometry(stairWidth, stepH, stepDepth);
      const stepMesh = new THREE.Mesh(stepGeo, this.stairMat);
      stepMesh.position.set(
        startX + (stairWidth / 2),
        origin.y + (stepH / 2),
        startZ + (s * stepDepth)
      );

      const stepObj = new Floor(stepMesh, {
        title: `Drywall Stair Tread #${s + 1}`,
        hp: 25,
        drops: { wood: 3, scrap: 1 }
      });
      stepMesh.userData.bbox = new THREE.Box3().setFromObject(stepMesh);
      chunk.group.add(stepMesh);
      chunk.objects.push(stepObj);
      chunk.collidables.push(stepMesh);
    }

    // Flush Terminal Wall at the head of the stairs
    const termZ = startZ + (stepsCount * stepDepth) + 0.1;
    const flushWallGeo = new THREE.BoxGeometry(stairWidth + 0.6, roomH, 0.25);
    const flushWallMesh = new THREE.Mesh(flushWallGeo, biome.getWallMaterial());
    flushWallMesh.position.set(startX + (stairWidth / 2), origin.y + (roomH / 2), termZ);

    const flushWallObj = new Wall(flushWallMesh, {
      title: 'Dead-End Abutment Wall',
      hp: 40,
      drops: biome.getDropTable('wall')
    });
    flushWallMesh.userData.bbox = new THREE.Box3().setFromObject(flushWallMesh);
    chunk.group.add(flushWallMesh);
    chunk.objects.push(flushWallObj);
    chunk.collidables.push(flushWallMesh);

    // Door Frame embedded in the flush wall with raw insulation behind it
    const frameGeo = new THREE.BoxGeometry(1.1, 2.1, 0.08);
    const frameMesh = new THREE.Mesh(frameGeo, this.doorFrameMat);
    frameMesh.position.set(
      startX + (stairWidth / 2),
      origin.y + (stepsCount * stepRise) + 1.05,
      termZ - 0.1
    );
    chunk.group.add(frameMesh);

    // Insulation block behind door frame
    const insGeo = new THREE.BoxGeometry(0.9, 1.9, 0.15);
    const insMesh = new THREE.Mesh(insGeo, this.insulationMat);
    insMesh.position.set(
      startX + (stairWidth / 2),
      origin.y + (stepsCount * stepRise) + 1.05,
      termZ + 0.15
    );
    chunk.group.add(insMesh);

    // Dead-end exit sign
    const { group: exitG, prop: exitP } = propSpawner.spawnExitSign(
      startX + (stairWidth / 2),
      origin.y + (stepsCount * stepRise) + 2.3,
      termZ - 0.15
    );
    chunk.group.add(exitG);
    chunk.objects.push(exitP);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. ISOLATED STRUCTURE
  // A freestanding domestic shack/cubicle floating inside a large
  // open chamber. Like finding a suburban house facade inside an
  // airport hangar. Contains sink, chairs, a window looking at
  // yellow wallpaper.
  // ─────────────────────────────────────────────────────────────

  generateIsolatedStructure(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 7.0;

    this.generateEnvelope(chunk, origin, biome, roomH, { fixtureFreq: 4 });
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    // Freestanding Domestic Cubicle in center of room
    const structW = 4.2;
    const structH = 2.8;
    const structD = 4.2;
    const cx = origin.x + (W * V / 2);
    const cz = origin.z + (W * V / 2);

    const sWallMat = biome.getWallMaterial();
    const wallThick = 0.2;

    // North wall
    const nwMesh = new THREE.Mesh(new THREE.BoxGeometry(structW, structH, wallThick), sWallMat);
    nwMesh.position.set(cx, origin.y + (structH / 2), cz - (structD / 2));
    const nwObj = new Wall(nwMesh, { title: 'Isolated Facade Wall', hp: 35, drops: { wood: 4, drywall: 3 } });
    nwMesh.userData.bbox = new THREE.Box3().setFromObject(nwMesh);
    chunk.group.add(nwMesh);
    chunk.objects.push(nwObj);
    chunk.collidables.push(nwMesh);

    // East wall
    const ewMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, structH, structD), sWallMat);
    ewMesh.position.set(cx + (structW / 2), origin.y + (structH / 2), cz);
    const ewObj = new Wall(ewMesh, { title: 'Isolated Facade Wall', hp: 35, drops: { wood: 4, drywall: 3 } });
    ewMesh.userData.bbox = new THREE.Box3().setFromObject(ewMesh);
    chunk.group.add(ewMesh);
    chunk.objects.push(ewObj);
    chunk.collidables.push(ewMesh);

    // West wall
    const wwMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, structH, structD), sWallMat);
    wwMesh.position.set(cx - (structW / 2), origin.y + (structH / 2), cz);
    const wwObj = new Wall(wwMesh, { title: 'Isolated Facade Wall', hp: 30, drops: { wood: 3, drywall: 2 } });
    wwMesh.userData.bbox = new THREE.Box3().setFromObject(wwMesh);
    chunk.group.add(wwMesh);
    chunk.objects.push(wwObj);
    chunk.collidables.push(wwMesh);

    // South wall with doorway opening
    const swLeft = new THREE.Mesh(new THREE.BoxGeometry(1.5, structH, wallThick), sWallMat);
    swLeft.position.set(cx - 1.35, origin.y + (structH / 2), cz + (structD / 2));
    const swLeftObj = new Wall(swLeft, { title: 'Isolated Facade Wall', hp: 30, drops: { wood: 3, drywall: 2 } });
    swLeft.userData.bbox = new THREE.Box3().setFromObject(swLeft);
    chunk.group.add(swLeft);
    chunk.objects.push(swLeftObj);
    chunk.collidables.push(swLeft);

    const swRight = new THREE.Mesh(new THREE.BoxGeometry(1.5, structH, wallThick), sWallMat);
    swRight.position.set(cx + 1.35, origin.y + (structH / 2), cz + (structD / 2));
    const swRightObj = new Wall(swRight, { title: 'Isolated Facade Wall', hp: 30, drops: { wood: 3, drywall: 2 } });
    swRight.userData.bbox = new THREE.Box3().setFromObject(swRight);
    chunk.group.add(swRight);
    chunk.objects.push(swRightObj);
    chunk.collidables.push(swRight);

    // Roof over the isolated structure
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(structW, 0.15, structD), biome.getCeilingMaterial());
    roofMesh.position.set(cx, origin.y + structH, cz);
    const roofObj = new Ceiling(roofMesh, { title: 'Isolated Structure Roof', hp: 28, drops: { wood: 4, drywall: 2 } });
    chunk.group.add(roofMesh);
    chunk.objects.push(roofObj);

    // Inside the isolated structure: Sink & Spiral Stack Chair
    const { group: sinkG, prop: sinkP } = propSpawner.spawnSink(cx, origin.y + 0.85, cz - 1.7, 0);
    chunk.group.add(sinkG);
    chunk.objects.push(sinkP);

    const { group: chairG, prop: chairP } = propSpawner.spawnChair(cx, origin.y, cz, 'spiral_stack');
    chunk.group.add(chairG);
    chunk.objects.push(chairP);

    // Window on the outer chamber wall looking at nothing
    const { group: winG, prop: winP } = propSpawner.spawnWindow(
      origin.x + V, origin.y + 1.5, origin.z + W * V / 2, Math.PI / 2
    );
    chunk.group.add(winG);
    chunk.objects.push(winP);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. PILLAR FOREST
  // Dense, ergonomically absurd cluster of columns with irregular
  // spacing and varying thicknesses. Some columns are obviously
  // structural, others are purely decorative nonsense — like
  // someone keeps adding support columns to a room that doesn't
  // need them.
  // ─────────────────────────────────────────────────────────────

  generatePillarForest(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 3.5;

    this.generateEnvelope(chunk, origin, biome, roomH);
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    const wallMat = biome.getWallMaterial();

    // Dense irregular columns
    for (let gx = 1; gx < W - 1; gx++) {
      for (let gz = 1; gz < W - 1; gz++) {
        const pSeed = chunk.pseudoRandom(chunk.cx * 7 + gx * 3.7, chunk.cy, chunk.cz * 11 + gz * 5.3);
        if (pSeed < 0.32) {
          // Varying column sizes (some absurdly thick, some pencil-thin)
          const thickness = 0.3 + pSeed * 2.5;
          const pillarGeo = new THREE.BoxGeometry(thickness, roomH, thickness);
          const pillarMesh = new THREE.Mesh(pillarGeo, pSeed > 0.15 ? wallMat : this.concreteMat);
          pillarMesh.position.set(
            origin.x + (gx * V) + (V / 2) + (pSeed - 0.16) * 0.5,
            origin.y + (roomH / 2),
            origin.z + (gz * V) + (V / 2) + (pSeed - 0.16) * 0.3
          );

          const pillarObj = new Pillar(pillarMesh, {
            title: thickness > 1.5 ? 'Monolithic Concrete Pier' : 'Redundant Support Column',
            hp: 35 + thickness * 15,
            drops: biome.getDropTable('wall')
          });
          pillarMesh.userData.bbox = new THREE.Box3().setFromObject(pillarMesh);
          chunk.group.add(pillarMesh);
          chunk.objects.push(pillarObj);
          chunk.collidables.push(pillarMesh);
        }
      }
    }

    // Anomalous window embedded in middle of room
    const { group: winG, prop: winP } = propSpawner.spawnWindow(
      origin.x + 3 * V, origin.y + 1.2, origin.z + 3 * V, Math.PI / 4
    );
    chunk.group.add(winG);
    chunk.objects.push(winP);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. NARROW CREVICE / CLAUSTROPHOBIC CONDUIT (1.85m)
  // Extremely low clearance maintenance crawl. Must crouch.
  // Pipes and conduit run along the ceiling. Barely fits a person.
  // Some sections are partially flooded.
  // ─────────────────────────────────────────────────────────────

  generateNarrowCrevice(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 1.85;

    this.generateEnvelope(chunk, origin, biome, roomH, { fixtureFreq: 4 });
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    const wallMat = biome.getWallMaterial();

    // Tight winding barriers creating a maze-like conduit path
    const seed = chunk.pseudoRandom(chunk.cx * 19.1, chunk.cy * 7.3, chunk.cz * 41.7);
    const barrierAxis = seed > 0.5 ? 'x' : 'z';

    for (let i = 1; i < W - 1; i += 2) {
      // Alternate barrier orientation for winding path
      const gapPos = Math.floor(seed * (W - 2)) + 1;
      const isGap = (i === gapPos || i === gapPos + 1);
      if (isGap) continue;

      let barrierGeo, bx, bz;
      if (barrierAxis === 'z') {
        barrierGeo = new THREE.BoxGeometry(V, roomH, V * 3);
        bx = origin.x + (i * V) + (V / 2);
        bz = origin.z + (W * V / 2);
      } else {
        barrierGeo = new THREE.BoxGeometry(V * 3, roomH, V);
        bx = origin.x + (W * V / 2);
        bz = origin.z + (i * V) + (V / 2);
      }

      const barrierMesh = new THREE.Mesh(barrierGeo, wallMat);
      barrierMesh.position.set(bx, origin.y + (roomH / 2), bz);
      const barrierObj = new Wall(barrierMesh, {
        title: 'Claustrophobic Conduit Bulkhead',
        hp: 35,
        drops: biome.getDropTable('wall')
      });
      barrierMesh.userData.bbox = new THREE.Box3().setFromObject(barrierMesh);
      chunk.group.add(barrierMesh);
      chunk.objects.push(barrierObj);
      chunk.collidables.push(barrierMesh);
    }

    // Ceiling-mounted pipe conduit
    const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, W * V, 8);
    pipeGeo.rotateZ(Math.PI / 2);
    const pipeMesh = new THREE.Mesh(pipeGeo, this.rustyMat);
    pipeMesh.position.set(origin.x + W * V / 2, origin.y + roomH - 0.15, origin.z + V * 2);
    chunk.group.add(pipeMesh);

    // Wall-embedded chair
    const { group: cG, prop: cP } = propSpawner.spawnChair(
      origin.x + 2 * V, origin.y + 0.9, origin.z + 2 * V, 'wall_embedded'
    );
    chunk.group.add(cG);
    chunk.objects.push(cP);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. IMPOSSIBLE LEDGE ROOM (8m)
  // A medium-height room with platforms/ledges jutting from walls
  // at arbitrary heights. Stairs that don't connect to anything.
  // The spatial logic of this room makes no architectural sense.
  // ─────────────────────────────────────────────────────────────

  generateImpossibleLedge(chunk, origin, biome, propSpawner) {
    const V = chunk.voxelSize;
    const W = chunk.gridWidth;
    const roomH = 8.0;

    this.generateEnvelope(chunk, origin, biome, roomH, { fixtureFreq: 3 });
    this.generatePerimeterWalls(chunk, origin, biome, roomH, chunk.connectivity);

    const floorMat = biome.getFloorMaterial();
    const seed = chunk.pseudoRandom(chunk.cx * 29.3, chunk.cy * 5.7, chunk.cz * 71.1);

    // Multiple ledges at different heights
    const ledges = [
      { y: 2.0 + seed * 1.5, side: 'west', depth: 2, width: 3 },
      { y: 4.5 + seed * 1.0, side: 'east', depth: 2, width: 4 },
      { y: 6.0,              side: 'north', depth: 3, width: 2 }
    ];

    for (const l of ledges) {
      const ledgeGeo = new THREE.BoxGeometry(
        l.side === 'north' || l.side === 'south' ? V * l.width : V * l.depth,
        0.18,
        l.side === 'north' || l.side === 'south' ? V * l.depth : V * l.width
      );
      const ledgeMesh = new THREE.Mesh(ledgeGeo, floorMat);

      let lx, lz;
      if (l.side === 'west') {
        lx = origin.x + V * l.depth / 2;
        lz = origin.z + W * V / 2;
      } else if (l.side === 'east') {
        lx = origin.x + W * V - V * l.depth / 2;
        lz = origin.z + W * V / 2;
      } else {
        lx = origin.x + W * V / 2;
        lz = origin.z + V * l.depth / 2;
      }

      ledgeMesh.position.set(lx, origin.y + l.y, lz);
      const ledgeObj = new Floor(ledgeMesh, {
        title: 'Impossible Ledge Platform',
        hp: 28,
        drops: biome.getDropTable('floor')
      });
      chunk.group.add(ledgeMesh);
      chunk.objects.push(ledgeObj);
    }

    // Disconnected staircase fragment floating mid-room
    const stairBaseY = origin.y + 1.5 + seed * 2.0;
    for (let s = 0; s < 5; s++) {
      const stepGeo = new THREE.BoxGeometry(1.4, 0.25, 0.5);
      const stepMesh = new THREE.Mesh(stepGeo, this.stairMat);
      stepMesh.position.set(
        origin.x + W * V / 2,
        stairBaseY + s * 0.35,
        origin.z + 3 * V + s * 0.5
      );
      const stepObj = new Floor(stepMesh, {
        title: `Floating Stair Fragment #${s + 1}`,
        hp: 20,
        drops: { wood: 2, scrap: 1 }
      });
      stepMesh.userData.bbox = new THREE.Box3().setFromObject(stepMesh);
      chunk.group.add(stepMesh);
      chunk.objects.push(stepObj);
      chunk.collidables.push(stepMesh);
    }

    // Suspended troffer
    const { group: tG, fixtureObj: tF } = propSpawner.spawnSuspendedTroffer(
      origin.x + W * V / 2, origin.y + roomH, origin.y + 4.5,
      biome.getLightingStyle()
    );
    chunk.group.add(tG);
    chunk.objects.push(tF);
    chunk.lights.push(tF);
  }
}
