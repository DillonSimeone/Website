import * as THREE from 'three';

/**
 * RadarMinimap: Player-centric 2D CRT phosphor radar (UP = where you are looking).
 * Renders nearby walls/doorways, active mining rovers, hostile entity blips, and player heading.
 */
export class RadarMinimap {
  constructor(canvasId = 'radar-canvas') {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.timer = 0;
    this._dir = new THREE.Vector3();
  }

  update(dt, player, worldManager, roverManager, entityManager) {
    if (!this.ctx || !this.canvas) return;
    this.timer += dt;
    if (this.timer < 0.08) return; // ~12.5 Hz smooth radar
    this.timer = 0;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = 3.2; // pixels per meter
    const maxR = cx - 4;

    ctx.clearRect(0, 0, w, h);

    // Subtle radar rings & FOV cone
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.moveTo(cx, cy); ctx.lineTo(cx - 42, cy - 68);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 42, cy - 68);
    ctx.stroke();

    const pPos = player.camera.position;
    player.camera.getWorldDirection(this._dir);
    let fx = this._dir.x;
    let fz = this._dir.z;
    const flen = Math.hypot(fx, fz) || 1;
    fx /= flen;
    fz /= flen;
    // Right vector in XZ (looking down -Y): (-fz, fx)
    const rx = -fz;
    const rz = fx;

    const toRadar = (wx, wz) => {
      const dx = wx - pPos.x;
      const dz = wz - pPos.z;
      const rightDot = dx * rx + dz * rz;
      const fwdDot = dx * fx + dz * fz;
      return {
        x: cx + rightDot * scale,
        y: cy - fwdDot * scale,
        distPx: Math.hypot(rightDot, fwdDot) * scale
      };
    };

    // Nearby Walls & Pillars on current floor (shows corridors & doorways!)
    if (worldManager) {
      const cols = worldManager.getNearbyCollidables(pPos, 1, 0);
      ctx.fillStyle = 'rgba(57, 255, 20, 0.32)';
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        if (Math.abs(col.position.y - pPos.y) > 4.0) continue;
        const pt = toRadar(col.position.x, col.position.z);
        if (pt.distPx < maxR) {
          ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        }
      }
    }

    // Active Mining Rovers (cyan squares)
    if (roverManager && roverManager.rovers) {
      ctx.fillStyle = '#00f0ff';
      for (const r of roverManager.rovers) {
        const pt = toRadar(r.group.position.x, r.group.position.z);
        if (pt.distPx < maxR) {
          ctx.fillRect(pt.x - 2.5, pt.y - 2.5, 5, 5);
        }
      }
    }

    // Hostile Entities (red dots, magenta for bosses)
    if (entityManager) {
      const ents = entityManager.getEntitiesForRadar();
      for (const ent of ents) {
        if (ent.dying) continue;
        const pt = toRadar(ent.mesh.position.x, ent.mesh.position.z);
        let bx = pt.x;
        let by = pt.y;
        if (pt.distPx > maxR) {
          const k = maxR / pt.distPx;
          bx = cx + (pt.x - cx) * k;
          by = cy + (pt.y - cy) * k;
        }
        ctx.fillStyle = ent.isBoss ? '#ff00ff' : '#ff3344';
        ctx.beginPath();
        ctx.arc(bx, by, ent.isBoss ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Center Player Arrow (always points UP = camera forward)
    ctx.fillStyle = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 4.5, cy + 5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx - 4.5, cy + 5);
    ctx.closePath();
    ctx.fill();
  }
}
