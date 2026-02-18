/**
 * peel-shader.js — Cylindrical Page-Curl Vertex Shader
 *
 * Creates the illusion of a 2D illustration peeling off a book page
 * and curling upward into 3D space. Uses a custom ShaderMaterial
 * driven by a single `uPeel` uniform (0 = flat, 1 = fully peeled).
 */

import * as THREE from 'three';

// ---- GLSL ----

const peelVertexShader = /* glsl */ `
  uniform float uPeel;        // 0.0 = flat on page, 1.0 = fully lifted
  uniform float uCurlRadius;  // radius of the curl cylinder
  uniform float uMaxAngle;    // max curl angle in radians (π for full half-curl)
  
  varying vec2 vUv;
  varying float vCurlFactor;
  
  void main() {
    vUv = uv;
    
    vec3 pos = position;
    
    // Normalize Y to 0–1 range (bottom to top of the quad)
    // The curl peels from the bottom edge upward.
    float normalizedY = clamp(uv.y, 0.0, 1.0);
    
    // How much of the page has peeled (travelling wave)
    float peelLine = uPeel;
    
    // Only curl the portion above the peel line
    float curlZone = smoothstep(peelLine - 0.05, peelLine + 0.15, normalizedY);
    
    if (curlZone > 0.0) {
      float angle = curlZone * uMaxAngle * uPeel;
      float r = uCurlRadius;
      
      // Cylindrical deformation along X-axis
      float liftY = r * sin(angle);
      float liftZ = r * (1.0 - cos(angle));
      
      pos.y += liftY * uPeel;
      pos.z += liftZ * uPeel;
    }
    
    // Slight overall lift as peel progresses
    pos.z += uPeel * 0.02;
    
    vCurlFactor = curlZone;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const peelFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uPeel;
  uniform float uOpacity;
  
  varying vec2 vUv;
  varying float vCurlFactor;
  
  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Add subtle shadow on the curl crease
    float shadow = 1.0 - (vCurlFactor * 0.3 * uPeel);
    
    // Fade out the flat illustration as peel completes
    float alpha = texColor.a * uOpacity;
    
    gl_FragColor = vec4(texColor.rgb * shadow, alpha);
  }
`;

// ---- API ----

/**
 * Create a peelable plane mesh with the page-curl shader.
 *
 * @param {THREE.Texture} texture - The 2D illustration texture
 * @param {number} width - Physical width in meters
 * @param {number} height - Physical height in meters
 * @param {number} curlRadius - Curl cylinder radius
 * @returns {{ mesh: THREE.Mesh, material: THREE.ShaderMaterial }}
 */
export function createPeelPlane(texture, width, height, curlRadius = 0.3) {
    const geometry = new THREE.PlaneGeometry(width, height, 64, 64);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: texture },
            uPeel: { value: 0.0 },
            uCurlRadius: { value: curlRadius },
            uMaxAngle: { value: Math.PI * 0.75 },
            uOpacity: { value: 1.0 }
        },
        vertexShader: peelVertexShader,
        fragmentShader: peelFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'peel-plane';

    return { mesh, material };
}

/**
 * Animate the peel effect from 0 → 1 using GSAP.
 * Call once when image is first tracked.
 *
 * @param {THREE.ShaderMaterial} material - The peel ShaderMaterial
 * @param {number} duration - Animation duration in seconds
 * @param {Function} [onComplete] - Callback when peel finishes
 */
export async function animatePeel(material, duration = 1.5, onComplete) {
    const gsap = (await import('gsap')).default;

    return gsap.to(material.uniforms.uPeel, {
        value: 1.0,
        duration,
        ease: 'power2.inOut',
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
}

/**
 * Animate the peel material fading out (after the 3D model is in place).
 *
 * @param {THREE.ShaderMaterial} material
 * @param {number} duration
 */
export async function fadeOutPeelPlane(material, duration = 0.8) {
    const gsap = (await import('gsap')).default;

    return gsap.to(material.uniforms.uOpacity, {
        value: 0.0,
        duration,
        ease: 'power2.in'
    });
}
