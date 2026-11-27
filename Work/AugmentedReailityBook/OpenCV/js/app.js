/**
 * OpenCV Experiment - app.js
 * Geometric CV + OCR Architecture
 */
(function () {
    'use strict';
    const THREE = window.THREE;

    const arContainer = document.getElementById('ar-container');
    const startBtn = document.getElementById('start-ar-btn');
    const statusText = document.getElementById('status-text');
    const devConsole = document.getElementById('dev-console');
    const devToggle = document.getElementById('dev-toggle');

    let arManager, renderer, scene, camera;
    let anchorGroup;
    const clock = new THREE.Clock();
    let pages = [];
    let activePageIndex = 0;
    const pageModels = new Map();

    async function init() {
        const res = await fetch('../app/pages.json');
        const data = await res.json();
        pages = data.pages || [];

        // Setup Dev UI
        devToggle.onclick = () => devConsole.classList.toggle('open');
        devConsole.innerHTML = `<div style="padding:10px; color:#6ee7b7; font-weight:bold; font-size:12px;">OPENCV EXPERIMENT</div>`;

        // Three.js Setup
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0, 0);
        arContainer.appendChild(renderer.domElement);

        anchorGroup = new THREE.Group();
        scene.add(anchorGroup);

        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dl = new THREE.DirectionalLight(0xffffff, 1.5);
        dl.position.set(1, 5, 3); scene.add(dl);

        // CV Manager Setup
        arManager = new ARManager(scene, camera, renderer);
        arManager.onPoseUpdate = (pose) => {
            anchorGroup.position.copy(pose.position);
            anchorGroup.quaternion.copy(pose.quaternion);
            anchorGroup.visible = true;
            statusText.textContent = 'TRACKING: ' + (pages[activePageIndex]?.label || 'BOOK');
        };

        statusText.textContent = 'READY — TAP START';
    }

    async function switchPage(index) {
        activePageIndex = index;
        anchorGroup.children.forEach(c => c.visible = false);

        if (pageModels.has(index)) {
            pageModels.get(index).visible = true;
        } else {
            const p = pages[index];
            const loader = new THREE.GLTFLoader();
            // Note the path back to the parent directory for models
            const modelPath = p.model.src.startsWith('../') ? '../app/' + p.model.src.substring(3) : '../app/' + p.model.src;
            loader.load(modelPath, (gltf) => {
                const model = gltf.scene;
                const scale = p.model.scale || 0.355;
                model.scale.set(scale, scale, scale);
                pageModels.set(index, model);
                anchorGroup.add(model);
            });
        }
    }

    startBtn.onclick = async () => {
        startBtn.classList.add('hidden');
        statusText.textContent = 'STARTING CAMERA...';
        try {
            await arManager.start();
            statusText.textContent = 'SCANNING FOR BOOK...';
            // Initial page load
            switchPage(0);
            renderer.setAnimationLoop(render);
        } catch (err) {
            statusText.textContent = 'CAMERA ERROR';
            console.error(err);
        }
    };

    function render() {
        renderer.render(scene, camera);
    }

    init();
})();
