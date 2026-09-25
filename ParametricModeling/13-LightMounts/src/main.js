// Main orchestrator module for 13-LightMounts Configurator
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { context, params, visibilities, meshes, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners, updateLeaderLines } from './ui.js';
import {
    generateLightFrameGeometry,
    flattenStlBackside,
    generateHingeConnectorGeometry,
    generateWallPlateGeometry,
    generateBoltGeometry,
    generateNutGeometry,
    manifoldToThree
} from './geometry.js';

let pivotGroup = null;

// Rebuild the 3D representation
export function rebuild() {
    // Clear old meshes
    if (pivotGroup) {
        context.mainGroup.remove(pivotGroup);
        pivotGroup = null;
    }
    if (meshes.lightFrame) {
        context.mainGroup.remove(meshes.lightFrame);
        meshes.lightFrame.traverse(child => {
            if (child.isMesh) child.geometry.dispose();
        });
        meshes.lightFrame = null;
    }
    if (meshes.hingeConnector) {
        context.mainGroup.remove(meshes.hingeConnector);
        meshes.hingeConnector.geometry.dispose();
        meshes.hingeConnector = null;
    }
    if (meshes.wallPlate) {
        context.mainGroup.remove(meshes.wallPlate);
        meshes.wallPlate.geometry.dispose();
        meshes.wallPlate = null;
    }
    if (meshes.bolt) {
        if (meshes.bolt.parent) meshes.bolt.parent.remove(meshes.bolt);
        else context.mainGroup.remove(meshes.bolt);
        meshes.bolt.geometry.dispose();
        meshes.bolt = null;
    }
    if (meshes.nut) {
        if (meshes.nut.parent) meshes.nut.parent.remove(meshes.nut);
        else context.mainGroup.remove(meshes.nut);
        meshes.nut.geometry.dispose();
        meshes.nut = null;
    }

    const isBlueprint = params.mode === 'blueprint';
    const matOpacity = params.opacity / 100;

    const getMaterial = (hexColor) => {
        if (isBlueprint) {
            return new THREE.MeshBasicMaterial({
                color: hexColor,
                wireframe: true,
                transparent: matOpacity < 1,
                opacity: matOpacity
            });
        } else {
            return new THREE.MeshPhysicalMaterial({
                color: hexColor,
                metalness: 0.1,
                roughness: 0.3,
                clearcoat: 0.8,
                transparent: true,
                opacity: matOpacity,
                side: THREE.DoubleSide
            });
        }
    };

    // 1. Build modified Light Frame with hinge knuckle
    if (visibilities.lightFrame && context.rawStlGeometry) {
        const frameAssemblyGroup = new THREE.Group();
        
        // A. Add original flattened STL
        const originalMesh = new THREE.Mesh(context.rawStlGeometry, getMaterial(colors.cyanIce));
        frameAssemblyGroup.add(originalMesh);
        
        // B. Add knuckle geometry additions
        const frameGeom = generateLightFrameGeometry();
        if (frameGeom) {
            const threeGeom = manifoldToThree(frameGeom.getMesh());
            frameGeom.delete();
            
            // Debug logging
            context.rawStlGeometry.computeBoundingBox();
            threeGeom.computeBoundingBox();
            console.log("STL Bounds:", JSON.stringify(context.rawStlGeometry.boundingBox));
            console.log("Plate Bounds:", JSON.stringify(threeGeom.boundingBox));
            
            const knuckleMesh = new THREE.Mesh(threeGeom, getMaterial(colors.greenAccent));
            frameAssemblyGroup.add(knuckleMesh);
        }
        
        meshes.lightFrame = frameAssemblyGroup;
        
        // Set up pivot rotation around the hinge pin center
        const backY = 36.0;
        const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
        const pivotZ = -0.58 + params.hingeOffsetZ;
        
        // Create a pivot group
        pivotGroup = new THREE.Group();
        pivotGroup.position.set(0, pivotY, pivotZ);
        
        // Shift frame assembly inside pivot group
        frameAssemblyGroup.position.set(0, -pivotY, -pivotZ);
        pivotGroup.add(frameAssemblyGroup);
        
        // Apply rotation around X axis (pitch / tilt)
        pivotGroup.rotation.x = (params.hingeAngle * Math.PI) / 180;
        
        context.mainGroup.add(pivotGroup);
    }

    // 2. Build Hinge Connector (fixed relative to wall plate)
    if (visibilities.hingeConnector) {
        const connGeom = generateHingeConnectorGeometry();
        if (connGeom) {
            const threeGeom = manifoldToThree(connGeom.getMesh());
            connGeom.delete();
            meshes.hingeConnector = new THREE.Mesh(threeGeom, getMaterial(colors.pinkAccent));
            context.mainGroup.add(meshes.hingeConnector);
        }
    }

    // 3. Build Wall Plate (fixed)
    if (visibilities.wallPlate) {
        const plateGeom = generateWallPlateGeometry();
        if (plateGeom) {
            const threeGeom = manifoldToThree(plateGeom.getMesh());
            plateGeom.delete();
            meshes.wallPlate = new THREE.Mesh(threeGeom, getMaterial(colors.limeAccent));
            context.mainGroup.add(meshes.wallPlate);
        }
    }
    
    // 4. Build Hex Bolt (moves with pivot/tilt)
    if (visibilities.bolt) {
        const boltGeom = generateBoltGeometry();
        if (boltGeom) {
            const threeGeom = manifoldToThree(boltGeom.getMesh());
            boltGeom.delete();
            meshes.bolt = new THREE.Mesh(threeGeom, getMaterial(colors.orangeAccent));
            
            if (pivotGroup) {
                const backY = 36.0;
                const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
                const pivotZ = -0.58 + params.hingeOffsetZ;
                meshes.bolt.position.set(0, -pivotY, -pivotZ);
                pivotGroup.add(meshes.bolt);
            } else {
                context.mainGroup.add(meshes.bolt);
            }
        }
    }

    // 5. Build Hex Nut (moves with pivot/tilt)
    if (visibilities.nut) {
        const nutGeom = generateNutGeometry();
        if (nutGeom) {
            const threeGeom = manifoldToThree(nutGeom.getMesh());
            nutGeom.delete();
            meshes.nut = new THREE.Mesh(threeGeom, getMaterial(colors.orangeAccent));
            
            if (pivotGroup) {
                const backY = 36.0;
                const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
                const pivotZ = -0.58 + params.hingeOffsetZ;
                meshes.nut.position.set(0, -pivotY, -pivotZ);
                pivotGroup.add(meshes.nut);
            }
        }
    }
    // Pairwise collision detection script using Manifold WASM
    try {
        const frameGeom = generateLightFrameGeometry();
        const connGeom = generateHingeConnectorGeometry();
        const plateGeom = generateWallPlateGeometry();

        console.log("--- ASSEMBLY COLLISION ANALYSIS ---");
        if (frameGeom && connGeom) {
            let diff = frameGeom.subtract(connGeom);
            let intersect = frameGeom.subtract(diff);
            diff.delete();
            let tris = intersect.getMesh().triVerts.length / 3;
            if (tris > 0) {
                console.warn(`[COLLISION] Light Frame & Hinge Connector: Overlap of ${tris} triangles`);
            } else {
                console.log(`[CLEAR] Light Frame & Hinge Connector: No overlap`);
            }
            intersect.delete();
        }
        if (connGeom && plateGeom) {
            let diff = connGeom.subtract(plateGeom);
            let intersect = connGeom.subtract(diff);
            diff.delete();
            let tris = intersect.getMesh().triVerts.length / 3;
            if (tris > 0) {
                console.warn(`[COLLISION] Hinge Connector & Wall Plate: Overlap of ${tris} triangles`);
            } else {
                console.log(`[CLEAR] Hinge Connector & Wall Plate: No overlap`);
            }
            intersect.delete();
        }

        if (frameGeom) frameGeom.delete();
        if (connGeom) connGeom.delete();
        if (plateGeom) plateGeom.delete();
    } catch (err) {
        console.error("Collision check failed:", err);
    }

    // Apply Exploded View animations (purely visual in viewport)
    const expFactor = params.explodedView / 100;
    if (expFactor > 0) {
        if (pivotGroup) {
            const backY = 36.0;
            const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
            pivotGroup.position.y = pivotY - (70 * expFactor);
        }
        if (meshes.hingeConnector) {
            meshes.hingeConnector.position.y = -(35 * expFactor);
        }
        const backY = 36.0;
        const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
        const pivotZ = -0.58 + params.hingeOffsetZ;
        if (meshes.bolt) {
            meshes.bolt.position.set(-45 * expFactor, -pivotY, -pivotZ);
        }
        if (meshes.nut) {
            meshes.nut.position.set(45 * expFactor, -pivotY, -pivotZ);
        }
    }

    // Update dimensions HUD overlay
    updateLeaderLines();
}

// Bootstrap
function init() {
    // 1. Initialize viewport
    initViewport(updateLeaderLines);
    
    // 2. Set status
    const status = document.getElementById('kernel-status');
    if (status) status.textContent = "LOADING STL...";
    
    // 3. Load the STL file
    const loader = new STLLoader();
    loader.load('DoomsdayBulletsOuterFrame.stl', 
        (geometry) => {
            if (status) status.textContent = "BOOTING KERNEL...";
            
            // Center geometry, flatten the back, and weld vertices
            geometry.center();
            flattenStlBackside(geometry, 36.0);
            const indexedGeom = BufferGeometryUtils.mergeVertices(geometry);
            context.rawStlGeometry = indexedGeom;
            
            // 4. Initialize Manifold WASM kernel
            initManifold(
                () => {
                    if (status) status.textContent = "ACTIVE";
                    rebuild();
                },
                animate
            );
            
            // 5. Setup UI Listeners
            setupUIListeners(rebuild);
        },
        undefined,
        (error) => {
            console.error("Failed to load STL file:", error);
            if (status) status.textContent = "STL LOAD ERROR";
        }
    );
}

// Start
window.addEventListener('DOMContentLoaded', init);
