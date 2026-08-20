/* ==========================================================================
   THREE.JS MATERIA VISUALIZER ENGINE
   ========================================================================== */

import { state } from './state.js';
import {
    BackgroundVertexShader,
    BackgroundFragmentShader,
    MateriaVertexShader,
    MateriaFragmentShader,
    BeamVertexShader,
    BeamFragmentShader
} from './shaders.js';

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

export function initThreeJS() {
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
    
    // Define Materia base colors in state
    state.materiaColors = {
        green: new THREE.Color(0x3cf090),  // Mako / Magic
        blue: new THREE.Color(0x3a86ff),   // Elemental / Support
        red: new THREE.Color(0xef4444),    // Summon
        yellow: new THREE.Color(0xffd166)  // Command / Time
    };

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
            uColor: { value: new THREE.Color(state.materiaColors.green) } // Default to green
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

export function handleResize() {
    const container = document.querySelector('.canvas-wrapper');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (camera && renderer) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        camera.position.set(0, 0, 5.8);
    }
}

// --- LAYOUT ENGINE: 3D GRID PATTERNS ---
export function applyMateriaLayout(chapterIndex, instant = false) {
    targetThemeIndex = chapterIndex;
    
    // Clean states
    if (energyBeamMesh) {
        energyBeamMesh.visible = false;
    }
    
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
        if (energyBeamMesh) {
            energyBeamMesh.visible = true;
            energyBeamMaterial.uniforms.uColor.value.copy(state.materiaColors.green);
        }
        
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
        if (backgroundMaterial) {
            backgroundMaterial.uniforms.uTheme.value = currentThemeIndex;
        }
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
            if (state.hoveredMateria) {
                state.hoveredMateria.hoverFactor = 0.0;
            }
            state.hoveredMateria = hoveredObj;
            document.body.style.cursor = 'pointer';
        }
        hoveredObj.hoverFactor = 1.0;
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
    
    targetRotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, targetRotation.x));
    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function handleMouseUp() {
    isDragging = false;
    document.body.style.cursor = 'default';
}

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
    if (document.hidden) return;
    
    time += 0.015;
    
    if (backgroundMaterial) {
        backgroundMaterial.uniforms.uTime.value = time;
    }
    
    if (Math.abs(currentThemeIndex - targetThemeIndex) > 0.01) {
        currentThemeIndex += (targetThemeIndex - currentThemeIndex) * 0.08;
        if (backgroundMaterial) {
            backgroundMaterial.uniforms.uTheme.value = currentThemeIndex;
        }
    }
    
    if (energyBeamMesh && energyBeamMesh.visible) {
        energyBeamMaterial.uniforms.uTime.value = time;
    }
    
    if (materiaGroup) {
        currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
        currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
        materiaGroup.rotation.set(currentRotation.x, currentRotation.y, 0);
        
        if (!isDragging) {
            materiaGroup.rotation.y += 0.0015;
            targetRotation.y += 0.0015;
        }
    }
    
    materiaPool.forEach((m, idx) => {
        m.position.lerp(m.targetPosition, 0.07);
        m.currentScale += (m.targetScale - m.currentScale) * 0.09;
        
        if (m.targetScale > 0.1) {
            const floatOffset = Math.sin(time * m.orbitSpeed + m.orbitPhase) * 0.04;
            
            if (state.activeChapter === 3) {
                const angleSpeed = time * 0.25;
                const baseAngle = (idx / 12) * Math.PI * 2 + angleSpeed;
                m.targetPosition.set(1.5 * Math.cos(baseAngle), 1.5 * Math.sin(baseAngle), Math.sin(baseAngle * 2.0) * 0.2);
            }
            
            m.position.y += floatOffset;
            
            const scaleTarget = m.targetScale * (1.0 + m.hoverFactor * 0.25);
            m.scale.setScalar(scaleTarget);
        } else {
            m.scale.setScalar(m.currentScale);
        }
        
        m.material.uniforms.uColor.value.lerp(m.targetColor, 0.08);
        m.material.uniforms.uTime.value = time;
        m.material.uniforms.uHover.value += (m.hoverFactor - m.material.uniforms.uHover.value) * 0.15;
    });
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
