/**
 * Apex Parasite - InstancedMesh ASCII Renderer
 * Single-draw-call 2D grid rendered via Three.js InstancedMesh with custom GLSL shader.
 * Supports dynamic FG/BG colors, atlas UV offsets, and neural glitch distortion shaders.
 */

import * as THREE from 'three';
import { GlyphAtlas } from './atlas.js';

export class AsciiRenderer {
  /**
   * @param {HTMLElement} container DOM element to mount the WebGL canvas
   * @param {number} cols Number of grid columns (e.g. 60)
   * @param {number} rows Number of grid rows (e.g. 35)
   */
  constructor(container, cols = 60, rows = 35) {
    this.container = container;
    this.cols = cols;
    this.rows = rows;
    this.totalCells = cols * rows;

    this.atlas = new GlyphAtlas(32);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020305);

    // Setup Orthographic Camera
    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = 38;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2,
      viewSize * aspect / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      100
    );
    this.camera.position.set(this.cols / 2, this.rows / 2, 10);
    this.camera.lookAt(this.cols / 2, this.rows / 2, 0);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Build Instanced Geometry and Shader Material
    this.buildInstancedGrid();

    // Camera target for smooth follow
    this.camTargetX = this.cols / 2;
    this.camTargetY = this.rows / 2;
    this.glitchIntensity = 0.0;
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.onResize());
  }

  buildInstancedGrid() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    
    // Custom Attributes for InstancedMesh
    this.glyphOffsets = new Float32Array(this.totalCells * 2);
    this.fgColors = new Float32Array(this.totalCells * 4);
    this.bgColors = new Float32Array(this.totalCells * 4);

    // Default fill: empty space with black bg
    for (let i = 0; i < this.totalCells; i++) {
      const idx2 = i * 2;
      const idx4 = i * 4;
      
      // Default space character (ASCII 32)
      const [u, v] = this.atlas.getGlyphUV(32);
      this.glyphOffsets[idx2] = u;
      this.glyphOffsets[idx2 + 1] = v;

      // FG: dim gray
      this.fgColors[idx4] = 0.4;
      this.fgColors[idx4 + 1] = 0.45;
      this.fgColors[idx4 + 2] = 0.5;
      this.fgColors[idx4 + 3] = 1.0;

      // BG: deep black
      this.bgColors[idx4] = 0.02;
      this.bgColors[idx4 + 1] = 0.03;
      this.bgColors[idx4 + 2] = 0.04;
      this.bgColors[idx4 + 3] = 1.0;
    }

    const instancedGeo = new THREE.InstancedBufferGeometry();
    instancedGeo.index = geometry.index;
    instancedGeo.attributes.position = geometry.attributes.position;
    instancedGeo.attributes.uv = geometry.attributes.uv;

    this.attrGlyphOffset = new THREE.InstancedBufferAttribute(this.glyphOffsets, 2);
    this.attrFgColor = new THREE.InstancedBufferAttribute(this.fgColors, 4);
    this.attrBgColor = new THREE.InstancedBufferAttribute(this.bgColors, 4);

    instancedGeo.setAttribute('aGlyphOffset', this.attrGlyphOffset);
    instancedGeo.setAttribute('aFgColor', this.attrFgColor);
    instancedGeo.setAttribute('aBgColor', this.attrBgColor);

    // Shader Material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.atlas.texture },
        uTime: { value: 0 },
        uGlitchIntensity: { value: 0 }
      },
      vertexShader: `
        attribute vec2 aGlyphOffset;
        attribute vec4 aFgColor;
        attribute vec4 aBgColor;

        varying vec2 vUv;
        varying vec2 vGlyphOffset;
        varying vec4 vFgColor;
        varying vec4 vBgColor;

        uniform float uTime;
        uniform float uGlitchIntensity;

        void main() {
          vUv = uv;
          vGlyphOffset = aGlyphOffset;
          vFgColor = aFgColor;
          vBgColor = aBgColor;

          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);

          if (uGlitchIntensity > 0.0) {
            float jitter = sin(uTime * 45.0 + instanceMatrix[3][0] * 9.0) * cos(instanceMatrix[3][1] * 12.0);
            mvPosition.x += jitter * (uGlitchIntensity * 0.12);
            mvPosition.y += sin(uTime * 30.0 + instanceMatrix[3][1]) * (uGlitchIntensity * 0.05);
          }

          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying vec2 vGlyphOffset;
        varying vec4 vFgColor;
        varying vec4 vBgColor;

        void main() {
          vec2 atlasUv = vec2(
            (vGlyphOffset.x + vUv.x) / 16.0,
            ((15.0 - vGlyphOffset.y) + vUv.y) / 16.0
          );

          vec4 texColor = texture2D(uTexture, atlasUv);
          float glyphAlpha = texColor.a;

          // Blend glyph with cell background
          vec4 finalColor = mix(vBgColor, vFgColor, glyphAlpha);
          gl_FragColor = finalColor;
        }
      `,
      transparent: false,
      depthTest: true,
      depthWrite: true
    });

    this.mesh = new THREE.InstancedMesh(instancedGeo, this.material, this.totalCells);

    // Position cells in grid layout
    const dummy = new THREE.Object3D();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const index = y * this.cols + x;
        // Invert Y so 0 is at top of grid
        dummy.position.set(x, this.rows - 1 - y, 0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(index, dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mesh);
  }

  /**
   * Set glyph and colors for a cell at (x, y)
   * @param {number} x 
   * @param {number} y 
   * @param {number} charCode ASCII or glyph index
   * @param {[number, number, number, number]} fg RGBA in 0..1
   * @param {[number, number, number, number]} bg RGBA in 0..1
   */
  setCell(x, y, charCode, fg = [0.9, 0.9, 0.9, 1.0], bg = [0.02, 0.03, 0.05, 1.0]) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const index = y * this.cols + x;
    const [col, row] = this.atlas.getGlyphUV(charCode);

    const idx2 = index * 2;
    this.glyphOffsets[idx2] = col;
    this.glyphOffsets[idx2 + 1] = row;

    const idx4 = index * 4;
    this.fgColors[idx4] = fg[0];
    this.fgColors[idx4 + 1] = fg[1];
    this.fgColors[idx4 + 2] = fg[2];
    this.fgColors[idx4 + 3] = fg[3] !== undefined ? fg[3] : 1.0;

    this.bgColors[idx4] = bg[0];
    this.bgColors[idx4 + 1] = bg[1];
    this.bgColors[idx4 + 2] = bg[2];
    this.bgColors[idx4 + 3] = bg[3] !== undefined ? bg[3] : 1.0;
  }

  markBuffersDirty() {
    this.attrGlyphOffset.needsUpdate = true;
    this.attrFgColor.needsUpdate = true;
    this.attrBgColor.needsUpdate = true;
  }

  /**
   * Smoothly center camera on target coordinates
   */
  setCameraTarget(x, y) {
    this.camTargetX = x;
    this.camTargetY = this.rows - 1 - y;
  }

  setGlitchIntensity(intensity) {
    this.glitchIntensity = Math.max(0, Math.min(1.0, intensity));
    if (this.material) {
      this.material.uniforms.uGlitchIntensity.value = this.glitchIntensity;
    }
  }

  onResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    const viewSize = 38;
    this.camera.left = -viewSize * aspect / 2;
    this.camera.right = viewSize * aspect / 2;
    this.camera.top = viewSize / 2;
    this.camera.bottom = -viewSize / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  render() {
    const elapsed = this.clock.getElapsedTime();
    if (this.material) {
      this.material.uniforms.uTime.value = elapsed;
    }

    // Smooth camera lerp
    this.camera.position.x += (this.camTargetX - this.camera.position.x) * 0.12;
    this.camera.position.y += (this.camTargetY - this.camera.position.y) * 0.12;

    this.renderer.render(this.scene, this.camera);
  }
}
