import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const GLYPHS = ' .:-=+*#%@';

function glyphAtlas() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size * GLYPHS.length;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [...GLYPHS].forEach((ch, i) => ctx.fillText(ch, i * size + size / 2, size / 2 + 1));
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

/**
 * Renders the scene at a quarter of the screen size, then draws each cell as a character
 * chosen by brightness and tinted by the scene colour.
 */
export function createAscii(renderer, { cell = 8, sceneScale = 0.25 } = {}) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
    });
    const glyphs = glyphAtlas();
    const material = new THREE.ShaderMaterial({
        uniforms: {
            tScene: { value: target.texture },
            tGlyphs: { value: glyphs },
            uRes: { value: new THREE.Vector2(1, 1) },
            uCell: { value: cell },
            uGlyphs: { value: GLYPHS.length },
        },
        vertexShader: /* glsl */ `
            void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
            uniform sampler2D tScene;
            uniform sampler2D tGlyphs;
            uniform vec2 uRes;
            uniform float uCell;
            uniform float uGlyphs;
            void main() {
                vec2 frag = gl_FragCoord.xy;
                vec2 cellId = floor(frag / uCell);
                vec3 col = texture2D(tScene, (cellId + 0.5) * uCell / uRes).rgb;
                float lum = dot(col, vec3(0.299, 0.587, 0.114));
                float level = clamp(pow(lum * 2.4, 0.8), 0.0, 0.999);
                float g = floor(level * uGlyphs);
                vec2 inCell = fract(frag / uCell);
                float mask = texture2D(tGlyphs, vec2((g + inCell.x) / uGlyphs, inCell.y)).r;
                vec3 tint = col / max(max(col.r, max(col.g, col.b)), 0.001);
                vec3 ink = tint * (0.3 + level * 1.15);
                gl_FragColor = vec4(ink * mask + col * 0.2, 1.0);
            }`,
        depthTest: false,
        depthWrite: false,
    });
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeo, material);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
        resize(width, height) {
            target.setSize(Math.max(1, Math.round(width * sceneScale)), Math.max(1, Math.round(height * sceneScale)));
            material.uniforms.uRes.value.set(width, height);
        },
        render(scene, camera) {
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            renderer.render(quadScene, quadCamera);
        },
        dispose() {
            target.dispose();
            glyphs.dispose();
            material.dispose();
            quadGeo.dispose();
        },
    };
}
