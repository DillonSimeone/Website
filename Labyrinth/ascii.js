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

/*
 * The scene renders at full size with the ASCII mask in alpha (see MASK in styles/common.js).
 * Each 8px cell looks at its centre: shaded cells pass the image through untouched,
 * ASCII cells become glyphs, ink cells become dark glyphs on the paper colour.
 */
export function createMaskedAscii(renderer, { cell = 8 } = {}) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
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
                vec4 centre = texture2D(tScene, (cellId + 0.5) * uCell / uRes);
                if (centre.a < 0.25) {
                    gl_FragColor = vec4(texture2D(tScene, frag / uRes).rgb, 1.0);
                    return;
                }
                vec3 col = centre.rgb;
                float lum = dot(col, vec3(0.299, 0.587, 0.114));
                vec2 inCell = fract(frag / uCell);
                if (centre.a > 0.75) {
                    float dark = clamp(1.0 - lum * 1.15, 0.0, 0.999);
                    float g = floor(dark * uGlyphs);
                    float ink = texture2D(tGlyphs, vec2((g + inCell.x) / uGlyphs, inCell.y)).r;
                    vec3 paper = col;
                    gl_FragColor = vec4(mix(paper, vec3(0.08, 0.06, 0.05), ink * 0.9), 1.0);
                    return;
                }
                float level = clamp(pow(lum * 2.4, 0.8), 0.0, 0.999);
                float g = floor(level * uGlyphs);
                float glyph = texture2D(tGlyphs, vec2((g + inCell.x) / uGlyphs, inCell.y)).r;
                vec3 tint = col / max(max(col.r, max(col.g, col.b)), 0.001);
                gl_FragColor = vec4(tint * (0.3 + level * 1.15) * glyph + col * 0.15, 1.0);
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
            target.setSize(Math.max(1, width), Math.max(1, height));
            material.uniforms.uRes.value.set(width, height);
        },
        render(scene, camera) {
            renderer.setRenderTarget(target);
            renderer.clear();
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
