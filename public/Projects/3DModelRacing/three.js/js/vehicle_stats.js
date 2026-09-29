// vehicle_stats.js — 3D Model Racing Stats & Procedural Vehicle Generator
import * as THREE from 'three';

export const VehicleStats = {
    MASS_MAX: 7.5,
    LAUNCH_ENERGY: 175.0,

    compute(size) {
        const L = Math.max(size.z, 0.5);
        const W = Math.max(size.x, 0.4);
        const H = Math.max(size.y, 0.3);

        const mass = THREE.MathUtils.clamp(L * W * H * 1.6, 0.45, this.MASS_MAX);
        const top_speed = 36.0 * (L / 3.0) / (1.0 + 0.45 * W * H);
        const accel = 34.0 / mass;
        const grip = 6.5 * (W / 1.2) * (0.55 / H);
        const yaw = 2.2 * (W / L) * (0.55 / H);
        const launch = (top_speed * top_speed) / mass;

        return {
            length: L,
            width: W,
            height: H,
            mass,
            top_speed,
            accel,
            grip,
            yaw,
            launch,
            can_ascend: launch >= this.LAUNCH_ENERGY
        };
    },

    // Measures oriented bounding box of any geometry given a rotation Euler
    measureOrientedGeometry(geometry, euler = new THREE.Euler(0, 0, 0)) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();

        const min = geometry.boundingBox.min;
        const max = geometry.boundingBox.max;
        const corners = [
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z),
            new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, max.y, max.z),
            new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, min.z),
            new THREE.Vector3(max.x, max.y, max.z)
        ];

        const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
        const orientedBox = new THREE.Box3();
        for (const c of corners) {
            c.applyMatrix4(rotMatrix);
            orientedBox.expandByPoint(c);
        }

        const size = new THREE.Vector3();
        orientedBox.getSize(size);

        return {
            size,
            stats: this.compute(size)
        };
    },

    // Measures default unrotated geometry
    measureGeometry(geometry) {
        geometry.computeBoundingBox();
        geometry.center();
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);

        return {
            size,
            stats: this.compute(size)
        };
    },

    // Generates a default aerodynamic Formula-style racing wedge
    createDefaultRacer() {
        const geom = new THREE.BufferGeometry();
        const vertices = [];

        function quad(a, b, c, d) {
            vertices.push(...a, ...b, ...c);
            vertices.push(...a, ...c, ...d);
        }

        // Streamlined racer coordinates (Length: 3.0m, Width: 1.4m, Height: 0.65m)
        const nose = [0, 0.1, -1.5];
        const nose_top = [0, 0.25, -1.2];
        const cockpit_top = [0, 0.65, 0.1];
        const engine_top = [0, 0.55, 1.1];
        const rear_center = [0, 0.35, 1.45];

        const side_l_f = [-0.4, 0.15, -0.8];
        const side_r_f = [0.4, 0.15, -0.8];
        const pod_l_m = [-0.7, 0.3, 0.3];
        const pod_r_m = [0.7, 0.3, 0.3];
        const pod_l_r = [-0.65, 0.25, 1.3];
        const pod_r_r = [0.65, 0.25, 1.3];

        const bot_n = [0, 0.05, -1.4];
        const bot_l = [-0.5, 0.05, 0.2];
        const bot_r = [0.5, 0.05, 0.2];
        const bot_rear = [0, 0.08, 1.4];

        // Nose cone
        quad(nose, nose_top, side_r_f, bot_n);
        quad(nose, bot_n, side_l_f, nose_top);

        // Hood to cockpit
        quad(nose_top, cockpit_top, pod_r_m, side_r_f);
        quad(nose_top, side_l_f, pod_l_m, cockpit_top);

        // Side pods
        quad(side_r_f, pod_r_m, bot_r, bot_n);
        quad(side_l_f, bot_n, bot_l, pod_l_m);
        quad(pod_r_m, pod_r_r, bot_rear, bot_r);
        quad(pod_l_m, bot_l, bot_rear, pod_l_r);

        // Engine deck
        quad(cockpit_top, engine_top, pod_r_r, pod_r_m);
        quad(cockpit_top, pod_l_m, pod_l_r, engine_top);

        // Rear
        quad(engine_top, rear_center, bot_rear, pod_r_r);
        quad(engine_top, pod_l_r, bot_rear, rear_center);

        // Rear Wing
        const w_tl = [-0.75, 0.85, 1.35];
        const w_tr = [0.75, 0.85, 1.35];
        const w_bl = [-0.75, 0.82, 1.55];
        const w_br = [0.75, 0.82, 1.55];
        quad(w_tl, w_tr, w_br, w_bl);

        // Wing endplates & struts
        quad([-0.2, 0.4, 1.25], [-0.2, 0.82, 1.4], [0.2, 0.82, 1.4], [0.2, 0.4, 1.25]);

        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.computeVertexNormals();
        return geom;
    }
};
