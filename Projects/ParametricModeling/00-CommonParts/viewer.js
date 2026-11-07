import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';

export function initThreeViewer(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`Container elements with id "${containerId}" not found`);
    }

    const scene = new THREE.Scene();
    
    // Width offset for sidebar panels
    const sidebarWidth = options.sidebarWidth ?? 420;
    const getAspect = () => (window.innerWidth - sidebarWidth) / window.innerHeight;
    const getWidth = () => window.innerWidth - sidebarWidth;
    
    const camera = new THREE.PerspectiveCamera(45, getAspect(), 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(getWidth(), window.innerHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(70, 70, 70);
    controls.update();

    // Lighting System
    scene.add(new THREE.HemisphereLight(0xffffff, 0x111827, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(100, 150, 50);
    scene.add(keyLight);

    const cyanFill = new THREE.PointLight(0x06b6d4, 2.5, 300);
    cyanFill.position.set(-50, 50, 50);
    scene.add(cyanFill);

    const pinkFill = new THREE.PointLight(0xd946ef, 2.5, 300);
    pinkFill.position.set(50, -50, -50);
    scene.add(pinkFill);

    // Ground Grid
    const grid = new THREE.GridHelper(200, 30, 0x1f2937, 0x111827);
    grid.position.y = -35;
    scene.add(grid);

    // Resize Handler
    const handleResize = () => {
        camera.aspect = getAspect();
        camera.updateProjectionMatrix();
        renderer.setSize(getWidth(), window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Viewport Mode Management
    let viewMode = 'blueprint';
    
    const setViewMode = (mode, elements = {}) => {
        viewMode = mode;
        const { btnRendered, btnBlueprint, viewportContainer } = elements;
        
        if (mode === 'blueprint') {
            if (btnBlueprint) {
                btnBlueprint.style.background = 'var(--accent-cyan)';
                btnBlueprint.style.color = '#111';
                btnBlueprint.style.borderColor = 'transparent';
            }
            if (btnRendered) {
                btnRendered.style.background = '#1f2937';
                btnRendered.style.color = 'white';
                btnRendered.style.borderColor = 'var(--border)';
            }
            if (viewportContainer) {
                viewportContainer.style.background = 'radial-gradient(circle at center, #0f2c4c 0%, #061224 100%)';
            }
        } else {
            if (btnRendered) {
                btnRendered.style.background = 'var(--accent-cyan)';
                btnRendered.style.color = '#111';
                btnRendered.style.borderColor = 'transparent';
            }
            if (btnBlueprint) {
                btnBlueprint.style.background = '#1f2937';
                btnBlueprint.style.color = 'white';
                btnBlueprint.style.borderColor = 'var(--border)';
            }
            if (viewportContainer) {
                viewportContainer.style.background = '#030712';
            }
        }
    };

    // Helper to map Manifold geometry to Three.js Mesh
    const manifoldToThreeMesh = (model, color, opacity) => {
        const m = model.getMesh();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(m.vertProperties, 3));
        g.setIndex(new THREE.Uint32BufferAttribute(m.triVerts, 1));
        g.computeVertexNormals();
        
        let mat;
        if (viewMode === 'rendered') {
            mat = new THREE.MeshPhysicalMaterial({
                color, transparent: opacity < 1, opacity,
                metalness: 0.1, roughness: 0.3, side: THREE.DoubleSide,
                transmission: opacity < 1 ? 0.6 : 0, thickness: 1.2
            });
        } else {
            mat = new THREE.MeshBasicMaterial({
                color: 0x07294d,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            });
        }
        
        const mesh = new THREE.Mesh(g, mat);
        
        if (viewMode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(g);
            const lineColor = (color === 0xf97316) ? 0xffaa00 : (color === 0x22c55e) ? 0x4ade80 : 0x00f2ff;
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2 }));
            mesh.add(line);
        }
        
        return mesh;
    };

    const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    };

    const destroy = () => {
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
    };

    return {
        scene,
        camera,
        renderer,
        controls,
        manifoldToThreeMesh,
        setViewMode,
        getViewMode: () => viewMode,
        animate,
        destroy
    };
}
