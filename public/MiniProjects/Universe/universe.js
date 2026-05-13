import * as THREE from 'three';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

// --- Configuration & Constants ---
const EXT_MAP = {
    '.js': 'js', '.ts': 'js', '.jsx': 'js', '.tsx': 'js', '.json': 'js',
    '.css': 'css', '.scss': 'css', '.less': 'css',
    '.html': 'html', '.htm': 'html',
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.svg': 'image', '.gif': 'image', '.ico': 'image',
    '.mp4': 'video', '.webm': 'video', '.mov': 'video'
};

const SETTINGS = {};

class InstancedBuilding {
    constructor(source, materialOrMax, maxInstances) {
        this.meshes = [];
        this.isSpinning = false;
        
        const instanced = new THREE.InstancedMesh(source, materialOrMax, maxInstances);
        instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instanced.count = 0; // CRITICAL: Start at 0 so template instances don't show at (0,0,0)
        instanced.userData.nodes = new Array(maxInstances);
        this.meshes.push(instanced);
        this.count = 0;
        this.dummy = new THREE.Object3D();
        this.instanceData = []; // Store for animations
    }
    
    addInstance(x, y, z, scaleY, angle, node, color) {
        this.dummy.position.set(x, y, z);
        this.dummy.scale.set(1, scaleY, 1);
        this.dummy.rotation.y = angle;
        this.dummy.updateMatrix();
        
        this.instanceData.push({ x, y, z, scaleY, angle });

        this.meshes.forEach(m => {
            m.setMatrixAt(this.count, this.dummy.matrix);
            if (node) m.userData.nodes[this.count] = node;
            if (color) {
                m.setColorAt(this.count, color);
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            }
            m.count = this.count + 1; // Update the actual draw count
        });
        this.count++;
    }
    
    addToScene(scene) {
        this.meshes.forEach(m => {
            m.count = this.count; 
            scene.add(m);
        });
    }

    getMeshes() {
        return this.meshes;
    }
}

class Universe {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.fileNodes = [];
        this.meshes = [];
        this.mediaObjects = [];
        this.animatedMediaObjects = [];
        this.uploadQueue = []; // Budgeted GPU uploads per frame
        this.instancedModels = { commercial: [], industrial: [], suburban: [], park: [] };
        
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        
        this.initScene();
        this.bootstrap();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(50, 40, 50);

        this.blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1); // Performance priority
        this.container.appendChild(this.renderer.domElement);

        // Official FlyControls
        this.controls = new FlyControls(this.camera, this.renderer.domElement);
        this.controls.movementSpeed = 30;
        this.controls.rollSpeed = Math.PI / 8;
        this.controls.autoForward = false;
        this.controls.dragToLook = true;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight.position.set(100, 200, 50);
        this.scene.add(directionalLight);

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
        this.renderer.domElement.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        window.addEventListener('resize', () => this.onWindowResize());
        
        document.getElementById('zoom-btn').addEventListener('click', () => {
            if (this.selectedNode) this.zoomTo(this.selectedNode);
        });

        this.selectedNode = null;
        this.zoomTarget = null; // { pos, lookAt }

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            // Hotkeys cleared
        });

        // Mobile UI Controls
        const moveMap = {
            'btn-w': 'forward', 'btn-a': 'left', 'btn-s': 'back', 'btn-d': 'right',
            'btn-r': 'up', 'btn-f': 'down', 'btn-q': 'rollLeft', 'btn-e': 'rollRight'
        };

        Object.keys(moveMap).forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const stateKey = moveMap[id];
                const press = (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    this.controls.moveState[stateKey] = 1; 
                    if (typeof this.controls.updateMovementVector === 'function') this.controls.updateMovementVector(); 
                    if (typeof this.controls.updateRotationVector === 'function') this.controls.updateRotationVector(); 
                };
                const release = (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    this.controls.moveState[stateKey] = 0; 
                    if (typeof this.controls.updateMovementVector === 'function') this.controls.updateMovementVector(); 
                    if (typeof this.controls.updateRotationVector === 'function') this.controls.updateRotationVector(); 
                };
                
                btn.addEventListener('touchstart', press, {passive: false});
                btn.addEventListener('touchend', release, {passive: false});
                btn.addEventListener('mousedown', press);
                btn.addEventListener('mouseup', release);
                btn.addEventListener('mouseleave', release);
            }
        });

        // Touch look-around simulation for FlyControls
        let touchDoubleTapTimer = null;
        this.renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault(); // Prevent native mouse events from firing
                
                const touch = e.touches[0];
                this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
                
                // Simulate mousedown for FlyControls dragToLook
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0,
                    bubbles: true
                });
                this.renderer.domElement.dispatchEvent(mouseEvent);

                // Handle tap vs double tap
                if (!touchDoubleTapTimer) {
                    touchDoubleTapTimer = setTimeout(() => {
                        touchDoubleTapTimer = null;
                        this.onClick(e);
                    }, 300);
                } else {
                    clearTimeout(touchDoubleTapTimer);
                    touchDoubleTapTimer = null;
                    this.onDoubleClick(e);
                }
            }
        }, {passive: false});

        this.renderer.domElement.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault(); // Prevent scrolling
                const touch = e.touches[0];
                this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
                
                const mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0,
                    bubbles: true
                });
                this.renderer.domElement.dispatchEvent(mouseEvent);
            }
        }, {passive: false});

        this.renderer.domElement.addEventListener('touchend', (e) => {
            const mouseEvent = new MouseEvent('mouseup', {
                button: 0,
                bubbles: true
            });
            this.renderer.domElement.dispatchEvent(mouseEvent);
        }, {passive: false});
    }

    async bootstrap() {
        try {
            const response = await fetch('universe-data.json');
            if (!response.ok) throw new Error("Data not found.");
            const data = await response.json();
            
            // Extract flat nodes
            const flatNodes = [];
            const traverse = (node, depth) => {
                if (!node || typeof node !== 'object') return;
                node.depth = depth;
                if (node.type === 'file') flatNodes.push(node);
                if (node.children) {
                    const children = Array.isArray(node.children) ? node.children : [node.children];
                    children.forEach(child => traverse(child, depth + 1));
                }
            };
            data.forEach(rootNode => traverse(rootNode, 0));
            this.fileNodes = flatNodes;

            this.createCity();
            
            setTimeout(() => {
                document.getElementById('loading-screen').classList.add('fade-out');
            }, 500);

            this.animate();
        } catch (error) {
            console.error('Universe construction failed:', error);
            document.querySelector('#loading-screen p').textContent = "ERROR: RUN SCANUNIVERSE.BAT FIRST";
            document.querySelector('.spinner').style.borderTopColor = "#ff0000";
        }
    }



    createCity() {
        // 1. Group by Parent Folders
        const folders = {}; 
        this.fileNodes.forEach(node => {
            const parts = node.path.split('/');
            parts.pop();
            const parentPath = parts.join('/');
            if (!folders[parentPath]) folders[parentPath] = [];
            folders[parentPath].push(node);
        });

        // 2. Zone by Density
        const districts = Object.keys(folders).map(path => {
            const nodes = folders[path];
            const size = nodes.length;
            let zone = 'suburban'; // < 5
            if (size >= 5 && size < 15) zone = 'industrial';
            if (size >= 15) zone = 'commercial';
            return { path, nodes, zone, size };
        });

        // Sort districts so high density (commercial) is placed first
        districts.sort((a, b) => b.size - a.size);

        // Asphalt Base
        const groundGeo = new THREE.PlaneGeometry(3000, 3000);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.set(0, -0.05, 0);
        this.scene.add(ground);
        this.textureLoader = new THREE.TextureLoader();

        const tileSize = 2;
        this.proceduralBuildings = [];

        const createProceduralModel = (type, color) => {
            let geo;
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // Use white base for vertex colors
            if (type === 'monolith') geo = new THREE.BoxGeometry(0.8, 1, 0.8);
            else if (type === 'pyramid') geo = new THREE.ConeGeometry(0.6, 1, 4);
            else if (type === 'crystal') geo = new THREE.IcosahedronGeometry(0.6, 0);
            
            return new InstancedBuilding(geo, mat, 20000);
        };

        const createPool = (colors) => [
            createProceduralModel('crystal', colors[0]),
            createProceduralModel('monolith', colors[1]),
            createProceduralModel('pyramid', colors[2])
        ];

        this.instancedModels.commercial = createPool([0x00ffff, 0x00cccc, 0x00aaaa]);
        this.instancedModels.industrial = createPool([0x444444, 0x333333, 0x222222]);
        this.instancedModels.suburban = createPool([0x664422, 0x553311, 0x442200]);
        this.instancedModels.park = [createProceduralModel('monolith', 0x00ff00)];
        
        this.proceduralBuildings = [
            ...this.instancedModels.commercial,
            ...this.instancedModels.industrial,
            ...this.instancedModels.suburban,
            ...this.instancedModels.park
        ];
        // CRITICAL: Actually add the instanced meshes to the scene AND the collision array!
        this.proceduralBuildings.forEach(model => {
            model.meshes.forEach(mesh => {
                this.scene.add(mesh);
                this.meshes.push(mesh); // Fixes the missing click bug
            });
        });

        const buildingBounds = new Map();
        const getBuildingSize = (model) => {
            if (buildingBounds.has(model)) return buildingBounds.get(model);
            let size;
            if (model.originalScene) {
                const box = new THREE.Box3().setFromObject(model.originalScene);
                size = box.getSize(new THREE.Vector3());
            } else {
                // Procedural: use the geometry bounding box
                const geo = model.meshes[0].geometry;
                if (!geo.boundingBox) geo.computeBoundingBox();
                size = geo.boundingBox.getSize(new THREE.Vector3());
            }
            buildingBounds.set(model, size);
            return size;
        };
        
        // Pass 1: Local District Packing (AABB Collision)
        districts.forEach(district => {
            const models = this.instancedModels[district.zone];
            district.placedNodes = [];
            
            const hasPark = district.nodes.length > 10 && this.instancedModels.park.length > 0;
            const parkRadius = hasPark ? 3 + Math.floor(Math.sqrt(district.nodes.length) * 0.4) : 0;
            
            let minX = hasPark ? -parkRadius : 0;
            let maxX = hasPark ? parkRadius : 0;
            let minZ = hasPark ? -parkRadius : 0;
            let maxZ = hasPark ? parkRadius : 0;

            district.nodes.forEach((node) => {
                const cat = EXT_MAP[node.ext] || 'default';
                const isMedia = (cat === 'image' || cat === 'video');
                const model = isMedia ? this.instancedModels.commercial[0] : models[Math.floor(Math.random() * models.length)];
                
                const size = getBuildingSize(model);
                const angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
                
                let w = size.x + 0.4; // 0.4 safety gap
                let h = size.z + 0.4;
                if (angle === Math.PI / 2 || angle === -Math.PI / 2 || angle === Math.PI * 1.5) {
                    w = size.z + 0.4;
                    h = size.x + 0.4;
                }
                
                let placed = false;
                let radius = hasPark ? parkRadius + 0.5 : 0;
                let searchAngle = 0;
                
                while (!placed) {
                    let lx = Math.cos(searchAngle) * radius;
                    let lz = Math.sin(searchAngle) * radius;
                    
                    let overlap = false;
                    for (const other of district.placedNodes) {
                        if (lx < other.x + other.w/2 + w/2 && lx > other.x - other.w/2 - w/2 &&
                            lz < other.z + other.h/2 + h/2 && lz > other.z - other.h/2 - h/2) {
                            overlap = true;
                            break;
                        }
                    }
                    
                    if (!overlap) {
                        district.placedNodes.push({ node, model, isMedia, x: lx, z: lz, w, h, angle });
                        if (lx - w/2 < minX) minX = lx - w/2;
                        if (lx + w/2 > maxX) maxX = lx + w/2;
                        if (lz - h/2 < minZ) minZ = lz - h/2;
                        if (lz + h/2 > maxZ) maxZ = lz + h/2;
                        placed = true;
                    } else {
                        searchAngle += 0.5;
                        if (searchAngle > Math.PI * 2) {
                            searchAngle = 0;
                            radius += 0.5; 
                        }
                    }
                }
            });
            
            // Procedurally generate central park if applicable
            if (hasPark) {
                const numTrees = Math.floor((parkRadius * parkRadius * Math.PI) / 4);
                for (let t = 0; t < numTrees; t++) {
                    const treeAngle = Math.random() * Math.PI * 2;
                    const treeR = Math.random() * (parkRadius - 1.5); 
                    const treeX = Math.cos(treeAngle) * treeR;
                    const treeZ = Math.sin(treeAngle) * treeR;
                    
                    const treeModel = this.instancedModels.park[Math.floor(Math.random() * this.instancedModels.park.length)];
                    district.placedNodes.push({
                        isPark: true, model: treeModel, x: treeX, z: treeZ,
                        angle: Math.random() * Math.PI * 2, scale: 0.5 + Math.random() * 0.8
                    });
                }
            }

            const localW = maxX - minX;
            const localH = maxZ - minZ;
            
            // Recenter
            const cx = (maxX + minX) / 2;
            const cz = (maxZ + minZ) / 2;
            district.placedNodes.forEach(pn => {
                pn.x -= cx;
                pn.z -= cz;
            });
            
            // Snap physical bounds to grid tiles (+1 for padding)
            district.gridW = Math.max(2, Math.ceil((localW + 1) / tileSize));
            district.gridH = Math.max(2, Math.ceil((localH + 1) / tileSize));
        });

        // Pass 2: Global Grid Packing
        const gridMap = new Map(); 
        
        const canPlace = (x, z, w, h) => {
            for (let i = 0; i < w; i++) {
                for (let j = 0; j < h; j++) {
                    if (gridMap.has(`${x+i},${z+j}`)) return false;
                }
            }
            return true;
        };

        const markPlace = (x, z, w, h) => {
            for (let i = -1; i <= w; i++) {
                for (let j = -1; j <= h; j++) {
                    const key = `${x+i},${z+j}`;
                    if (i === -1 || i === w || j === -1 || j === h) {
                        if (!gridMap.has(key)) {
                            gridMap.set(key, 'ROAD');
                        }
                    } else {
                        gridMap.set(key, 'BLOCK');
                    }
                }
            }
        };

        const EXT_COLORS = {
            '.js': 0xf7df1e, '.jsx': 0xf7df1e, '.ts': 0x007acc, '.tsx': 0x007acc,
            '.css': 0x264de4, '.scss': 0xc6538c, '.less': 0x1d365d,
            '.html': 0xe34c26, '.htm': 0xe34c26,
            '.json': 0x8bc34a, '.yaml': 0x8bc34a, '.yml': 0x8bc34a,
            '.md': 0x00bcd4, '.txt': 0x00bcd4,
            '.webp': 0xff5722, '.png': 0xff5722, '.jpg': 0xff5722, '.jpeg': 0xff5722, '.gif': 0xff5722,
            '.glb': 0x9c27b0, '.gltf': 0x9c27b0, '.obj': 0x9c27b0
        };

        const getStoryColor = (ext, story) => {
            const base = EXT_COLORS[ext] || 0xff0000; // Red for unmapped files (helps debugging)
            const c = new THREE.Color(base);
            const hsl = {};
            c.getHSL(hsl);
            // Story 0 = original/darker, going up = lighter
            c.setHSL(hsl.h, hsl.s, Math.min(0.95, 0.3 + story * 0.15));
            return c;
        };

        districts.forEach((district) => {
            const models = this.instancedModels[district.zone];
            let w = district.gridW;
            let h = district.gridH;

            let placed = false;

            // Square spiral search for 100% dense packing
            for(let r = 0; r <= 500 && !placed; r++) {
                for(let dx = -r; dx <= r && !placed; dx++) {
                    for(let dz = -r; dz <= r && !placed; dz++) {
                        if (Math.abs(dx) === r || Math.abs(dz) === r) {
                            if (canPlace(dx, dz, w, h)) {
                                markPlace(dx, dz, w, h);
                                district.gridX = dx;
                                district.gridZ = dz;
                                district.w = w;
                                district.h = h;
                                placed = true;
                            }
                        }
                    }
                }
            }

            district.x = district.gridX * tileSize + (district.w * tileSize) / 2;
            district.z = district.gridZ * tileSize + (district.h * tileSize) / 2;
            
            // Instanciate buildings locally
            district.placedNodes.forEach(pn => {
                const bX = district.x + pn.x;
                const bZ = district.z + pn.z;

                if (pn.isPark) {
                    pn.model.addInstance(bX, 0, bZ, pn.scale, pn.angle, null);
                } else if (pn.isMedia) {
                    const sizeLog = Math.log10(pn.node.size + 1);
                    const numStories = Math.max(1, Math.floor(sizeLog * 0.75));
                    const totemHeight = numStories * 1.05;
                    
                    for (let s = 0; s < numStories; s++) {
                        const storyY = s * 1.05;
                        const storyModel = models[Math.floor(Math.random() * models.length)];
                        storyModel.addInstance(bX, storyY, bZ, 1.0, pn.angle, pn.node, getStoryColor(pn.node.ext, s));
                        pn.node.worldPos = new THREE.Vector3(bX, (numStories * 1.05) / 2, bZ); // Center of totem
                    }

                    // 2. Add a Floating Billboard right above the totem
                    const screenGeo = new THREE.PlaneGeometry(0.8, 0.8); 
                    const screenMesh = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9 }));
                    
                    screenMesh.position.set(bX, totemHeight + 0.3, bZ);
                    // Force the billboard to always face the camera
                    screenMesh.onBeforeRender = (renderer, scene, camera) => {
                        screenMesh.quaternion.copy(camera.quaternion);
                    };
                    
                    this.scene.add(screenMesh);
                    this.meshes.push(screenMesh);
                    
                    let fetchPath = pn.node.path;
                    if (fetchPath.startsWith('/public/')) fetchPath = fetchPath.substring(7);

                    const mediaCat = EXT_MAP[pn.node.ext] || 'image';
                    const mediaObj = {
                        mesh: screenMesh, 
                        cat: mediaCat, 
                        fetchPath, 
                        loaded: false, 
                        video: null,
                        texture: null,
                        mainMesh: screenMesh,
                        aspectRatioFixed: false
                    };
                    this.mediaObjects.push(mediaObj);
                    pn.node.mesh = screenMesh; // For zoom focus
                    pn.node.worldPos = screenMesh.position.clone(); // Billboard pos
                } else {
                    const sizeLog = Math.log10(pn.node.size + 1);
                    const numStories = Math.max(1, Math.floor(sizeLog * 0.75));
                    for (let s = 0; s < numStories; s++) {
                        const storyY = s * 1.05;
                        const storyModel = models[Math.floor(Math.random() * models.length)];
                        storyModel.addInstance(bX, storyY, bZ, 1.0, pn.angle, pn.node, getStoryColor(pn.node.ext, s));
                        pn.node.worldPos = new THREE.Vector3(bX, (numStories * 1.05) / 2, bZ);
                    }
                }
            });
        });

        // 4. Procedural Road Network Generation
        const roadKeys = Array.from(gridMap.keys()).filter(k => gridMap.get(k) === 'ROAD');
        const maxRoads = roadKeys.length;
        
        const asphaltGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        asphaltGeo.rotateX(-Math.PI / 2);
        const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const asphaltMesh = new THREE.InstancedMesh(asphaltGeo, asphaltMat, maxRoads);
        
        const whiteGeo = new THREE.PlaneGeometry(tileSize, 0.2); 
        whiteGeo.rotateX(-Math.PI / 2);
        const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const whiteMesh = new THREE.InstancedMesh(whiteGeo, whiteMat, maxRoads * 4);
        
        const yellowGeo = new THREE.PlaneGeometry(0.15, tileSize * 0.5); 
        yellowGeo.rotateX(-Math.PI / 2);
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        const yellowMesh = new THREE.InstancedMesh(yellowGeo, yellowMat, maxRoads * 2);

        const sidewalkGeo = new THREE.BoxGeometry(tileSize, 0.1, 0.6);
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const sidewalkMesh = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, maxRoads * 4);

        const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const streetlightMesh = new THREE.InstancedMesh(poleGeo, poleMat, maxRoads * 8);

        const lightGeo = new THREE.BoxGeometry(0.05, 0.02, 0.2);
        const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 1 });
        const bulbMesh = new THREE.InstancedMesh(lightGeo, lightMat, maxRoads * 8);

        this.scene.add(asphaltMesh);
        this.scene.add(whiteMesh);
        this.scene.add(yellowMesh);
        this.scene.add(sidewalkMesh);
        this.scene.add(streetlightMesh);
        this.scene.add(bulbMesh);
        
        let asphaltCount = 0;
        let whiteCount = 0;
        let yellowCount = 0;
        let sidewalkCount = 0;
        let streetlightCount = 0;

        const dummy = new THREE.Object3D();

        roadKeys.forEach(k => {
            const [x, z] = k.split(',').map(Number);
            const N = gridMap.get(`${x},${z-1}`) === 'ROAD';
            const S = gridMap.get(`${x},${z+1}`) === 'ROAD';
            const E = gridMap.get(`${x+1},${z}`) === 'ROAD';
            const W = gridMap.get(`${x-1},${z}`) === 'ROAD';
            
            const rX = x * tileSize + tileSize / 2;
            const rZ = z * tileSize + tileSize / 2;

            // Asphalt Base
            dummy.position.set(rX, 0.01, rZ);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            asphaltMesh.setMatrixAt(asphaltCount++, dummy.matrix);

            // Smart Borders (Sidewalks, Lines, and Streetlights)
            const addBorder = (xOffset, zOffset, rotationY, isHorizontalSide) => {
                // Sidewalk
                dummy.position.set(rX + xOffset, 0.05, rZ + zOffset);
                dummy.rotation.set(0, rotationY, 0);
                dummy.updateMatrix();
                sidewalkMesh.setMatrixAt(sidewalkCount++, dummy.matrix);

                // White Edge Line
                const lineOffset = 0.4;
                dummy.position.set(rX + (xOffset ? Math.sign(xOffset) * lineOffset : 0), 0.02, rZ + (zOffset ? Math.sign(zOffset) * lineOffset : 0));
                dummy.rotation.set(0, rotationY, 0);
                dummy.updateMatrix();
                whiteMesh.setMatrixAt(whiteCount++, dummy.matrix);

                // Procedural Streetlights
                if (Math.random() > 0.4) {
                    const numLights = Math.random() > 0.5 ? 2 : 1;
                    for (let i = 0; i < numLights; i++) {
                        const slide = (Math.random() - 0.5) * 1.6;
                        const sX = rX + xOffset + (isHorizontalSide ? slide : 0);
                        const sZ = rZ + zOffset + (isHorizontalSide ? 0 : slide);
                        
                        dummy.position.set(sX, 0.4, sZ);
                        dummy.rotation.set(0, 0, 0);
                        dummy.updateMatrix();
                        streetlightMesh.setMatrixAt(streetlightCount, dummy.matrix);
                        
                        const overhangDirX = xOffset ? -Math.sign(xOffset) : 0;
                        const overhangDirZ = zOffset ? -Math.sign(zOffset) : 0;
                        dummy.position.set(sX + overhangDirX * 0.15, 0.8, sZ + overhangDirZ * 0.15);
                        dummy.rotation.set(0, rotationY, 0);
                        dummy.updateMatrix();
                        bulbMesh.setMatrixAt(streetlightCount++, dummy.matrix);
                    }
                }
            };
            
            if (!N) addBorder(0, -0.7, 0, true);
            if (!S) addBorder(0, 0.7, 0, true);
            if (!E) addBorder(0.7, 0, Math.PI / 2, false);
            if (!W) addBorder(-0.7, 0, Math.PI / 2, false);

            // Smart Yellow Dashes (Parallel multi-lane detection)
            const getIsVert = (tx, tz) => gridMap.get(`${tx},${tz-1}`) === 'ROAD' && gridMap.get(`${tx},${tz+1}`) === 'ROAD';
            const getIsHorz = (tx, tz) => gridMap.get(`${tx-1},${tz}`) === 'ROAD' && gridMap.get(`${tx+1},${tz}`) === 'ROAD';
            
            const myVert = getIsVert(x, z);
            const myHorz = getIsHorz(x, z);
            
            const eIntersects = E && !getIsVert(x+1, z);
            const wIntersects = W && !getIsVert(x-1, z);
            const nIntersects = N && !getIsHorz(x, z-1);
            const sIntersects = S && !getIsHorz(x, z+1);
            
            const isVerticalIntersection = eIntersects || wIntersects;
            const isHorizontalIntersection = nIntersects || sIntersects;

            if (myVert && !isVerticalIntersection) {
                dummy.position.set(rX, 0.02, rZ);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                yellowMesh.setMatrixAt(yellowCount++, dummy.matrix);
            } else if (myHorz && !isHorizontalIntersection) {
                dummy.position.set(rX, 0.02, rZ);
                dummy.rotation.set(0, Math.PI / 2, 0);
                dummy.updateMatrix();
                yellowMesh.setMatrixAt(yellowCount++, dummy.matrix);
            }
        });

        asphaltMesh.count = asphaltCount;
        whiteMesh.count = whiteCount;
        yellowMesh.count = yellowCount;
        sidewalkMesh.count = sidewalkCount;
        streetlightMesh.count = streetlightCount;
        bulbMesh.count = streetlightCount;
        
        asphaltMesh.instanceMatrix.needsUpdate = true;
        whiteMesh.instanceMatrix.needsUpdate = true;
        yellowMesh.instanceMatrix.needsUpdate = true;
        sidewalkMesh.instanceMatrix.needsUpdate = true;
        streetlightMesh.instanceMatrix.needsUpdate = true;
        bulbMesh.instanceMatrix.needsUpdate = true;

        Object.values(this.instancedModels).forEach(arr => {
            arr.forEach(model => {
                if (model && model.meshes) {
                    model.meshes.forEach(mesh => {
                        mesh.instanceMatrix.needsUpdate = true;
                        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                    });
                }
            });
        });
        
        // Initial look target
        this.camera.lookAt(0, 0, 0);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onClick(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.meshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            let node = null;
            
            if (hit.object.isInstancedMesh && hit.object.userData.nodes) {
                node = hit.object.userData.nodes[hit.instanceId];
            } else if (hit.object.userData.node) {
                node = hit.object.userData.node;
            }

            if (node) {
                this.updateHUD(node);
            }
        }
    }

    updateHUD(node) {
        this.selectedNode = node;
        const nameEl = document.getElementById('node-name');
        const pathEl = document.getElementById('node-path');
        const sizeEl = document.getElementById('node-size');
        const typeEl = document.getElementById('node-type');

        nameEl.textContent = node.name;
        pathEl.textContent = node.path;
        sizeEl.textContent = (node.size / 1024).toFixed(2) + ' KB';
        typeEl.textContent = (node.ext || '.folder').toUpperCase();

        // Dynamic Hyperlinking (Project-Aware)
        try {
            let url = "";
            let normalizedPath = node.path.replace(/\\/g, '/');
            if (!normalizedPath.startsWith('/')) normalizedPath = '/' + normalizedPath;

            const findProjectHTML = (targetPath) => {
                if (!targetPath || !targetPath.toLowerCase().startsWith('/public/')) return null;
                
                const parts = targetPath.split('/');
                const stopAt = parts.findIndex(p => p.toLowerCase() === 'public') + 1;
                
                while (parts.length >= stopAt) {
                    const currentFolder = parts.join('/').toLowerCase();
                    if (!currentFolder) break;

                    const htmlNode = this.fileNodes.find(n => {
                        if (!n.name || !n.name.toLowerCase().endsWith('.html')) return false;
                        let nPath = n.path.replace(/\\/g, '/');
                        nPath = nPath.startsWith('/') ? nPath : '/' + nPath;
                        if (!nPath.toLowerCase().startsWith('/public/')) return false;
                        
                        const nParts = nPath.split('/');
                        const nFolder = nParts.slice(0, -1).join('/').toLowerCase();
                        return nFolder === currentFolder;
                    });

                    if (htmlNode) return htmlNode;
                    parts.pop(); 
                }
                return null;
            };

            let targetHTML = null;
            if (node.name && node.name.toLowerCase().endsWith('.html') && normalizedPath.toLowerCase().startsWith('/public/')) {
                targetHTML = node;
            } else {
                const searchDir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                targetHTML = findProjectHTML(searchDir);
            }

            if (targetHTML) {
                let cleanPath = targetHTML.path.replace(/\\/g, '/');
                cleanPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
                
                // Case-insensitive removal of /public
                const pubIdx = cleanPath.toLowerCase().indexOf('/public');
                if (pubIdx !== -1) {
                    cleanPath = cleanPath.substring(pubIdx + 7);
                }
                
                url = `https://dillonsimeone.com${cleanPath}`;
            } else {
                url = `https://github.com/DillonSimeone/Website/blob/main${normalizedPath}`;
            }
            
            pathEl.href = url;
        } catch (err) {
            console.error("Hyperlink generation failed:", err);
            // Absolute fallback
            const safePath = node.path.startsWith('/') ? node.path : '/' + node.path;
            pathEl.href = `https://github.com/DillonSimeone/Website/blob/main${safePath}`;
        }
    }

    onDoubleClick(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.meshes, false);
        if (intersects.length > 0) {
            const hit = intersects[0];
            let node = null;
            if (hit.object.isInstancedMesh && hit.object.userData.nodes) {
                node = hit.object.userData.nodes[hit.instanceId];
                if (node) node.mesh = hit.object; // Fallback for instanced
            } else {
                node = hit.object.userData.node;
            }
            if (node) this.zoomTo(node);
        }
    }

    zoomTo(node) {
        const targetPos = new THREE.Vector3();
        const targetLookAt = new THREE.Vector3();
        
        if (node.worldPos) {
            targetLookAt.copy(node.worldPos);
            
            let dist = 2.0;
            if (node.ext && (EXT_MAP[node.ext] === 'image' || EXT_MAP[node.ext] === 'video')) {
                dist = 2.5; 
            }
            
            const dir = new THREE.Vector3().subVectors(this.camera.position, node.worldPos).normalize();
            targetPos.copy(node.worldPos).add(dir.multiplyScalar(dist));
        } else {
            targetLookAt.set(0,0,0);
            targetPos.set(20, 20, 20);
        }

        // Pre-calculate target rotation
        const dummy = this.camera.clone();
        dummy.position.copy(targetPos);
        dummy.lookAt(targetLookAt);

        this.zoomTarget = { 
            startPos: this.camera.position.clone(),
            startQuat: this.camera.quaternion.clone(),
            pos: targetPos, 
            quat: dummy.quaternion.clone(),
            lookAt: targetLookAt, 
            startTime: Date.now() 
        };
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    checkLazyLoading() {
        const cameraPos = this.camera.position;
        // The entire city is densely packed into ~100 physical units.
        // Scale radii to match this micro-scale.
        const loadRadius = SETTINGS.useKenneyAssets ? 25 : 35; 
        const unloadRadius = SETTINGS.useKenneyAssets ? 40 : 50; 
        let loadBudget = SETTINGS.useKenneyAssets ? 2 : 10; 
        
        this.mediaObjects.forEach(media => {
            const dist = cameraPos.distanceTo(media.mesh.position);
            media.currentDist = dist;
            
            if (dist < loadRadius && !media.loaded && loadBudget > 0) {
                loadBudget--;
                media.loaded = true;
                
                const applyTextureToKenneyModel = (texture) => {
                    media.texture = texture;
                    texture.generateMipmaps = false;
                    texture.minFilter = THREE.LinearFilter;
                    
                    texture.colorSpace = THREE.SRGBColorSpace;
                    media.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
                };

                if (media.cat === 'image') {
                    // Ultra-fast asynchronous decoding via ImageBitmap prevents parsing stutters
                    fetch(media.fetchPath)
                        .then(res => res.blob())
                        .then(blob => createImageBitmap(blob, { imageOrientation: 'flipY' }))
                        .then(bitmap => {
                            const tex = new THREE.CanvasTexture(bitmap);
                            this.uploadQueue.push({ media, texture: tex });
                        })
                        .catch(e => console.warn(e));
                } else if (media.cat === 'video') {
                    const video = document.createElement('video');
                    video.src = media.fetchPath;
                    video.crossOrigin = 'anonymous';
                    video.loop = true;
                    video.muted = true;
                    video.play().catch(e => console.warn("Video blocked", e));
                    media.video = video;
                    
                    const texture = new THREE.VideoTexture(video);
                    this.uploadQueue.push({ media, texture });
                }
            } else if (dist > unloadRadius && media.loaded) {
                // CRITICAL: Unload assets from VRAM to prevent crash/slowdown
                media.loaded = false;
                if (media.texture) {
                    media.texture.dispose();
                    media.texture = null;
                }
                if (media.mesh.material && media.mesh.material !== this.blackMaterial) {
                    if (media.mesh.material.map) media.mesh.material.map.dispose();
                    media.mesh.material.dispose();
                }
                // Use cached material to prevent garbage collection spikes
                media.mesh.material = this.blackMaterial;
                
                if (media.video) {
                    media.video.pause();
                    media.video.src = "";
                    media.video.load();
                    media.video = null;
                }
            } else if (dist >= loadRadius && media.loaded && media.cat === 'video') {
                if (media.video && !media.video.paused) media.video.pause();
            } else if (dist < loadRadius && media.loaded && media.cat === 'video') {
                if (media.video && media.video.paused) media.video.play().catch(()=>{});
            }
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.frameCount++;
        
        if (this.frameCount % 15 === 0) {
            this.checkLazyLoading();
        }
        
        const delta = this.clock.getDelta();
        
        if (this.zoomTarget) {
            const elapsed = (Date.now() - this.zoomTarget.startTime) / 1000;
            const t = Math.min(1, elapsed); // 1-second fixed duration
            
            // Cubic ease out for cinematic feel
            const ease = 1 - Math.pow(1 - t, 3);
            
            this.camera.position.lerpVectors(this.zoomTarget.startPos, this.zoomTarget.pos, ease);
            this.camera.quaternion.slerpQuaternions(this.zoomTarget.startQuat, this.zoomTarget.quat, ease);
            
            if (t >= 1) {
                this.zoomTarget = null; // Resume flight
            }
        } else {
            this.controls.update(delta);
        }
        
        // Procedural Animations (CPU-based for maximum compatibility)
        if (this.frameCount % 2 === 0) {
            const time = Date.now() * 0.002;
            const camX = this.camera.position.x;
            const camZ = this.camera.position.z;
            const animRadiusSq = 150 * 150; // Only animate nearby to save CPU

            const animateLayer = (model, animType) => {
                if (!model) return;
                let needsUpdate = false;
                for (let i = 0; i < model.count; i++) {
                    const data = model.instanceData[i];
                    const dx = data.x - camX;
                    const dz = data.z - camZ;
                    
                    if (dx*dx + dz*dz > animRadiusSq) continue;
                    
                    const seed = data.x * 1.5 + data.z * 2.1;
                    
                    if (animType === 'crystal') {
                        model.dummy.position.set(data.x, data.y + Math.sin(time * 1.5 + seed) * 0.2, data.z);
                        model.dummy.rotation.y = data.angle + time * 0.8;
                        model.dummy.scale.set(1, data.scaleY, 1);
                    } else if (animType === 'pyramid') {
                        const scale = 1.0 + Math.sin(time * 2.0 + seed) * 0.15;
                        model.dummy.position.set(data.x, data.y, data.z);
                        model.dummy.rotation.y = data.angle;
                        model.dummy.scale.set(scale, data.scaleY, scale);
                    } else if (animType === 'monolith') {
                        model.dummy.position.set(data.x, data.y + Math.sin(time * 3.0 + seed) * 0.15, data.z);
                        model.dummy.rotation.y = data.angle;
                        model.dummy.scale.set(1, data.scaleY, 1);
                    }

                    model.dummy.updateMatrix();
                    model.meshes[0].setMatrixAt(i, model.dummy.matrix);
                    needsUpdate = true;
                }
                if (needsUpdate) model.meshes[0].instanceMatrix.needsUpdate = true;
            };

            animateLayer(this.instancedModels.commercial[0], 'crystal');
            animateLayer(this.instancedModels.industrial[0], 'monolith');
            animateLayer(this.instancedModels.suburban[0], 'pyramid');
            animateLayer(this.instancedModels.park[0], 'monolith');
        }

        // GPU UPLOAD BUDGET: Only allow one texture transfer to GPU per frame to prevent stutter
        if (this.uploadQueue.length > 0) {
            const task = this.uploadQueue.shift();
            this.applyTexture(task.media, task.texture);
        }

        // Diagnostic Logging (Every 60 frames)
        if (this.frameCount % 60 === 0) {
            const totalInstanced = Object.values(this.instancedModels).reduce((acc, arr) => acc + arr.reduce((a, m) => a + m.count, 0), 0);
            const totalBuildings = totalInstanced + this.mediaObjects.length;
            const inRange = this.mediaObjects.filter(m => m.currentDist < (SETTINGS.useKenneyAssets ? 25 : 35)).length;
            const loadedMedias = this.mediaObjects.filter(m => m.loaded).length;
            const currentFPS = Math.round(1 / delta);
            const time = new Date().toLocaleTimeString();

            console.log(`[${time}] [Universe Debug] FPS: ${currentFPS} | Buildings: ${totalBuildings} (Range: ${inRange}) | Media Loaded: ${loadedMedias}/${this.mediaObjects.length} | Queue: ${this.uploadQueue.length}`);
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    applyTexture(media, texture) {
        media.texture = texture;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        media.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
        
        // Auto-fix aspect ratio based on the loaded media (Clamped to 0.8 totem width)
        if (!media.aspectRatioFixed) {
            let width = 1, height = 1;
            if (texture.image) {
                width = texture.image.width || texture.image.videoWidth || 1;
                height = texture.image.height || texture.image.videoHeight || 1;
            }
            const ratio = width / height;
            // Clamp so the billboard NEVER exceeds the 0.8 totem width
            if (ratio > 1) {
                // Wide: Lock width to 0.8, shrink height
                media.mesh.scale.set(0.8, 0.8 / ratio, 1);
            } else {
                // Tall: Lock height to 0.8, shrink width
                media.mesh.scale.set(0.8 * ratio, 0.8, 1);
            }
            media.aspectRatioFixed = true;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Universe();
});
