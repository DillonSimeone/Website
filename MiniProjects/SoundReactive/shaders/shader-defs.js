import { CommonGLSL } from '../shared/shader-common.js';

export const SHADER_DEFINITIONS = [
  // -------------------------------------------------------------
  // SHADER 1: CYMATICS RESONANCE MATRIX (Chladni Nodal Plates)
  // -------------------------------------------------------------
  {
    id: 'cymatics',
    title: 'CYMATICS RESONANCE MATRIX',
    description: 'Physically inspired Chladni plate wave interference. Smooth continuous harmonic superpositions generate fluid acoustic nodal lines: deep crimson sub-bass centers unfolding into intricate ultraviolet mandalas as frequencies reach 20kHz.',
    customParams: [
      { id: 'harmonicScale', name: 'HARMONIC COMPLEXITY', min: 0.5, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'spinSpeed', name: 'VIBRATION ROTATION', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'rippleDepth', name: 'RADIAL BESSEL WAVES', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'lineSharpness', name: 'NODAL SHARPNESS', min: 0.4, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'sandDensity', name: 'ACOUSTIC MICRO-SAND', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_lowMid;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;
      uniform vec3 u_primaryColor;
      uniform vec3 u_secondaryColor;

      // Global Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;

      // Shader Specific Custom Uniforms
      uniform float u_harmonicScale;
      uniform float u_spinSpeed;
      uniform float u_rippleDepth;
      uniform float u_lineSharpness;
      uniform float u_sandDensity;

      ${CommonGLSL}

      // Continuous 2D Chladni plate harmonic wave equation
      float chladniWave(vec2 p, float n, float m) {
        return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
      }

      float chladniDual(vec2 p, float n, float m) {
        return sin(n * PI * p.x) * sin(m * PI * p.y) - sin(m * PI * p.x) * sin(n * PI * p.y);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        uv *= 2.2;

        // Smooth gentle rotation driven by subtle time and mid frequencies
        float rotAngle = (u_time * 0.08 + u_mid * 0.2) * u_spinSpeed;
        vec2 rotUV = rot2D(rotAngle) * uv;

        float r = length(rotUV);
        float a = atan(rotUV.y, rotUV.x);

        // Continuous modal numbers scaled by harmonicScale and audio
        float hScale = max(0.2, u_harmonicScale);
        float n1 = (1.0 + u_subBass * 1.5 * u_bassPunch) * hScale;
        float m1 = (2.0 + u_bass * 2.0 * u_bassPunch) * hScale;

        float n2 = (3.0 + u_mid * 2.5) * hScale;
        float m2 = (4.0 + (u_high * 3.5 + u_air * 2.0) * u_trebleSparkle) * hScale;

        // Superposition of fundamental harmonic and high-frequency overtones
        float w1 = chladniWave(rotUV, n1, m1);
        float w2 = chladniDual(rotUV, n2, m2);
        
        // Circular plate Bessel-like standing wave ripple
        float radialWave = cos(r * (7.0 + u_bass * 6.0 * u_bassPunch) - u_time * 0.8) * cos(6.0 * a + u_time * 0.2) * u_rippleDepth;

        // Dynamic harmonic weighting
        float weight1 = 0.8 + u_subBass * 1.2 * u_bassPunch;
        float weight2 = (u_mid * 0.7 + u_high * 1.1 + u_air * 1.4) * u_trebleSparkle;
        float weightRadial = 0.35 + u_bass * 0.5 * u_bassPunch;

        float W = (w1 * weight1 + w2 * weight2 + radialWave * weightRadial) / (weight1 + weight2 + weightRadial + 0.01);
        
        // Nodal line distance
        float nodalDist = abs(W);
        
        // Crisp central nodal lines and soft glowing acoustic resonance
        float sharpness = max(0.01, u_lineSharpness);
        float nodalLine = smoothstep((0.09 + u_transient * 0.05) / sharpness, 0.005, nodalDist);
        float resonanceGlow = (0.04 * u_glowMultiplier) / (nodalDist + 0.04);

        // Continuous frequency gradient with DJ hue offset
        float freqGradient = clamp(r * 0.35 + u_high * 0.4 + u_air * 0.6, 0.0, 1.0);
        vec3 spectralColor = freqToColor(freqGradient, (1.2 + u_energy * 0.8) * u_glowMultiplier, u_hueOffset);

        // Color blending
        vec3 crimsonCore = vec3(1.0, 0.02, 0.15) * (0.8 + u_subBass * 2.0 * u_bassPunch);
        vec3 violetHighs = vec3(0.75, 0.0, 1.0) * (0.8 + (u_high * 2.5 + u_air * 2.0) * u_trebleSparkle);
        vec3 plateColor = mix(crimsonCore, violetHighs, smoothstep(0.1, 0.8, freqGradient));

        vec3 finalCol = nodalLine * spectralColor * 2.2 + resonanceGlow * plateColor * (0.6 + u_bass * 0.8);

        // Micro-dust particle texture along nodal lines
        if (u_sandDensity > 0.01) {
          float sandNoise = hash21(rotUV * 120.0 + sin(u_time * 0.1));
          if (sandNoise > (0.95 - u_sandDensity * 0.08)) {
            finalCol += spectralColor * smoothstep(0.12, 0.01, nodalDist) * (0.5 + u_high * 1.5 * u_trebleSparkle) * u_sandDensity;
          }
        }

        // Circular vignette for projection boundary
        finalCol *= smoothstep(1.35, 0.7, r);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 2: CHROMATIC SUB-BASS SHOCKWAVE (Concentric Ripple Cannon)
  // -------------------------------------------------------------
  {
    id: 'shockwave',
    title: 'CHROMATIC SUB-BASS SHOCKWAVE',
    description: 'Dynamic concentric chromatic shockwaves spawning at the core and cascading outwardly to wriggling perimeter edges. Sub-bass and transient threshold bursts spawn vivid new color wavefronts that ripple across the projection surface.',
    customParams: [
      { id: 'rippleSpeed', name: 'RIPPLE EXPANSION SPEED', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'wriggleAmp', name: 'EDGE WRIGGLE INTENSITY', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'colorLayers', name: 'COLOR WAVE DENSITY', min: 2.0, max: 12.0, step: 1.0, default: 6.0, unit: '' },
      { id: 'thresholdSens', name: 'BURST SPAWN SENSITIVITY', min: 0.5, max: 3.0, step: 0.1, default: 1.2, unit: 'x' },
      { id: 'chromaSplit', name: 'CHROMATIC ABERRATION', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_rippleSpeed;
      uniform float u_wriggleAmp;
      uniform float u_colorLayers;
      uniform float u_thresholdSens;
      uniform float u_chromaSplit;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        float r = length(uv);
        float a = atan(uv.y, uv.x);

        // Multi-harmonic wriggling edge perimeter
        float wriggle = (
          sin(a * 4.0 + u_time * 1.8) * 0.07 * (0.6 + u_subBass * 2.0 * u_bassPunch) +
          cos(a * 7.0 - u_time * 2.5) * 0.04 * (0.5 + u_mid * 2.0) +
          sin(a * 11.0 + u_time * 3.5) * 0.02 * (0.5 + u_high * 3.0 * u_trebleSparkle) +
          cos(a * 17.0 - u_time * 5.0) * 0.01 * (0.5 + u_air * 4.0)
        ) * max(0.0, u_wriggleAmp);

        float rWriggle = r - wriggle;

        // Dynamic concentric ripples propagating outward
        float speed = max(0.2, u_rippleSpeed);
        float layers = max(2.0, u_colorLayers);
        float phase = rWriggle * layers - u_time * 3.0 * speed - (u_subBass * 3.5 * u_bassPunch + u_transient * 2.5 * u_thresholdSens);
        
        float waveRidge = sin(phase);
        float sharpBand = smoothstep(-0.2, 0.85, waveRidge);

        // Transient / Sub-bass Threshold Detector: Spawns new shockwave bursts on kick/snare attacks
        float kickIntensity = smoothstep(0.35, 0.75, (u_subBass * 1.2 * u_bassPunch + u_transient * 1.5) * u_thresholdSens);
        float burstPhase = fract(u_time * 1.4 * speed + kickIntensity * 0.4);
        float burstWave = smoothstep(0.06, 0.0, abs(rWriggle - burstPhase * 1.1)) * (1.0 + kickIntensity * 4.0);

        // Synesthetic color progression: Shifting palette rippling from core to wriggling edges
        float colorCoord = fract((rWriggle * 0.85 - u_time * 0.28 * speed) + kickIntensity * 0.5);
        float hueIdx = clamp(colorCoord + u_high * 0.35 * u_trebleSparkle, 0.0, 1.0);
        vec3 waveColor = freqToColor(hueIdx, 1.0, u_hueOffset);

        // Outer shape radius bounds
        float maxRadius = 0.68 + u_subBass * 0.25 * u_bassPunch + u_transient * 0.12;

        // Chromatic split on RGB perimeter
        float chroma = 0.02 * max(0.0, u_chromaSplit) * (1.0 + u_transient * 2.5);
        float maskR = smoothstep(maxRadius + 0.08, maxRadius - 0.04, rWriggle + chroma);
        float maskG = smoothstep(maxRadius + 0.08, maxRadius - 0.04, rWriggle);
        float maskB = smoothstep(maxRadius + 0.08, maxRadius - 0.04, rWriggle - chroma);

        // Base multi-layered color composition
        vec3 col = waveColor * (0.35 + 0.65 * sharpBand) * (0.8 + u_energy * 1.2);
        col.r *= maskR;
        col.g *= maskG;
        col.b *= maskB;

        // Core color birth epicenter (glowing nucleus where new waves spawn)
        float coreSpawn = smoothstep(0.28, 0.0, r) * (1.0 + u_subBass * 4.0 * u_bassPunch);
        vec3 coreColor = mix(vec3(1.0, 0.1, 0.2), vec3(1.0, 0.9, 0.1), kickIntensity);
        col += coreColor * coreSpawn * (1.0 + kickIntensity * 2.0);

        // Propagating threshold burst ring
        vec3 burstCol = mix(vec3(0.0, 1.0, 0.8), vec3(1.0, 0.0, 0.6), kickIntensity);
        col += burstCol * burstWave * maskG * 1.5;

        // Glowing wriggling perimeter boundary line
        float edgeGlow = smoothstep(0.05, 0.0, abs(rWriggle - maxRadius));
        vec3 rimColor = freqToColor(clamp(0.85 + u_high * 0.15, 0.0, 1.0), 1.0, u_hueOffset);
        col += rimColor * edgeGlow * (1.5 + u_high * 3.0 * u_trebleSparkle);

        // Circular vignette falloff
        col *= smoothstep(1.35, 0.65, r) * u_glowMultiplier;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 3: ARCHITECTURAL INFINITE ISOMETRIC VOXEL GRID
  // -------------------------------------------------------------
  {
    id: 'voxel-grid',
    title: 'ARCHITECTURAL INFINITE VOXEL GRID',
    description: 'Infinite moving 3D isometric voxel landscape governed by grow-decay momentum physics. Repeating musical notes and frequency energy accelerate directional grid drift, extruding glowing synesthetic voxel towers and laser wireframes.',
    customParams: [
      { id: 'gridDensity', name: 'GRID DENSITY / SCALE', min: 4.0, max: 20.0, step: 1.0, default: 8.0, unit: '' },
      { id: 'extrudeDepth', name: 'VOXEL TOWER HEIGHT', min: 0.2, max: 3.5, step: 0.1, default: 1.2, unit: 'x' },
      { id: 'flowSpeed', name: 'DRIFT SPEED MULTIPLIER', min: 0.2, max: 4.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'wireGlow', name: 'LASER WIRE GLOW', min: 0.5, max: 3.0, step: 0.1, default: 1.5, unit: 'x' },
      { id: 'motionTrails', name: 'WARP SPEED TRAILS', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;
      uniform vec2 u_gridOffset;
      uniform vec2 u_gridVelocity;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_gridDensity;
      uniform float u_extrudeDepth;
      uniform float u_flowSpeed;
      uniform float u_wireGlow;
      uniform float u_motionTrails;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        // 3D Horizon Perspective & Tilting Camera
        vec2 p = uv;
        p.y += 0.28;
        float persp = 1.0 / (p.y + 1.32);
        vec2 isoP = vec2(p.x * persp * 1.85, (p.y * persp - 0.52) * 2.2);

        // Infinite directional scrolling coordinates with momentum
        vec2 drift = u_gridOffset * max(0.1, u_flowSpeed);
        float density = max(3.0, u_gridDensity);
        vec2 gridCoords = isoP * density + drift;

        vec2 cellId = floor(gridCoords);
        vec2 cellUv = fract(gridCoords) - 0.5;

        // Voxel height & multi-band wave modulation
        float cellHash = hash21(cellId);
        
        float waveBass = sin(dot(cellId, vec2(0.25, 0.65)) - u_time * 3.5) * u_subBass * 2.8 * u_bassPunch;
        float waveMid = cos(dot(cellId, vec2(0.55, -0.45)) + u_time * 2.8) * u_mid * 2.2;
        float waveHigh = sin(dot(cellId, vec2(1.1, 0.9)) - u_time * 4.5) * u_high * 2.0 * u_trebleSparkle;
        
        float towerHeight = clamp((cellHash * 0.35 + waveBass + waveMid + waveHigh + u_transient * 1.6), 0.0, 4.5) * u_extrudeDepth;

        // 3D Voxel Box Shading
        float border = max(abs(cellUv.x), abs(cellUv.y));
        float wire = smoothstep(0.39, 0.48, border);

        float topFace = smoothstep(0.44, 0.0, border);
        float sideShade = (1.0 - topFace) * (0.35 + 0.65 * clamp(cellUv.y + 0.5, 0.0, 1.0));

        // Speed motion streaks when accelerating
        float speedMag = length(u_gridVelocity);
        float motionStreak = smoothstep(0.2, 2.5, speedMag) * u_motionTrails;

        // Synesthetic color calculation
        float colorCoord = fract(cellHash * 0.35 + towerHeight * 0.22 + length(cellId - floor(drift)) * 0.02 + u_high * 0.25 * u_trebleSparkle);
        vec3 towerCol = freqToColor(colorCoord, 1.0, u_hueOffset);

        // Voxel face illumination
        vec3 finalCol = towerCol * (0.22 + topFace * 0.65 + towerHeight * 0.45);
        finalCol += towerCol * sideShade * 0.5;

        // Laser wireframe highlights
        vec3 wireColor = mix(towerCol * 2.6, vec3(1.0, 0.95, 0.4), u_transient);
        finalCol += wireColor * wire * u_wireGlow * (1.0 + motionStreak * 0.6);

        // Motion streaks on high-velocity drift
        if (motionStreak > 0.05) {
          float streak = smoothstep(0.04, 0.0, abs(sin(cellUv.x * 24.0 + u_time * 16.0))) * motionStreak;
          finalCol += vec3(0.0, 0.9, 1.0) * streak * speedMag * 0.8;
        }

        // Transient beat flash on grid facet borders
        finalCol += u_transient * vec3(1.0, 0.15, 0.35) * smoothstep(0.38, 0.49, border) * 1.5;

        // Atmospheric horizon depth fog
        float depthFade = smoothstep(0.0, 0.38, p.y + 1.25) * smoothstep(1.35, 0.45, length(uv));
        finalCol *= depthFade * u_glowMultiplier;

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 4: SYNESTHETIC SPECTRAL NEBULA (Volumetric Plasma)
  // -------------------------------------------------------------
  {
    id: 'spectral-nebula',
    title: 'SYNESTHETIC SPECTRAL NEBULA',
    caseTag: 'CASE_04 // INTERSTELLAR PLASMA',
    description: 'Atmospheric fluid volumetric cloud. Bass stokes a deep crimson core fire while treble vocals and synth leads carve swirling ultraviolet cosmic filaments.',
    customParams: [
      { id: 'turbSpeed', name: 'TURBULENCE SPEED', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'cloudDensity', name: 'CLOUD DENSITY', min: 0.5, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'starSparkle', name: 'STAR DUST DENSITY', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_turbSpeed;
      uniform float u_cloudDensity;
      uniform float u_starSparkle;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        vec2 p = uv * 2.2;
        float t = u_time * 0.4 * max(0.1, u_turbSpeed);

        vec2 q = vec2(fbm(p + vec2(0.0, t * 0.2)), fbm(p + vec2(t * 0.3, 1.0)));
        vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15), fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.12));

        float f = fbm(p + 4.0 * r + u_bass * 1.5 * u_bassPunch);

        vec3 colCore = vec3(1.0, 0.05, 0.05) * (1.0 + u_subBass * 2.5 * u_bassPunch);
        vec3 colMid = vec3(0.0, 0.8, 0.9) * (1.0 + u_mid * 1.8);
        vec3 colHigh = vec3(0.8, 0.1, 1.0) * (1.0 + (u_high * 3.0 + u_air * 2.0) * u_trebleSparkle);

        vec3 col = mix(colCore, colMid, clamp(f * f * 2.0, 0.0, 1.0));
        col = mix(col, colHigh, clamp(length(r) * (0.8 + u_high * u_trebleSparkle), 0.0, 1.0));

        col *= (f * f * f + 0.6 * f * f + 0.5 * f) * (1.0 + u_energy * 0.8) * u_cloudDensity * u_glowMultiplier;
        
        if (u_starSparkle > 0.01) {
          float starNoise = hash21(uv + fract(u_time * 0.1));
          if (starNoise > (0.99 - u_starSparkle * 0.008) && u_air > 0.1) {
            col += vec3(1.0, 0.8, 1.0) * u_air * 3.0 * u_starSparkle;
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 5: VISUAL METRONOME & DUAL PHASE HELIX (Beat-Sync Spiral)
  // -------------------------------------------------------------
  {
    id: 'helix-metronome',
    title: 'DUAL PHASE HELIX & METRONOME',
    caseTag: 'CASE_05 // BEAT-SYNC TELEMETRY',
    description: 'Provides high-contrast visual rhythm markers and Left/Right dual-deck track phasing. BPM pulse rings and downbeat markers give tactile visual tempo tracking.',
    customParams: [
      { id: 'twistRate', name: 'HELIX TWIST SPEED', min: 0.5, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'strandGlow', name: 'STRAND GLOW', min: 0.5, max: 2.5, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_twistRate;
      uniform float u_strandGlow;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        float r = length(uv);
        float a = atan(uv.y, uv.x);

        float twist = (8.0 + u_high * 12.0 * u_trebleSparkle) * max(0.3, u_twistRate);
        float helix1 = abs(sin(r * twist - u_time * 3.0 + a * 2.0));
        float helix2 = abs(sin(r * twist - u_time * 3.0 + a * 2.0 + PI));

        float line1 = 0.03 / (helix1 + 0.03) * (0.8 + u_bass * 1.5 * u_bassPunch) * u_strandGlow;
        float line2 = 0.03 / (helix2 + 0.03) * (0.8 + u_high * 1.5 * u_trebleSparkle) * u_strandGlow;

        vec3 colA = vec3(1.0, 0.15, 0.05) * line1;
        vec3 colB = vec3(0.7, 0.0, 1.0) * line2;

        float beatRing = smoothstep(0.04, 0.0, abs(fract(u_time * 1.066) * 1.2 - r)) * (1.0 + u_transient * 2.0);
        vec3 beatCol = vec3(1.0, 0.9, 0.2) * beatRing;

        float centerFlash = smoothstep(0.3 + u_subBass * 0.3 * u_bassPunch, 0.0, r) * (0.5 + u_subBass * 2.0 * u_bassPunch);
        vec3 coreCol = vec3(1.0, 0.0, 0.3) * centerFlash;

        vec3 finalCol = (colA + colB + beatCol + coreCol) * u_glowMultiplier;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 6: CYBERNETIC GEODESIC DOME (Voronoi Hex Shield)
  // -------------------------------------------------------------
  {
    id: 'geodesic-dome',
    title: 'CYBERNETIC GEODESIC DOME',
    caseTag: 'CASE_06 // VORONOI HEX SHIELD',
    description: 'Hexagonal forcefield wrapping around curved surfaces and domes. Cells radiate frequency energy from red epicenter outwards to laser-violet shield edges.',
    customParams: [
      { id: 'cellDensity', name: 'HEX CELL DENSITY', min: 3.0, max: 12.0, step: 0.5, default: 5.0, unit: '' },
      { id: 'scanSpeed', name: 'SCANLINE LASER SPEED', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_cellDensity;
      uniform float u_scanSpeed;

      ${CommonGLSL}

      vec3 voronoi(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        vec2 mg, mr;
        float md = 8.0;

        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + 13.7));
            o = 0.5 + 0.4 * sin(u_time * 1.2 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md = d;
              mr = r;
              mg = g;
            }
          }
        }

        md = 8.0;
        for (int j = -2; j <= 2; j++) {
          for (int i = -2; i <= 2; i++) {
            vec2 g = mg + vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + 13.7));
            o = 0.5 + 0.4 * sin(u_time * 1.2 + 6.2831 * o);
            vec2 r = g + o - f;
            if (dot(mr - r, mr - r) > 0.00001) {
              md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
            }
          }
        }
        return vec3(md, mr);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float r = length(uv);

        float density = max(2.0, u_cellDensity);
        vec2 p = uv * (density + u_bass * 2.0 * u_bassPunch);
        vec3 v = voronoi(p);

        float edgeDist = v.x;
        float cellEdge = smoothstep(0.08 + u_transient * 0.08, 0.0, edgeDist);

        float freqGradient = clamp(r * 0.6 + u_high * 0.4 * u_trebleSparkle, 0.0, 1.0);
        vec3 col = freqToColor(freqGradient, 1.0 * u_glowMultiplier, u_hueOffset);

        float centerGlow = smoothstep(0.9, 0.0, r) * u_subBass * 2.0 * u_bassPunch;
        vec3 finalCol = col * (0.15 + centerGlow) + cellEdge * col * 2.0;

        if (u_scanSpeed > 0.01) {
          float scanline = smoothstep(0.02, 0.0, abs(sin(uv.y * 20.0 - u_time * 4.0 * u_scanSpeed))) * u_high * u_trebleSparkle;
          finalCol += vec3(0.8, 0.2, 1.0) * scanline * 2.0;
        }

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 7: AUDIO-REACTIVE MANDELBULB (Fractal Abyss)
  // -------------------------------------------------------------
  {
    id: 'mandelbulb',
    title: 'AUDIO-REACTIVE MANDELBULB',
    caseTag: 'CASE_07 // FRACTAL ABYSS',
    description: '3D fractal Mandelbulb whose geometric power and folding dimensions oscillate with sound complexity. Low bass delves into the core, treble crystallizes outer edges.',
    customParams: [
      { id: 'fractalPower', name: 'BASE FRACTAL POWER', min: 4.0, max: 12.0, step: 0.5, default: 6.0, unit: '' },
      { id: 'orbitSpeed', name: 'ORBIT ROTATION SPEED', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_fractalPower;
      uniform float u_orbitSpeed;

      ${CommonGLSL}

      float mandelbulb(vec3 pos, out float trap) {
        vec3 z = pos;
        float dr = 1.0;
        float r = 0.0;
        float power = max(3.0, u_fractalPower) + u_bass * 2.5 * u_bassPunch + u_mid * 2.0;
        trap = 1e10;

        for (int i = 0; i < 4; i++) {
          r = length(z);
          if (r > 2.5) break;
          trap = min(trap, length(z));

          float theta = acos(clamp(z.z / r, -1.0, 1.0));
          float phi = atan(z.y, z.x);
          dr = pow(r, power - 1.0) * power * dr + 1.0;

          float zr = pow(r, power);
          theta = theta * power + u_time * 0.2 * u_orbitSpeed;
          phi = phi * power + u_time * 0.15 * u_orbitSpeed;

          z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
          z += pos;
        }
        return 0.5 * log(r) * r / dr;
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        vec3 ro = vec3(0.0, 0.0, -2.4 + u_subBass * 0.5 * u_bassPunch);
        vec3 rd = normalize(vec3(uv, 1.0));

        ro.xz = rot2D(u_time * 0.2 * u_orbitSpeed) * ro.xz;
        rd.xz = rot2D(u_time * 0.2 * u_orbitSpeed) * rd.xz;

        float t = 0.0;
        float trap = 0.0;
        float glow = 0.0;

        for (int i = 0; i < 48; i++) {
          vec3 p = ro + rd * t;
          float d = mandelbulb(p, trap);
          glow += (0.02 * u_glowMultiplier) / (abs(d) + 0.05);

          if (d < 0.003 || t > 5.0) break;
          t += d * 0.8;
        }

        float fractalFreq = clamp(trap * 1.5 + u_high * 0.6 * u_trebleSparkle, 0.0, 1.0);
        vec3 col = freqToColor(fractalFreq, 1.0, u_hueOffset);
        vec3 finalCol = glow * col * (0.8 + u_energy * 1.5);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 8: OVERDRIVE VOXEL GLITCH & TRANSIENT MATRIX
  // -------------------------------------------------------------
  {
    id: 'glitch-transient',
    title: 'OVERDRIVE GLITCH & TRANSIENT MATRIX',
    caseTag: 'CASE_08 // AUDIO OVERDRIVE & CLIPPING',
    description: 'Visual clipping & transient alarm. Snare hits trigger instantaneous RGB chromatic shear, CRT roll, and datamosh; alerts DJ to +0dB clipping visually.',
    customParams: [
      { id: 'glitchIntensity', name: 'DATAMOSH GLITCH DEPTH', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;
      uniform float u_isClipping;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_glitchIntensity;

      ${CommonGLSL}

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;

        float sliceY = floor(uv.y * 30.0);
        float sliceNoise = hash21(vec2(sliceY, floor(u_time * 20.0)));
        
        float glitchStrength = (u_transient * 0.08 + u_isClipping * 0.15) * u_glitchIntensity;
        if (sliceNoise > 0.75) {
          uv.x += (sliceNoise - 0.5) * glitchStrength;
        }

        float scanline = sin(uv.y * 600.0 + u_time * 10.0) * 0.08;
        
        vec2 grid = fract(uv * vec2(40.0, 20.0)) - 0.5;
        float charDist = length(grid);
        float matrixChar = smoothstep(0.4, 0.2, charDist);

        float rCol = (smoothstep(0.4, 0.2, length(grid + vec2(glitchStrength, 0.0)))) * (1.0 + u_subBass * 2.0 * u_bassPunch);
        float gCol = matrixChar * (0.5 + u_mid * 1.5);
        float bCol = (smoothstep(0.4, 0.2, length(grid - vec2(glitchStrength, 0.0)))) * (1.0 + u_high * 3.0 * u_trebleSparkle);

        vec3 col = (vec3(rCol, gCol, bCol) - scanline) * u_glowMultiplier;

        if (u_isClipping > 0.5) {
          col += vec3(0.8, 0.0, 0.1) * 0.6;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 9: LIQUID MERCURY AUDIO CAUSTICS (Fluid Wave Optics)
  // -------------------------------------------------------------
  {
    id: 'liquid-caustics',
    title: 'LIQUID MERCURY AUDIO CAUSTICS',
    caseTag: 'CASE_09 // FLUID SURFACE OPTICS',
    description: 'Molten reflective chrome pool bouncing light caustics. Sub-bass drives deep ocean swells, 10k-20kHz frequencies create shimmering prismatic ripples.',
    customParams: [
      { id: 'waveSpeed', name: 'CAUSTIC WAVE SPEED', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'chromeShine', name: 'CHROME SPECULAR GLOW', min: 0.5, max: 2.5, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_waveSpeed;
      uniform float u_chromeShine;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        vec2 p = uv * 6.0;
        float caustic = 0.0;

        for (int i = 1; i <= 4; i++) {
          float fi = float(i);
          vec2 waveDir = vec2(sin(u_time * 0.3 * fi), cos(u_time * 0.25 * fi));
          float speed = (u_time * (0.8 + fi * 0.3) + u_bass * 2.0 * u_bassPunch) * u_waveSpeed;
          float waveFreq = 1.8 * fi + u_high * 4.0 * u_trebleSparkle;
          
          p += waveDir * 0.3 * sin(dot(p, vec2(cos(fi), sin(fi))) * waveFreq + speed);
        }

        caustic = length(p - uv * 6.0);
        float intensity = 0.2 / (abs(caustic - 1.2) + 0.08);

        float freqRatio = clamp(intensity * 0.3 + u_high * 0.6 * u_trebleSparkle, 0.0, 1.0);
        vec3 col = freqToColor(freqRatio, 1.0 * u_glowMultiplier, u_hueOffset);

        vec3 chrome = vec3(0.9, 0.95, 1.0) * pow(intensity * 0.4, 2.0) * u_chromeShine;
        vec3 finalCol = col * intensity + chrome * (1.0 + u_air * 2.0);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  },

  // -------------------------------------------------------------
  // SHADER 10: INFINITE HYPERSPACE WARP TUNNEL
  // -------------------------------------------------------------
  {
    id: 'hyperspace-tunnel',
    title: 'INFINITE HYPERSPACE WARP TUNNEL',
    caseTag: 'CASE_10 // SPEED WARP WORMHOLE',
    description: 'Multi-lane velocity warp grid. Bass energy bends the tunnel curvature in deep scarlet; high frequencies accelerate warp star speed lines in neon ultraviolet.',
    customParams: [
      { id: 'warpVelocity', name: 'WARP TUNNEL SPEED', min: 0.5, max: 3.5, step: 0.1, default: 1.0, unit: 'x' },
      { id: 'curveBend', name: 'BASS TRAJECTORY BEND', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' }
    ],
    fragmentShader: `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_subBass;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_air;
      uniform float u_energy;
      uniform float u_transient;

      // Global & Custom Tweak Uniforms
      uniform float u_hueOffset;
      uniform float u_bassPunch;
      uniform float u_trebleSparkle;
      uniform float u_glowMultiplier;
      uniform float u_warpVelocity;
      uniform float u_curveBend;

      ${CommonGLSL}

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        vec2 curve = vec2(sin(u_time * 1.5), cos(u_time * 1.2)) * (0.15 + u_subBass * 0.4 * u_bassPunch) * u_curveBend;
        vec2 p = uv - curve;

        float r = length(p);
        float a = atan(p.y, p.x);

        float speed = u_time * (2.5 + u_energy * 4.0) * max(0.2, u_warpVelocity);
        float z = 2.0 / (r + 0.02) + speed;

        float gridA = abs(sin(a * 8.0 + u_time * 0.5));
        float gridZ = abs(sin(z * 4.0));
        float lines = smoothstep(0.85, 0.98, gridA) + smoothstep(0.85, 0.98, gridZ);

        float starDust = hash21(vec2(floor(a * 24.0), floor(z * 6.0)));
        float stars = smoothstep(0.92 - u_air * 0.1 * u_trebleSparkle, 1.0, starDust);

        float depthFreq = clamp(r * 0.5 + u_high * 0.5 * u_trebleSparkle, 0.0, 1.0);
        vec3 col = freqToColor(depthFreq, 1.0 * u_glowMultiplier, u_hueOffset);

        vec3 finalCol = (lines * col * 1.5 + stars * vec3(1.0, 0.8, 1.0) * 3.0) / (r + 0.2);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  }
];

