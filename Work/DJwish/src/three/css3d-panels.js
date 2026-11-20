import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { HOARDINGS, smoothstep } from './world.js';

function createBoardFace(spec) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round(512 * (spec.pxHeight / spec.pxWidth));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2119';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,230,200,0.05)';
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 30, 1 + Math.random() * 2);
  }
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(18, 18, c.width - 36, c.height - 36);
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, c.width - 48, c.height - 48);
  ctx.fillStyle = spec.color;
  ctx.font = '400 54px "Permanent Marker", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(spec.title, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * WallPanels - live HTML panels (audio station, links / live rig) pasted onto
 * plywood street hoardings via CSS3DRenderer. Panels fade in only around their
 * scroll stop so the DOM layer never shows through buildings.
 */
export class WallPanels {
  constructor(container, scene) {
    this.renderer = new CSS3DRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.className = 'css3d-layer';
    container.appendChild(this.renderer.domElement);

    this.cssScene = new THREE.Scene();
    this.panels = [];

    const boardSide = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.9 });

    for (const spec of Object.values(HOARDINGS)) {
      const el = document.getElementById(spec.elementId);
      if (!el) continue;
      el.style.width = `${spec.pxWidth}px`;
      el.style.height = `${spec.pxHeight}px`;

      const scale = spec.width / spec.pxWidth;
      const height = spec.pxHeight * scale;

      const obj = new CSS3DObject(el);
      obj.scale.setScalar(scale);
      obj.position.set(spec.x, spec.bottom + height / 2, spec.z);
      obj.rotation.y = spec.rotY;
      this.cssScene.add(obj);

      const boardH = spec.bottom + height + 0.35;
      const face = new THREE.MeshStandardMaterial({
        map: createBoardFace(spec),
        roughness: 0.85,
        emissive: 0x1a1020,
        emissiveIntensity: 0.6
      });
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width + 0.5, boardH, 0.22),
        [boardSide, boardSide, boardSide, boardSide, face, boardSide]
      );
      board.position.set(spec.x, boardH / 2, spec.z);
      board.rotation.y = spec.rotY;
      board.translateZ(-0.14);
      scene.add(board);

      this.panels.push({ el, stop: spec.stop, shown: true, opacity: -1 });
    }
  }

  setSize(w, h) {
    this.renderer.setSize(w, h);
  }

  update(camera, stopFloat, hidden) {
    let any = false;
    for (const p of this.panels) {
      const o = hidden ? 0 : 1 - smoothstep(0.35, 0.75, Math.abs(stopFloat - p.stop));
      if (o <= 0.01) {
        if (p.shown) {
          p.el.style.visibility = 'hidden';
          p.shown = false;
        }
        continue;
      }
      if (!p.shown) {
        p.el.style.visibility = 'visible';
        p.shown = true;
      }
      const rounded = Math.round(o * 50) / 50;
      if (rounded !== p.opacity) {
        p.el.style.opacity = rounded;
        p.opacity = rounded;
      }
      any = true;
    }
    if (any) this.renderer.render(this.cssScene, camera);
  }
}
