import * as THREE from 'three';
import { WorldObject, Fixture } from './subfloor.js';

/**
 * PropObject: Destructible prop derived from WorldObject.
 * Tied directly into the salvage economy with custom scrap tables.
 */
export class PropObject extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: options.type || 'prop',
      title: options.title || 'Anomalous Artifact',
      hp: options.hp ?? 24,
      hardness: options.hardness ?? 1.0,
      xp: options.xp ?? 12,
      drops: options.drops || { plastic: 2, scrap: 1 },
      isWall: options.isWall ?? false,
      isLight: options.isLight ?? false
    });
  }
}

/**
 * PropSpawner: Procedural factory creating mutated Backrooms dressing:
 * - Spiral-stacked or ceiling-inverted office chairs
 * - Out-of-context wall sinks with copper plumbing
 * - Suspended high-ceiling troffers with vertical wire drops
 * - Flickering dead-end exit signs
 * - Standalone domestic windows looking into yellow wallpaper
 */
export class PropSpawner {
  constructor() {
    this.initMaterials();
  }

  initMaterials() {
    this.plasticBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.6,
      metalness: 0.2
    });

    this.plasticOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xd35400,
      roughness: 0.5,
      metalness: 0.1
    });

    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.85
    });

    this.porcelainMat = new THREE.MeshStandardMaterial({
      color: 0xf5f8fa,
      roughness: 0.15,
      metalness: 0.2
    });

    this.copperPipeMat = new THREE.MeshStandardMaterial({
      color: 0xb87333,
      roughness: 0.35,
      metalness: 0.8
    });

    this.exitSignMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.3,
      emissive: 0x00ff66,
      emissiveIntensity: 0.95
    });

    this.windowFrameMat = new THREE.MeshStandardMaterial({
      color: 0x4a3b2c,
      roughness: 0.7,
      metalness: 0.1
    });

    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x88bbcc,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.55
    });

    this.paintingMat = this.createPaintingMaterial();
  }

  /**
   * Spawn an Office Chair with stochastic mutation:
   * mutations: 'normal', 'ceiling_inverted', 'wall_embedded', 'spiral_stack', 'oversized'
   */
  spawnChair(x, y, z, mutation = 'normal') {
    const chairGroup = new THREE.Group();

    // 1. Five-point Caster Base
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.06, 6);
    const baseMesh = new THREE.Mesh(baseGeo, this.plasticBlackMat);
    baseMesh.position.y = 0.08;
    chairGroup.add(baseMesh);

    // 2. Pneumatic Gas Piston Cylinder
    const pistonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8);
    const pistonMesh = new THREE.Mesh(pistonGeo, this.chromeMat);
    pistonMesh.position.y = 0.28;
    chairGroup.add(pistonMesh);

    // 3. Molded Seat Cushion
    const seatGeo = new THREE.BoxGeometry(0.55, 0.08, 0.52);
    const seatMesh = new THREE.Mesh(seatGeo, this.plasticOrangeMat);
    seatMesh.position.y = 0.48;
    chairGroup.add(seatMesh);

    // 4. Backrest
    const backGeo = new THREE.BoxGeometry(0.5, 0.55, 0.07);
    const backMesh = new THREE.Mesh(backGeo, this.plasticOrangeMat);
    backMesh.position.set(0, 0.8, -0.23);
    chairGroup.add(backMesh);

    chairGroup.position.set(x, y, z);

    // Apply Anomalous Mutation
    let title = 'Molded Office Chair';
    let drops = { plastic: 3, caster: 2, piston: 1 };
    let hp = 24;

    if (mutation === 'ceiling_inverted') {
      chairGroup.rotation.x = Math.PI;
      chairGroup.rotation.y = Math.random() * Math.PI;
      title = 'Ceiling-Anchored Inverted Chair';
      hp = 30;
    } else if (mutation === 'wall_embedded') {
      chairGroup.rotation.z = Math.PI / 2;
      chairGroup.position.x += 0.3;
      title = 'Drywall-Fused Chair';
      drops.scrap = 2;
    } else if (mutation === 'spiral_stack') {
      // Add a duplicate chair rotated on top
      const topChair = chairGroup.clone();
      topChair.position.set(0, 0.65, 0.1);
      topChair.rotation.y = Math.PI / 4;
      chairGroup.add(topChair);
      title = 'Impossible Spiral Chair Stack';
      hp = 48;
      drops.plastic = 6;
      drops.caster = 4;
      drops.piston = 2;
    } else if (mutation === 'oversized') {
      chairGroup.scale.set(2.2, 2.2, 2.2);
      title = 'Oversized Monolith Chair';
      hp = 60;
      drops.plastic = 7;
      drops.piston = 3;
    }

    const prop = new PropObject(chairGroup, {
      title,
      hp,
      xp: 15,
      drops
    });

    chairGroup.userData.bbox = new THREE.Box3().setFromObject(chairGroup);
    return { group: chairGroup, prop };
  }

  /**
   * Spawn a Standalone Porcelain Sink attached out-of-context to drywall
   */
  spawnSink(x, y, z, rotationY = 0) {
    const sinkGroup = new THREE.Group();

    // Basin
    const basinGeo = new THREE.BoxGeometry(0.65, 0.35, 0.48);
    const basinMesh = new THREE.Mesh(basinGeo, this.porcelainMat);
    sinkGroup.add(basinMesh);

    // Faucet Pipe
    const faucetGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8);
    const faucetMesh = new THREE.Mesh(faucetGeo, this.chromeMat);
    faucetMesh.position.set(0, 0.25, -0.15);
    sinkGroup.add(faucetMesh);

    // Hanging Copper Drain Trap below
    const pipeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8);
    const pipeMesh = new THREE.Mesh(pipeGeo, this.copperPipeMat);
    pipeMesh.position.set(0, -0.35, 0);
    sinkGroup.add(pipeMesh);

    sinkGroup.position.set(x, y, z);
    sinkGroup.rotation.y = rotationY;

    const prop = new PropObject(sinkGroup, {
      title: 'Displaced Domestic Sink',
      hp: 35,
      xp: 20,
      drops: { ceramic: 4, copper: 4, fitting: 2 }
    });

    sinkGroup.userData.bbox = new THREE.Box3().setFromObject(sinkGroup);
    return { group: sinkGroup, prop };
  }

  /**
   * Spawn a High-Ceiling Suspended Fluorescent Troffer on vertical wire drops
   */
  spawnSuspendedTroffer(x, ceilingY, hangY, lightConfig) {
    const fixtureGroup = new THREE.Group();

    // Troffer fixture body hanging at hangY
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.12, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0xffffee,
      emissiveIntensity: 0.95
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(x, hangY, 0);
    fixtureGroup.add(bodyMesh);

    // Two hanging steel conduit drop wires spanning from ceilingY down to hangY
    const wireLength = Math.max(0.5, ceilingY - hangY);
    const wireGeo = new THREE.CylinderGeometry(0.012, 0.012, wireLength, 6);
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });

    const wire1 = new THREE.Mesh(wireGeo, wireMat);
    wire1.position.set(x - 0.65, hangY + (wireLength / 2), 0);
    fixtureGroup.add(wire1);

    const wire2 = new THREE.Mesh(wireGeo, wireMat);
    wire2.position.set(x + 0.65, hangY + (wireLength / 2), 0);
    fixtureGroup.add(wire2);

    // Localized PointLight
    const pLight = new THREE.PointLight(
      lightConfig.color || 0xfff5bf,
      lightConfig.intensity || 2.0,
      lightConfig.distance || 16,
      lightConfig.decay || 1.1
    );
    pLight.position.set(x, hangY - 0.3, 0);
    fixtureGroup.add(pLight);

    const fixtureObj = new Fixture(bodyMesh, pLight, {
      title: 'Suspended High-Voltage Troffer',
      hp: 30,
      xp: 25,
      drops: { copper: 5, ballast: 3, scrap: 2 }
    });

    return { group: fixtureGroup, fixtureObj };
  }

  /**
   * Spawn a Flickering Exit Sign pointing to an unbroken wall
   */
  spawnExitSign(x, y, z, rotationY = 0) {
    const signGroup = new THREE.Group();

    const boxGeo = new THREE.BoxGeometry(0.52, 0.25, 0.08);
    const signMesh = new THREE.Mesh(boxGeo, this.exitSignMat);
    signGroup.add(signMesh);

    signGroup.position.set(x, y, z);
    signGroup.rotation.y = rotationY;

    const prop = new PropObject(signGroup, {
      title: 'Flickering Dead-End Exit Sign',
      hp: 18,
      xp: 15,
      drops: { plastic: 2, copper: 2, ballast: 1 }
    });

    signGroup.userData.bbox = new THREE.Box3().setFromObject(signGroup);
    return { group: signGroup, prop };
  }

  createPaintingMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Dark moody background
    ctx.fillStyle = '#1c1b18';
    ctx.fillRect(0, 0, 256, 256);

    // Eerie infinite corridor perspective lines
    ctx.fillStyle = '#b59d3d';
    ctx.beginPath();
    ctx.moveTo(128, 90);
    ctx.lineTo(240, 220);
    ctx.lineTo(16, 220);
    ctx.closePath();
    ctx.fill();

    // Vanishing point void
    ctx.fillStyle = '#0a0a08';
    ctx.beginPath();
    ctx.arc(128, 90, 18, 0, Math.PI * 2);
    ctx.fill();

    // Distorted typography header
    ctx.fillStyle = '#e8d89a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EFFICIENCY // COMPLIANCE', 128, 40);

    ctx.fillStyle = '#8a7d4a';
    ctx.font = '10px monospace';
    ctx.fillText('NO EXIT AUTHORIZED', 128, 240);

    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.6,
      metalness: 0.1
    });
  }

  /**
   * Spawn a Standalone Exterior Window looking only into yellow drywall
   */
  spawnWindow(x, y, z, rotationY = 0) {
    const winGroup = new THREE.Group();

    // Frame
    const frameGeo = new THREE.BoxGeometry(1.2, 1.4, 0.12);
    const frameMesh = new THREE.Mesh(frameGeo, this.windowFrameMat);
    winGroup.add(frameMesh);

    // Glass pane
    const glassGeo = new THREE.BoxGeometry(1.0, 1.2, 0.03);
    const glassMesh = new THREE.Mesh(glassGeo, this.glassMat);
    glassMesh.position.z = 0.02;
    winGroup.add(glassMesh);

    winGroup.position.set(x, y, z);
    winGroup.rotation.y = rotationY;

    const prop = new PropObject(winGroup, {
      title: 'Standalone Domestic Window',
      hp: 28,
      xp: 18,
      drops: { wood: 4, scrap: 2 }
    });

    winGroup.userData.bbox = new THREE.Box3().setFromObject(winGroup);
    return { group: winGroup, prop };
  }

  /**
   * Spawn an Anomalous Framed Corporate Artwork
   */
  spawnPainting(x, y, z, rotationY = 0) {
    const paintGroup = new THREE.Group();

    // Wooden / Brass Frame
    const frameGeo = new THREE.BoxGeometry(1.1, 0.9, 0.08);
    const frameMesh = new THREE.Mesh(frameGeo, this.windowFrameMat);
    paintGroup.add(frameMesh);

    // Canvas Mesh
    const canvasGeo = new THREE.BoxGeometry(0.96, 0.76, 0.03);
    const canvasMesh = new THREE.Mesh(canvasGeo, this.paintingMat);
    canvasMesh.position.z = 0.04;
    paintGroup.add(canvasMesh);

    paintGroup.position.set(x, y, z);
    paintGroup.rotation.y = rotationY;

    const prop = new PropObject(paintGroup, {
      title: 'Corrupted Corporate Canvas',
      hp: 20,
      xp: 16,
      drops: { wood: 3, fiber: 2, plastic: 1 }
    });

    paintGroup.userData.bbox = new THREE.Box3().setFromObject(paintGroup);
    return { group: paintGroup, prop };
  }
}
