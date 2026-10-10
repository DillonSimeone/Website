/**
 * Apex Parasite - Procedural Sector & Dungeon Generator
 * Generates thematic sectors reacting to Depravity Score (Fauna Wilds, Town Outpost, Crucible Facility).
 */

import { GLYPHS, HOST_TYPES, ECS_COMPONENTS, RARITY, ELEMENTAL_AFFINITY } from './types.js';
import { GridAnatomy, generateProceduralOrgan } from './organs.js';

export class SectorMap {
  constructor(cols = 60, rows = 35) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Uint8Array(cols * rows); // GLYPHS.WALL or GLYPHS.FLOOR
    this.explored = new Uint8Array(cols * rows);
    this.visible = new Uint8Array(cols * rows);
    this.rooms = [];
    this.stairsX = 0;
    this.stairsY = 0;
    this.startX = 0;
    this.startY = 0;
  }

  getTile(x, y) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return GLYPHS.WALL;
    return this.tiles[y * this.cols + x];
  }

  setTile(x, y, glyph) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    this.tiles[y * this.cols + x] = glyph;
  }

  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    return tile === GLYPHS.FLOOR || tile === GLYPHS.DOOR_OPEN || tile === GLYPHS.STAIRS_DOWN;
  }

  /**
   * Generates a new sector based on current Depravity / Threat level.
   */
  generate(threatScore = 0) {
    this.tiles.fill(GLYPHS.WALL);
    this.explored.fill(1); // Full fog/visibility for crisp tactical view
    this.visible.fill(1);
    this.rooms = [];

    const roomCount = 7 + Math.floor(Math.random() * 4);
    for (let r = 0; r < roomCount; r++) {
      const rw = 5 + Math.floor(Math.random() * 7);
      const rh = 4 + Math.floor(Math.random() * 5);
      const rx = 1 + Math.floor(Math.random() * (this.cols - rw - 2));
      const ry = 1 + Math.floor(Math.random() * (this.rows - rh - 2));

      const newRoom = { x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };

      // Carve room
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          this.setTile(x, y, GLYPHS.FLOOR);
        }
      }

      // Connect to previous room with L-corridor
      if (this.rooms.length > 0) {
        const prev = this.rooms[this.rooms.length - 1];
        this.carveCorridor(prev.cx, prev.cy, newRoom.cx, newRoom.cy);
      }

      this.rooms.push(newRoom);
    }

    // Player starting position in first room
    this.startX = this.rooms[0].cx;
    this.startY = this.rooms[0].cy;

    // Stairs down in last room
    const lastRoom = this.rooms[this.rooms.length - 1];
    this.stairsX = lastRoom.cx;
    this.stairsY = lastRoom.cy;
    this.setTile(this.stairsX, this.stairsY, GLYPHS.STAIRS_DOWN);
  }

  carveCorridor(x1, y1, x2, y2) {
    let x = x1;
    let y = y1;

    // Horizontal then vertical
    while (x !== x2) {
      this.setTile(x, y, GLYPHS.FLOOR);
      x += (x2 > x) ? 1 : -1;
    }
    while (y !== y2) {
      this.setTile(x, y, GLYPHS.FLOOR);
      y += (y2 > y) ? 1 : -1;
    }
    this.setTile(x2, y2, GLYPHS.FLOOR);
  }

  /**
   * Spawns entities in rooms according to depravity threat level.
   */
  spawnSectorEntities(world, threatScore = 0) {
    // Rooms 1 to N-1
    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const spawnsInRoom = 1 + (Math.random() < 0.6 ? 1 : 0);

      for (let s = 0; s < spawnsInRoom; s++) {
        const sx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
        const sy = room.y + 1 + Math.floor(Math.random() * (room.h - 2));

        if (sx === this.stairsX && sy === this.stairsY) continue;

        this.spawnEnemyAt(world, sx, sy, threatScore);
      }
    }
  }

  spawnEnemyAt(world, x, y, threatScore) {
    const entityId = world.createEntity();
    if (entityId === -1) return;

    world.addComponent(entityId, ECS_COMPONENTS.POSITION);
    world.addComponent(entityId, ECS_COMPONENTS.RENDER);
    world.addComponent(entityId, ECS_COMPONENTS.STATS);
    world.addComponent(entityId, ECS_COMPONENTS.AI_CONTROLLER);
    world.addComponent(entityId, ECS_COMPONENTS.HOST_CHASSIS);
    world.addComponent(entityId, ECS_COMPONENTS.STATUS_EFFECTS);
    world.addComponent(entityId, ECS_COMPONENTS.ANATOMY);

    world.posX[entityId] = x;
    world.posY[entityId] = y;
    world.layer[entityId] = 2; // Creature layer

    const anatomy = new GridAnatomy();

    // Entity archetypes based on threat
    if (threatScore < 30) {
      // Low threat: Feral fauna
      if (Math.random() < 0.5) {
        world.names[entityId] = 'Crypt Vole';
        world.glyph[entityId] = GLYPHS.FAUNA_VOLE;
        world.fgR[entityId] = 0.8; world.fgG[entityId] = 0.6; world.fgB[entityId] = 0.4; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 18;
        world.maxHp[entityId] = 18;
        world.hostType[entityId] = HOST_TYPES.FAUNA;
        world.hostTier[entityId] = 1;
        world.threatYield[entityId] = 2;

        anatomy.equip('arm_left', generateProceduralOrgan({ region: 'arm_left', tier: 1 }));
      } else {
        world.names[entityId] = 'Cave Leech';
        world.glyph[entityId] = GLYPHS.FAUNA_LEECH;
        world.fgR[entityId] = 0.85; world.fgG[entityId] = 0.25; world.fgB[entityId] = 0.4; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 24;
        world.maxHp[entityId] = 24;
        world.hostType[entityId] = HOST_TYPES.FAUNA;
        world.hostTier[entityId] = 1;
        world.threatYield[entityId] = 3;

        anatomy.equip('head', generateProceduralOrgan({ region: 'head', tier: 1 }));
      }
    } else if (threatScore < 80) {
      // Mid threat: Humanoid scavengers / Town Watch
      if (Math.random() < 0.6) {
        world.names[entityId] = 'Frontier Forager';
        world.glyph[entityId] = GLYPHS.HUMAN_FORAGER;
        world.fgR[entityId] = 0.3; world.fgG[entityId] = 0.9; world.fgB[entityId] = 0.5; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 35;
        world.maxHp[entityId] = 35;
        world.hostType[entityId] = HOST_TYPES.HUMANOID;
        world.hostTier[entityId] = 2;
        world.threatYield[entityId] = 12;

        anatomy.equip('arm_left', generateProceduralOrgan({ region: 'arm_left', tier: 2, rarity: RARITY.RARE }));
        anatomy.equip('torso', generateProceduralOrgan({ region: 'torso', tier: 2 }));
      } else {
        world.names[entityId] = 'Town Watch';
        world.glyph[entityId] = GLYPHS.HUMAN_WATCH;
        world.fgR[entityId] = 0.2; world.fgG[entityId] = 0.7; world.fgB[entityId] = 1.0; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 50;
        world.maxHp[entityId] = 50;
        world.hostType[entityId] = HOST_TYPES.HUMANOID;
        world.hostTier[entityId] = 2;
        world.threatYield[entityId] = 18;

        anatomy.equip('arm_left', generateProceduralOrgan({ region: 'arm_left', tier: 2 }));
        anatomy.equip('dorsal', generateProceduralOrgan({ region: 'dorsal', tier: 2 }));
      }
    } else {
      // High threat: Specialized Hunters
      if (Math.random() < 0.5) {
        world.names[entityId] = 'Crucible Purger';
        world.glyph[entityId] = GLYPHS.HUNTER_PURGER;
        world.fgR[entityId] = 1.0; world.fgG[entityId] = 0.3; world.fgB[entityId] = 0.1; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 75;
        world.maxHp[entityId] = 75;
        world.hostType[entityId] = HOST_TYPES.HUNTER;
        world.hostTier[entityId] = 3;
        world.threatYield[entityId] = 25;

        anatomy.equip('arm_left', generateProceduralOrgan({ region: 'arm_left', tier: 3, element: ELEMENTAL_AFFINITY.FIRE, rarity: RARITY.EPIC }));
        anatomy.equip('head', generateProceduralOrgan({ region: 'head', tier: 3 }));
      } else {
        world.names[entityId] = 'Cryo Inquisitor';
        world.glyph[entityId] = GLYPHS.HUNTER_CRYO;
        world.fgR[entityId] = 0.1; world.fgG[entityId] = 0.9; world.fgB[entityId] = 1.0; world.fgA[entityId] = 1.0;
        world.hp[entityId] = 85;
        world.maxHp[entityId] = 85;
        world.hostType[entityId] = HOST_TYPES.HUNTER;
        world.hostTier[entityId] = 3;
        world.threatYield[entityId] = 30;

        anatomy.equip('arm_left', generateProceduralOrgan({ region: 'arm_left', tier: 3, element: ELEMENTAL_AFFINITY.FROST, rarity: RARITY.EPIC }));
        anatomy.equip('torso', generateProceduralOrgan({ region: 'torso', tier: 3, element: ELEMENTAL_AFFINITY.FROST }));
      }
    }

    world.anatomyMap[entityId] = anatomy;
  }
}
