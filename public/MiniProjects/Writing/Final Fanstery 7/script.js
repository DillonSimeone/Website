/* ==========================================================================
   THE MATERIA RESONANCE - INTERACTIVE WEBGL & LOGIC
   ========================================================================== */

// --- GLOBAL STATE ---
const state = {
    activeChapter: 0,
    fontSizeScale: 1.0,
    focusMode: false,
    webGLAvailable: true,
    hoveredMateria: null,
    baseMetrics: {
        0: { input: "12.0 J", output: "15.8 J", coeff: "131.6%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00% (STABLE)" },
        1: { input: "4.2 kW", output: "18.7 kW", coeff: "445.2%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00% (STABLE)" },
        2: { input: "75.0 W", output: "74.0 kW", coeff: "98666%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00% (STABLE)" },
        3: { input: "12.0 J", output: "∞", coeff: "∞%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00% (STABLE)" }
    }
};

// --- MARKDOWN LOADER & PARSER ---
const chaptersCache = {};

async function loadChapterContent(chapterIndex) {
    const readerContent = document.getElementById('reader-content');
    
    // Smooth transition: fade out first
    readerContent.classList.add('fade-out');
    
    // If cache is empty, fetch the file
    if (!chaptersCache[chapterIndex]) {
        try {
            const response = await fetch(`${chapterIndex}.md`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            let markdownText = await response.text();
            
            // Standardize log headers: Prepend primary title to Chapter 0, ensure others are H1
            if (chapterIndex === 0) {
                markdownText = `# The Genesis of Overunity\n\n${markdownText}`;
            } else {
                const lines = markdownText.split('\n');
                if (lines[0].trim() && !lines[0].trim().startsWith('#')) {
                    lines[0] = `# ${lines[0].trim()}`;
                    markdownText = lines.join('\n');
                }
            }
            
            // Parse Markdown to HTML via Marked.js
            let htmlContent = marked.parse(markdownText);
            
            // Post-process to style Roman numeral sections nicely
            htmlContent = htmlContent.replace(
                /<h2>([IVXLCDM]+)\.\s*(.*?)<\/h2>/gi, 
                '<h2><span class="roman-num font-mono">$1.</span> $2</h2>'
            );
            
            // Post-process to wrap isolated thermodynamic formulas in nice layout blocks
            htmlContent = htmlContent.replace(
                /<p>Pout\u200B&gt;Pin\u200B<\/p>/gi,
                '<div class="formula-block font-mono text-accent-green">P<sub>out</sub> &gt; P<sub>in</sub></div>'
            );
            htmlContent = htmlContent.replace(
                /<p>W=ΔE<\/p>/gi,
                '<div class="formula-block font-mono text-accent-blue">W = &Delta;E</div>'
            );
            
            chaptersCache[chapterIndex] = htmlContent;
        } catch (error) {
            console.error('Error loading markdown chapter:', error);
            readerContent.innerHTML = `
                <div class="error-block font-mono">
                    <span class="text-accent-red">LOG EXHAUSTION ERROR [0x442]</span>
                    <p class="text-sm mt-2">Failed to retrieve research files for Chapter ${chapterIndex}. Ensure database is active.</p>
                </div>
            `;
            readerContent.classList.remove('fade-out');
            return;
        }
    }

    // Delay content replacement slightly to match opacity transition
    setTimeout(() => {
        readerContent.innerHTML = chaptersCache[chapterIndex];
        
        // Setup accessibility attributes
        readerContent.setAttribute('aria-labelledby', `tab-${chapterIndex}`);
        
        // Scroll viewport back to top
        document.querySelector('.reader-viewport').scrollTop = 0;
        
        // Fade in
        readerContent.classList.remove('fade-out');
    }, 150);
}

// --- HUD INSTRUMENT REFRESHER ---
let hudInterval = null;

function updateHUDMetrics(chapterIndex) {
    const metrics = state.baseMetrics[chapterIndex];
    const inputEl = document.getElementById('hud-input');
    const outputEl = document.getElementById('hud-output');
    const coeffEl = document.getElementById('hud-coeff');
    const firstLawEl = document.querySelector('.metrics-grid .metric-box:nth-child(1) .metric-status');
    const secondLawEl = document.querySelector('.metrics-grid .metric-box:nth-child(2) .metric-status');
    const lifestreamEl = document.querySelector('.metrics-grid .metric-box:nth-child(3) .metric-status');
    const readerViewport = document.querySelector('.reader-viewport');

    // Update texts
    inputEl.textContent = metrics.input;
    outputEl.textContent = metrics.output;
    coeffEl.textContent = metrics.coeff;
    firstLawEl.textContent = metrics.status1;
    secondLawEl.textContent = metrics.status2;
    lifestreamEl.textContent = metrics.status3;

    // Reset indicator classes
    inputEl.className = 'hud-value';
    outputEl.className = 'hud-value';
    coeffEl.className = 'hud-value';
    readerViewport.className = 'reader-viewport';

    // Apply colors depending on active chapter theme
    if (chapterIndex === 0) {
        inputEl.classList.add('text-accent-green');
        outputEl.classList.add('text-accent-green');
        coeffEl.classList.add('text-accent-green');
        readerViewport.classList.add('theme-green');
    } else if (chapterIndex === 1) {
        inputEl.classList.add('text-accent-blue');
        outputEl.classList.add('text-accent-blue');
        coeffEl.classList.add('text-accent-blue');
        readerViewport.classList.add('theme-blue');
    } else if (chapterIndex === 2) {
        inputEl.classList.add('text-accent-red');
        outputEl.classList.add('text-accent-red');
        coeffEl.classList.add('text-accent-red');
        readerViewport.classList.add('theme-red');
    } else if (chapterIndex === 3) {
        inputEl.classList.add('text-accent-yellow');
        outputEl.classList.add('text-accent-yellow');
        coeffEl.classList.add('text-accent-yellow');
        readerViewport.classList.add('theme-yellow');
    }

    // Add high-tech flickering variance to output statistics when loop is active
    if (hudInterval) clearInterval(hudInterval);
    hudInterval = setInterval(() => {
        // Only jitter numeric, non-infinite outputs
        if (metrics.output !== "∞" && !state.focusMode) {
            const baseVal = parseFloat(metrics.output);
            const unit = metrics.output.replace(/[0-9.]/g, '');
            // Let's add a small random fluctuation (+/- 1.5%)
            const jitter = baseVal * (1 + (Math.random() - 0.5) * 0.03);
            
            // Jitter coefficient proportionally
            const baseCoeff = parseFloat(metrics.coeff);
            const coeffJitter = baseCoeff * (1 + (Math.random() - 0.5) * 0.015);

            outputEl.textContent = jitter.toFixed(1) + unit;
            coeffEl.textContent = coeffJitter.toFixed(1) + "%";
            
            // If user is hovering a node, boost metrics to simulate active resonance stimulation
            if (state.hoveredMateria) {
                const boost = 1.25;
                outputEl.textContent = (jitter * boost).toFixed(1) + unit;
                coeffEl.textContent = (coeffJitter * boost).toFixed(1) + "%";
            }
        }
    }, 250);
}

// --- FONT RESIZER ---
function adjustFontSize(dir) {
    if (dir === 'inc' && state.fontSizeScale < 1.5) {
        state.fontSizeScale += 0.1;
    } else if (dir === 'dec' && state.fontSizeScale > 0.8) {
        state.fontSizeScale -= 0.1;
    }
    
    document.documentElement.style.setProperty('--font-scale', state.fontSizeScale);
    document.querySelector('.font-size-indicator').textContent = `${Math.round(state.fontSizeScale * 100)}%`;
}

// --- FOCUS MODE TOGGLE ---
function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    const body = document.body;
    
    if (state.focusMode) {
        body.classList.add('focus-mode');
        
        // Add a floating close button specifically for focus mode
        const closeBtn = document.createElement('button');
        closeBtn.className = 'focus-close-btn font-mono';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Exit Focus Mode';
        closeBtn.setAttribute('aria-label', 'Exit Focus Mode');
        closeBtn.addEventListener('click', toggleFocusMode);
        document.body.appendChild(closeBtn);
    } else {
        body.classList.remove('focus-mode');
        const closeBtn = document.querySelector('.focus-close-btn');
        if (closeBtn) closeBtn.remove();
    }

    // Force layout resizing of WebGL canvas
    triggerCanvasResize();
}

function triggerCanvasResize() {
    if (window.onWebGLResize) window.onWebGLResize();
}

// --- THREE.JS SHADER EXPERIMENTATION ---

// 1. Shaders: Background swirl (Mako energy flow)
const BackgroundVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const BackgroundFragmentShader = `
    uniform float uTime;
    uniform float uTheme; // 0.0: Green, 1.0: Blue, 2.0: Red, 3.0: Yellow
    varying vec2 vUv;

    // Fast pseudo-random noise
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // Simple value noise
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }

    // Fractal Brownian Motion
    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
        vec2 p = vUv - 0.5;
        
        // Calculate length and angles
        float r = length(p);
        float theta = atan(p.y, p.x);
        
        // Use periodic inputs to avoid atan jump seam (discontinuity going left from center)
        float angleNoise = sin(theta * 2.0 - uTime * 0.5) * 0.2 + cos(theta - uTime * 0.3) * 0.15;
        vec2 flowUv = vec2(r * 3.0 - uTime * 0.05, angleNoise + r * 1.5);
        float n = fbm(flowUv * 6.0);
        
        // Refine flow logic
        float intensity = smoothstep(0.1, 0.7, n) * (1.0 - r * 1.3);
        
        // Color palettes corresponding to Sephiroth's Materia types:
        // Theme 0: Green (Mako/Life)
        vec3 colGreen = mix(vec3(0.01, 0.03, 0.06), vec3(0.1, 0.45, 0.28), intensity);
        // Theme 1: Blue (Magic/Aether)
        vec3 colBlue = mix(vec3(0.01, 0.02, 0.07), vec3(0.15, 0.35, 0.75), intensity);
        // Theme 2: Red (Summon/Core)
        vec3 colRed = mix(vec3(0.04, 0.01, 0.03), vec3(0.7, 0.15, 0.15), intensity);
        // Theme 3: Yellow (Support/Time)
        vec3 colYellow = mix(vec3(0.04, 0.03, 0.01), vec3(0.65, 0.48, 0.15), intensity);
        
        // Interpolate palettes based on the uTheme float
        vec3 color;
        if (uTheme < 1.0) {
            color = mix(colGreen, colBlue, uTheme);
        } else if (uTheme < 2.0) {
            color = mix(colBlue, colRed, uTheme - 1.0);
        } else {
            color = mix(colRed, colYellow, clamp(uTheme - 2.0, 0.0, 1.0));
        }
        
        // Add vignette shadow around screen edges
        float vignette = smoothstep(0.9, 0.4, length(vUv - 0.5));
        color *= vignette;
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

// 2. Shaders: Glowing Refractive Materia Gems
const MateriaVertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;
    void main() {
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const MateriaFragmentShader = `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uHover;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Fresnel reflection factor (rim light glow)
        float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        
        // Simulating internal Mako crystal patterns via sine combinations
        float swirl = sin(vPosition.x * 6.0 + uTime * 2.0) * 
                      cos(vPosition.y * 6.0 - uTime * 1.5) * 
                      sin(vPosition.z * 6.0 + uTime * 0.7);
        swirl = swirl * 0.5 + 0.5;
        
        // Expand core colors when hovered
        float scale = mix(0.4, 0.75, uHover);
        vec3 coreColor = mix(uColor * scale, uColor * (scale + 0.3), swirl);
        
        // Edge glowing ring
        vec3 edgeGlow = (rim * uColor * 1.8) * (1.0 + uHover * 0.5);
        
        // Specular highlight dot (simulated light reflection)
        vec3 lightDirection = normalize(vec3(1.0, 1.5, 0.8));
        vec3 halfDir = normalize(lightDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
        vec3 specular = vec3(spec * 0.85);

        vec3 finalColor = coreColor + edgeGlow + specular;
        gl_FragColor = vec4(finalColor, 0.9);
    }
`;

// 3. Shaders: Glowing energy beam for Chapter 2
const BeamVertexShader = `
    varying vec2 vUv;
    varying float vHeight;
    void main() {
        vUv = uv;
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const BeamFragmentShader = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying float vHeight;
    void main() {
        // Vertical scanning line texture
        float beamGlow = sin(vUv.x * 3.14159); // Rounded shape
        float pulses = sin(vHeight * 3.0 - uTime * 10.0) * 0.5 + 0.5;
        
        vec3 color = uColor * (0.8 + 0.4 * pulses) * beamGlow;
        float alpha = beamGlow * 0.45 * (1.0 - abs(vHeight) / 5.0); // Fades toward ends
        
        gl_FragColor = vec4(color, alpha);
    }
`;

// --- THREE.JS CORE ENGINE INITIALIZATION ---
let renderer, scene, camera, bgMesh, backgroundMaterial;
let materiaGroup, materiaPool = [];
let energyBeamMesh, energyBeamMaterial;
let time = 0.0;
let targetThemeIndex = 0.0;
let currentThemeIndex = 0.0;

// Interactive drag state
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let currentRotation = { x: 0.2, y: -0.4 };
let targetRotation = { x: 0.2, y: -0.4 };

// Raycaster for Hover detection
const raycaster = new THREE.Raycaster();
const mouseCoords = new THREE.Vector2();

function initThreeJS() {
    const canvas = document.getElementById('canvas3d');
    const container = document.querySelector('.canvas-wrapper');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Create Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    
    // Create Scene & Camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);
    
    // 1. Create Background plane running the custom Mako Swirl shader
    backgroundMaterial = new THREE.ShaderMaterial({
        vertexShader: BackgroundVertexShader,
        fragmentShader: BackgroundFragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uTheme: { value: 0.0 }
        },
        depthWrite: false,
        depthTest: false
    });
    
    const bgGeometry = new THREE.PlaneGeometry(2, 2);
    bgMesh = new THREE.Mesh(bgGeometry, backgroundMaterial);
    scene.add(bgMesh);
    
    // 2. Create the Materia Group
    materiaGroup = new THREE.Group();
    materiaGroup.rotation.set(currentRotation.x, currentRotation.y, 0);
    scene.add(materiaGroup);
    
    // 3. Create a glowing center beam (inactive by default, used in chapter 2)
    energyBeamMaterial = new THREE.ShaderMaterial({
        vertexShader: BeamVertexShader,
        fragmentShader: BeamFragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uColor: { value: new THREE.Color(state.baseMetrics[2].colorHex) }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 10, 16, 1, true);
    energyBeamMesh = new THREE.Mesh(beamGeo, energyBeamMaterial);
    energyBeamMesh.visible = false;
    materiaGroup.add(energyBeamMesh);

    // 4. Populate Materia Sphere Pool (Maximum of 35 items)
    // We instantiate them once, then morph their positions/scales/colors
    const sphereGeo = new THREE.SphereGeometry(0.24, 32, 32);
    
    for (let i = 0; i < 35; i++) {
        const mat = new THREE.ShaderMaterial({
            vertexShader: MateriaVertexShader,
            fragmentShader: MateriaFragmentShader,
            uniforms: {
                uColor: { value: new THREE.Color(0x3cf090) },
                uTime: { value: 0.0 },
                uHover: { value: 0.0 }
            },
            transparent: true,
            depthWrite: true
        });
        
        const mesh = new THREE.Mesh(sphereGeo, mat);
        
        // Custom properties for Lerp transitions
        mesh.targetPosition = new THREE.Vector3(0, 0, 0);
        mesh.targetScale = 0.0; // Initially hidden
        mesh.currentScale = 0.0;
        mesh.targetColor = new THREE.Color(0x3cf090);
        mesh.hoverFactor = 0.0;
        mesh.materiaType = 'green';
        mesh.orbitPhase = Math.random() * Math.PI * 2;
        mesh.orbitSpeed = 0.5 + Math.random() * 0.5;
        
        mesh.scale.setScalar(0.0);
        materiaGroup.add(mesh);
        materiaPool.push(mesh);
    }
    
    // Define Materia base colors
    state.materiaColors = {
        green: new THREE.Color(0x3cf090),  // Mako / Magic
        blue: new THREE.Color(0x3a86ff),   // Elemental / Support
        red: new THREE.Color(0xef4444),    // Summon
        yellow: new THREE.Color(0xffd166)  // Command / Time
    };

    // Configure layout configuration based on current chapter
    applyMateriaLayout(0, true);
    
    // Set resize listener
    window.onWebGLResize = handleResize;
    window.addEventListener('resize', handleResize);
    
    // Drag listeners on canvas
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    // Touch support
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    // Kick off animation loop
    animate();
}

function handleResize() {
    const container = document.querySelector('.canvas-wrapper');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    
    // Position camera focused inside the card bounds
    camera.position.set(0, 0, 5.8);
}

// --- LAYOUT ENGINE: 3D GRID PATTERNS ---
function applyMateriaLayout(chapterIndex, instant = false) {
    targetThemeIndex = chapterIndex;
    
    // Clean states
    energyBeamMesh.visible = false;
    
    // Build geometric configurations (scaled down to fit card viewer)
    if (chapterIndex === 0) {
        // CHAPTER 0: Rhombus (4 key elements)
        const coords = [
            { pos: new THREE.Vector3(-1.0, 0, 0), color: state.materiaColors.green, type: 'green' },  // Elemental Left
            { pos: new THREE.Vector3(1.0, 0, 0), color: state.materiaColors.blue, type: 'blue' },    // Support Right
            { pos: new THREE.Vector3(0, 1.0, 0), color: state.materiaColors.red, type: 'red' },      // Revive/HP Top
            { pos: new THREE.Vector3(0, -1.0, 0), color: state.materiaColors.yellow, type: 'yellow' } // Time/Magic Bottom
        ];
        
        materiaPool.forEach((m, idx) => {
            if (idx < coords.length) {
                m.targetPosition.copy(coords[idx].pos);
                m.targetScale = 1.0;
                m.targetColor.copy(coords[idx].color);
                m.materiaType = coords[idx].type;
            } else {
                m.targetScale = 0.0;
            }
        });
    } 
    else if (chapterIndex === 1) {
        // CHAPTER 1: Divergence (Fibonacci Spiral mandala)
        const count = 22;
        const phi = (Math.sqrt(5) + 1) / 2;
        const goldenAngle = (2 - phi) * 2 * Math.PI;
        
        materiaPool.forEach((m, idx) => {
            if (idx < count) {
                const r = 0.32 * Math.sqrt(idx + 1); // spiral radius
                const theta = idx * goldenAngle;
                m.targetPosition.set(r * Math.cos(theta), r * Math.sin(theta), (idx - count/2) * 0.04);
                m.targetScale = 0.65;
                
                // Color mapping: random scatter of standard materia orbs
                let col;
                const rng = idx % 4;
                if (rng === 0) col = state.materiaColors.green;
                else if (rng === 1) col = state.materiaColors.blue;
                else if (rng === 2) col = state.materiaColors.red;
                else col = state.materiaColors.yellow;
                
                m.targetColor.copy(col);
            } else {
                m.targetScale = 0.0;
            }
        });
    } 
    else if (chapterIndex === 2) {
        // CHAPTER 2: The Labyrinth (Concentric rings + central laser beam)
        const ring1 = 6;
        const ring2 = 12;
        const ring3 = 14;
        const total = ring1 + ring2 + ring3;
        
        // Enable central energy beam
        energyBeamMesh.visible = true;
        energyBeamMaterial.uniforms.uColor.value.copy(state.materiaColors.green);
        
        materiaPool.forEach((m, idx) => {
            if (idx < total) {
                m.targetScale = 0.55;
                
                if (idx < ring1) {
                    const angle = (idx / ring1) * Math.PI * 2;
                    m.targetPosition.set(0.7 * Math.cos(angle), 0.7 * Math.sin(angle), -0.1);
                    m.targetColor.copy(state.materiaColors.green); // Internal Ring is green
                } 
                else if (idx < ring1 + ring2) {
                    const localIdx = idx - ring1;
                    const angle = (localIdx / ring2) * Math.PI * 2;
                    m.targetPosition.set(1.3 * Math.cos(angle), 1.3 * Math.sin(angle), 0.05);
                    m.targetColor.copy(state.materiaColors.yellow); // Command Ring
                } 
                else {
                    const localIdx = idx - ring1 - ring2;
                    const angle = (localIdx / ring3) * Math.PI * 2;
                    m.targetPosition.set(1.9 * Math.cos(angle), 1.9 * Math.sin(angle), -0.05);
                    // Scatter red/blue on outer borders
                    m.targetColor.copy(localIdx % 2 === 0 ? state.materiaColors.red : state.materiaColors.blue);
                }
            } else {
                m.targetScale = 0.0;
            }
        });
    } 
    else if (chapterIndex === 3) {
        // CHAPTER 3: Circle of Grace (Floating Orbiting Ring of 12)
        const ringSize = 12;
        
        materiaPool.forEach((m, idx) => {
            if (idx < ringSize) {
                const angle = (idx / ringSize) * Math.PI * 2;
                m.targetPosition.set(1.5 * Math.cos(angle), 1.5 * Math.sin(angle), 0);
                m.targetScale = 0.9;
                
                // Pure color distribution (3 of each type)
                let col;
                const sect = idx % 4;
                if (sect === 0) col = state.materiaColors.green;
                else if (sect === 1) col = state.materiaColors.blue;
                else if (sect === 2) col = state.materiaColors.red;
                else col = state.materiaColors.yellow;
                
                m.targetColor.copy(col);
            } else {
                m.targetScale = 0.0;
            }
        });
    }

    // Apply instantaneously if requested (on startup)
    if (instant) {
        materiaPool.forEach(m => {
            m.position.copy(m.targetPosition);
            m.scale.setScalar(m.targetScale);
            m.currentScale = m.targetScale;
            m.material.uniforms.uColor.value.copy(m.targetColor);
        });
        currentThemeIndex = targetThemeIndex;
        backgroundMaterial.uniforms.uTheme.value = currentThemeIndex;
    }
}

// --- INTERACTIVE EVENT LISTENERS ---

function handleMouseDown(e) {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function handleMouseMove(e) {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    
    // 1. Raycast hover check relative to WebGL canvas rect bounds
    mouseCoords.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseCoords.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouseCoords, camera);
    const intersects = raycaster.intersectObjects(materiaPool.filter(m => m.currentScale > 0.1));
    
    if (intersects.length > 0) {
        const hoveredObj = intersects[0].object;
        if (state.hoveredMateria !== hoveredObj) {
            // Restore previous
            if (state.hoveredMateria) {
                state.hoveredMateria.hoverFactor = 0.0;
            }
            state.hoveredMateria = hoveredObj;
            document.body.style.cursor = 'pointer';
        }
        hoveredObj.hoverFactor = 1.0; // Trigger hover effect
    } else {
        if (state.hoveredMateria) {
            state.hoveredMateria.hoverFactor = 0.0;
            state.hoveredMateria = null;
        }
        document.body.style.cursor = isDragging ? 'grabbing' : 'default';
    }

    // 2. Drag rotation
    if (!isDragging) return;
    
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    
    targetRotation.y += deltaX * 0.005;
    targetRotation.x += deltaY * 0.005;
    
    // Clamp vertical rotation
    targetRotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, targetRotation.x));
    
    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function handleMouseUp() {
    isDragging = false;
    document.body.style.cursor = 'default';
}

// Touch Event Handlers
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
}

function handleTouchMove(e) {
    if (!isDragging || e.touches.length !== 1) return;
    
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    
    // Prevent scrolling when interacting with canvas
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
    
    const deltaX = clientX - previousMousePosition.x;
    const deltaY = clientY - previousMousePosition.y;
    
    targetRotation.y += deltaX * 0.007;
    targetRotation.x += deltaY * 0.007;
    
    targetRotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, targetRotation.x));
    
    previousMousePosition = { x: clientX, y: clientY };
}

function handleTouchEnd() {
    isDragging = false;
}

// --- RENDER & ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    
    // Check if browser tab is active. If backgrounded, skip calculations to save CPU/battery
    if (document.hidden) return;
    
    time += 0.015;
    
    // 1. Time ticks to background shader
    backgroundMaterial.uniforms.uTime.value = time;
    
    // Smoothly interpolate background shader palette
    if (Math.abs(currentThemeIndex - targetThemeIndex) > 0.01) {
        currentThemeIndex += (targetThemeIndex - currentThemeIndex) * 0.08;
        backgroundMaterial.uniforms.uTheme.value = currentThemeIndex;
    }
    
    // Update cylinder energy beam shader uniforms if visible
    if (energyBeamMesh.visible) {
        energyBeamMaterial.uniforms.uTime.value = time;
    }
    
    // 2. Smoothly rotate group based on mouse drag (easing)
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
    materiaGroup.rotation.set(currentRotation.x, currentRotation.y, 0);
    
    // Gentle floating wave rotation when idle
    if (!isDragging) {
        materiaGroup.rotation.y += 0.0015;
        targetRotation.y += 0.0015;
    }
    
    // 3. Update individually pooled Materia spheres (Lerping positions, scales, colors)
    materiaPool.forEach((m, idx) => {
        // Lerp position
        m.position.lerp(m.targetPosition, 0.07);
        
        // Lerp scale
        m.currentScale += (m.targetScale - m.currentScale) * 0.09;
        
        // Add individual organic hover floating offset when fully scaled in
        if (m.targetScale > 0.1) {
            // Apply slight vertical vibration offset
            const floatOffset = Math.sin(time * m.orbitSpeed + m.orbitPhase) * 0.04;
            
            // Under Chapter 3 (Grace/Orbit), calculate ring orbital rotation
            if (state.activeChapter === 3) {
                const angleSpeed = time * 0.25;
                const baseAngle = (idx / 12) * Math.PI * 2 + angleSpeed;
                m.targetPosition.set(1.5 * Math.cos(baseAngle), 1.5 * Math.sin(baseAngle), Math.sin(baseAngle * 2.0) * 0.2);
            }
            
            // Adjust sphere mesh position (lerped pos + float offset)
            m.position.y += floatOffset;
            
            // Lerp hover effects
            const scaleTarget = m.targetScale * (1.0 + m.hoverFactor * 0.25);
            m.scale.setScalar(scaleTarget);
        } else {
            m.scale.setScalar(m.currentScale);
        }
        
        // Lerp color
        m.material.uniforms.uColor.value.lerp(m.targetColor, 0.08);
        
        // Send timer and hover state to uniforms
        m.material.uniforms.uTime.value = time;
        m.material.uniforms.uHover.value += (m.hoverFactor - m.material.uniforms.uHover.value) * 0.15;
    });
    
    renderer.render(scene, camera);
}

// --- INITIALIZE PAGE LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Install Marked.js options
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true
        });
    } else {
        console.error("Marked.js is not loaded.");
    }
    
    // 2. Setup font resizer listeners
    document.getElementById('btn-inc-font').addEventListener('click', () => adjustFontSize('inc'));
    document.getElementById('btn-dec-font').addEventListener('click', () => adjustFontSize('dec'));
    
    // 3. Setup focus mode listeners
    document.getElementById('btn-focus').addEventListener('click', toggleFocusMode);
    
    // 4. Setup tab buttons click listeners
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chapterIndex = parseInt(btn.getAttribute('data-chapter'));
            if (state.activeChapter === chapterIndex) return;
            
            // Update Tab states
            tabBtns.forEach(b => {
                b.classList.remove('active', 'theme-green', 'theme-blue', 'theme-red', 'theme-yellow');
                b.setAttribute('aria-selected', 'false');
            });
            
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            
            // Apply thematic colors to active buttons
            const themeClasses = ['theme-green', 'theme-blue', 'theme-red', 'theme-yellow'];
            btn.classList.add(themeClasses[chapterIndex]);
            
            // Update global state
            state.activeChapter = chapterIndex;
            
            // Trigger log retrieval
            loadChapterContent(chapterIndex);
            
            // Update stats
            updateHUDMetrics(chapterIndex);
            
            // Update 3D visualizer
            if (state.webGLAvailable) {
                applyMateriaLayout(chapterIndex);
            }
        });
    });

    // 5. Initialize WebGL
    try {
        initThreeJS();
        handleResize();
    } catch (e) {
        console.warn("WebGL not supported or failed to load. Falling back to background gradient.", e);
        state.webGLAvailable = false;
        document.getElementById('canvas3d').style.display = 'none';
        // Add a generic stylesheet class to accommodate styling fallback
        document.body.classList.add('webgl-disabled');
    }

    // 6. Trigger first chapter load & initialize HUD
    // Set first tab theme class
    tabBtns[0].classList.add('theme-green');
    loadChapterContent(0);
    updateHUDMetrics(0);
});
