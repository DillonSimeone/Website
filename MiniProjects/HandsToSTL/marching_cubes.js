/**
 * MarchingCubes.js
 * Extracted and optimized isosurface polygonizer for watertight organic hand mesh generation.
 */

export class MarchingCubes {
    constructor(resolution = 28, material = null, enableUvs = false, enableColors = false) {
        this.resolution = resolution;
        this.enableUvs = enableUvs;
        this.enableColors = enableColors;
        this.maxPolyCount = 100000;
        this.size = 1.0;
        this.size2 = 0.5;
        this.field = [];
        this.balls = [];
        this.capsules = [];
        this.boxes = [];
        this.cylinders = [];
        this.isolation = 1.0;
        this.fieldSentinel = -1e4;
        this.position = new (window.THREE.Vector3)();
        this.scale = new (window.THREE.Vector3)(1, 1, 1);

        this.edgeTable = [
            0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
            0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
            0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
            0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
            0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
            0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
            0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
            0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
            0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
            0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
            0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
            0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
            0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
            0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
            0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
            0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0
        ];

        this.triTable = [
            [-1],
            [0,8,3,-1],
            [0,1,9,-1],
            [1,8,3,9,8,1,-1],
            [1,2,10,-1],
            [0,8,3,1,2,10,-1],
            [9,2,10,0,2,9,-1],
            [2,8,3,2,10,8,10,9,8,-1],
            [3,11,2,-1],
            [0,11,2,8,11,0,-1],
            [1,9,0,2,3,11,-1],
            [1,11,2,1,9,11,9,8,11,-1],
            [3,10,1,11,10,3,-1],
            [0,10,1,0,8,10,8,11,10,-1],
            [3,9,0,3,11,9,11,10,9,-1],
            [9,8,10,10,8,11,-1],
            [4,7,8,-1],
            [4,3,0,7,3,4,-1],
            [0,1,9,8,4,7,-1],
            [4,1,9,4,7,1,7,3,1,-1],
            [1,2,10,8,4,7,-1],
            [3,4,7,3,0,4,1,2,10,-1],
            [9,2,10,9,0,2,8,4,7,-1],
            [2,10,9,2,9,7,2,7,3,7,9,4,-1],
            [8,4,7,3,11,2,-1],
            [11,4,7,11,2,4,2,0,4,-1],
            [9,0,1,8,4,7,2,3,11,-1],
            [4,7,11,9,4,11,9,11,2,9,2,1,-1],
            [3,10,1,3,11,10,7,8,4,-1],
            [1,11,10,1,4,11,1,0,4,7,11,4,-1],
            [4,7,8,9,0,11,9,11,10,11,0,3,-1],
            [4,7,11,4,11,9,9,11,10,-1],
            [9,5,4,-1],
            [9,5,4,0,8,3,-1],
            [0,5,4,1,5,0,-1],
            [8,5,4,8,3,5,3,1,5,-1],
            [1,2,10,9,5,4,-1],
            [3,0,8,1,2,10,4,9,5,-1],
            [5,2,10,5,4,2,4,0,2,-1],
            [2,10,5,3,2,5,3,5,4,3,4,8,-1],
            [9,5,4,2,3,11,-1],
            [0,11,2,0,8,11,4,9,5,-1],
            [0,5,4,0,1,5,2,3,11,-1],
            [2,1,5,2,5,8,2,8,11,4,8,5,-1],
            [10,3,11,10,1,3,9,5,4,-1],
            [4,9,5,0,8,1,8,10,1,8,11,10,-1],
            [5,4,0,5,0,11,5,11,10,11,0,3,-1],
            [5,4,8,5,8,10,10,8,11,-1],
            [9,7,8,5,7,9,-1],
            [9,3,0,9,5,3,5,7,3,-1],
            [0,7,8,0,1,7,1,5,7,-1],
            [1,5,3,3,5,7,-1],
            [9,7,8,9,5,7,10,1,2,-1],
            [10,1,2,9,5,0,5,3,0,5,7,3,-1],
            [8,0,2,8,2,5,8,5,7,10,5,2,-1],
            [2,10,5,2,5,3,3,5,7,-1],
            [7,9,5,7,8,9,3,11,2,-1],
            [9,5,7,9,7,2,9,2,0,2,7,11,-1],
            [2,3,11,0,1,8,1,7,8,1,5,7,-1],
            [11,2,1,11,1,7,7,1,5,-1],
            [9,5,8,8,5,7,10,1,3,10,3,11,-1],
            [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],
            [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],
            [11,10,5,7,11,5,-1],
            [10,6,5,-1],
            [0,8,3,5,10,6,-1],
            [9,0,1,5,10,6,-1],
            [1,8,3,1,9,8,5,10,6,-1],
            [1,6,5,2,6,1,-1],
            [1,6,5,1,2,6,3,0,8,-1],
            [9,6,5,9,0,6,0,2,6,-1],
            [5,9,8,5,8,2,5,2,6,3,2,8,-1],
            [2,3,11,10,6,5,-1],
            [11,0,8,11,2,0,10,6,5,-1],
            [0,1,9,2,3,11,5,10,6,-1],
            [5,10,6,1,9,2,9,11,2,9,8,11,-1],
            [6,3,11,6,5,3,5,1,3,-1],
            [0,8,11,0,11,5,0,5,1,5,11,6,-1],
            [3,11,6,0,3,6,0,6,5,0,5,9,-1],
            [6,5,9,6,9,11,11,9,8,-1],
            [5,10,6,4,7,8,-1],
            [4,3,0,4,7,3,6,5,10,-1],
            [1,9,0,5,10,6,8,4,7,-1],
            [10,6,5,1,9,7,1,7,3,7,9,4,-1],
            [6,1,2,6,5,1,4,7,8,-1],
            [1,2,5,5,2,6,3,0,4,3,4,7,-1],
            [8,4,7,9,0,5,0,6,5,0,2,6,-1],
            [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],
            [3,11,2,7,8,4,10,6,5,-1],
            [5,10,6,4,7,2,4,2,0,2,7,11,-1],
            [0,1,9,4,7,8,2,3,11,5,10,6,-1],
            [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],
            [8,4,7,3,11,5,3,5,1,5,11,6,-1],
            [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],
            [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],
            [6,5,9,6,9,11,4,7,9,7,11,9,-1],
            [10,4,9,6,4,10,-1],
            [4,10,6,4,9,10,0,8,3,-1],
            [10,0,1,10,6,0,6,4,0,-1],
            [8,3,1,8,1,6,8,6,4,6,1,10,-1],
            [1,4,9,1,2,4,2,6,4,-1],
            [3,0,8,1,2,9,2,4,9,2,6,4,-1],
            [0,2,4,4,2,6,-1],
            [8,3,2,8,2,4,4,2,6,-1],
            [10,4,9,10,6,4,11,2,3,-1],
            [0,8,2,2,8,11,4,9,10,4,10,6,-1],
            [3,11,2,0,1,6,0,6,4,6,1,10,-1],
            [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],
            [9,6,4,9,3,6,9,1,3,11,6,3,-1],
            [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],
            [3,11,6,3,6,0,0,6,4,-1],
            [6,4,8,11,6,8,-1],
            [7,10,6,7,8,10,8,9,10,-1],
            [0,7,3,0,10,7,0,9,10,6,7,10,-1],
            [10,6,7,1,10,7,1,7,8,1,8,0,-1],
            [10,6,7,10,7,1,1,7,3,-1],
            [1,2,6,1,6,8,1,8,9,8,6,7,-1],
            [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],
            [7,8,0,7,0,6,6,0,2,-1],
            [7,3,2,6,7,2,-1],
            [2,3,11,10,6,8,10,8,9,8,6,7,-1],
            [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],
            [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],
            [11,2,1,11,1,7,10,6,1,6,7,1,-1],
            [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],
            [0,9,1,11,6,7,-1],
            [7,8,0,7,0,6,3,11,0,11,6,0,-1],
            [7,11,6,-1],
            [7,6,11,-1],
            [3,0,8,11,7,6,-1],
            [0,1,9,11,7,6,-1],
            [8,1,9,8,3,1,11,7,6,-1],
            [10,1,2,6,11,7,-1],
            [1,2,10,3,0,8,6,11,7,-1],
            [2,9,0,2,10,9,6,11,7,-1],
            [6,11,7,2,10,3,10,8,3,10,9,8,-1],
            [7,2,3,6,2,7,-1],
            [7,0,8,7,6,0,6,2,0,-1],
            [2,7,6,2,3,7,0,1,9,-1],
            [1,6,2,1,8,6,1,9,8,8,7,6,-1],
            [10,7,6,10,1,7,1,3,7,-1],
            [10,7,6,1,7,10,1,8,7,1,0,8,-1],
            [0,3,7,0,7,10,0,10,9,6,10,7,-1],
            [7,6,10,7,10,8,8,10,9,-1],
            [6,8,4,11,8,6,-1],
            [3,6,11,3,0,6,0,4,6,-1],
            [8,6,11,8,4,6,9,0,1,-1],
            [9,4,6,9,6,3,9,3,1,11,3,6,-1],
            [6,8,4,6,11,8,2,10,1,-1],
            [1,2,10,3,0,11,0,6,11,0,4,6,-1],
            [4,11,8,4,6,11,0,2,9,2,10,9,-1],
            [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],
            [8,2,3,8,4,2,4,6,2,-1],
            [0,4,2,4,6,2,-1],
            [1,9,0,2,3,4,2,4,6,4,3,8,-1],
            [1,9,4,1,4,2,2,4,6,-1],
            [8,1,3,8,6,1,8,4,6,6,10,1,-1],
            [10,1,0,10,0,6,6,0,4,-1],
            [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],
            [10,9,4,6,10,4,-1],
            [4,9,5,7,6,11,-1],
            [0,8,3,4,9,5,11,7,6,-1],
            [5,0,1,5,4,0,7,6,11,-1],
            [11,7,6,8,3,4,3,5,4,3,1,5,-1],
            [9,5,4,10,1,2,7,6,11,-1],
            [6,11,7,1,2,10,0,8,3,4,9,5,-1],
            [7,6,11,5,4,10,4,2,10,4,0,2,-1],
            [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],
            [7,2,3,7,6,2,5,4,9,-1],
            [9,5,4,0,8,6,0,6,2,6,8,7,-1],
            [3,6,2,3,7,6,1,5,0,5,4,0,-1],
            [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],
            [9,5,4,10,1,6,1,7,6,1,3,7,-1],
            [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],
            [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],
            [7,6,10,7,10,8,5,4,10,4,8,10,-1],
            [6,9,5,6,11,9,11,8,9,-1],
            [3,6,11,0,6,3,0,5,6,0,9,5,-1],
            [0,11,8,0,5,11,0,1,5,5,6,11,-1],
            [6,11,3,6,3,5,5,3,1,-1],
            [1,2,10,9,5,11,9,11,8,11,5,6,-1],
            [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],
            [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],
            [6,11,3,6,3,5,2,10,3,10,5,3,-1],
            [5,8,9,5,2,8,5,6,2,3,8,2,-1],
            [9,5,6,9,6,0,0,6,2,-1],
            [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],
            [1,5,6,2,1,6,-1],
            [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],
            [10,1,0,10,0,6,9,5,0,5,6,0,-1],
            [0,3,8,5,6,10,-1],
            [10,5,6,-1],
            [11,5,10,7,5,11,-1],
            [11,5,10,11,7,5,8,3,0,-1],
            [5,11,7,5,10,11,1,9,0,-1],
            [10,7,5,10,11,7,9,8,1,8,3,1,-1],
            [11,1,2,11,7,1,7,5,1,-1],
            [0,8,3,1,2,7,1,7,5,7,2,11,-1],
            [9,7,5,9,2,7,9,0,2,2,11,7,-1],
            [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],
            [2,5,10,2,3,5,3,7,5,-1],
            [8,2,0,8,5,2,8,7,5,10,2,5,-1],
            [9,0,1,5,10,3,5,3,7,3,10,2,-1],
            [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],
            [1,3,5,3,7,5,-1],
            [0,8,7,0,7,1,1,7,5,-1],
            [9,0,3,9,3,5,5,3,7,-1],
            [9,8,7,5,9,7,-1],
            [5,8,4,5,10,8,10,11,8,-1],
            [5,0,4,5,11,0,5,10,11,11,3,0,-1],
            [0,1,9,8,4,10,8,10,11,10,4,5,-1],
            [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],
            [2,5,1,2,8,5,2,11,8,4,5,8,-1],
            [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],
            [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],
            [9,4,5,2,11,3,-1],
            [2,5,10,3,5,2,3,4,5,3,8,4,-1],
            [5,10,2,5,2,4,4,2,0,-1],
            [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],
            [5,10,2,5,2,4,1,9,2,9,4,2,-1],
            [8,4,5,8,5,3,3,5,1,-1],
            [0,4,5,1,0,5,-1],
            [8,4,5,8,5,3,9,0,5,0,3,5,-1],
            [9,4,5,-1],
            [4,11,7,4,9,11,9,10,11,-1],
            [0,8,3,4,9,7,9,11,7,9,10,11,-1],
            [1,10,11,1,11,4,1,4,0,7,4,11,-1],
            [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],
            [4,11,7,9,11,4,9,2,11,9,1,2,-1],
            [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],
            [11,7,4,11,4,2,2,4,0,-1],
            [11,7,4,11,4,2,8,3,4,3,2,4,-1],
            [2,9,10,2,7,9,2,3,7,7,4,9,-1],
            [9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],
            [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],
            [1,10,2,8,7,4,-1],
            [4,9,1,4,1,7,7,1,3,-1],
            [4,9,1,4,1,7,0,8,1,8,7,1,-1],
            [4,0,3,7,4,3,-1],
            [4,8,7,-1],
            [9,10,8,10,11,8,-1],
            [3,0,9,3,9,11,11,9,10,-1],
            [0,1,10,0,10,8,8,10,11,-1],
            [3,1,10,11,3,10,-1],
            [1,2,11,1,11,9,9,11,8,-1],
            [3,0,9,3,9,11,1,2,9,2,11,9,-1],
            [0,2,11,8,0,11,-1],
            [3,2,11,-1],
            [2,3,8,2,8,10,10,8,9,-1],
            [9,10,2,0,9,2,-1],
            [2,3,8,2,8,10,0,1,8,1,10,8,-1],
            [1,10,2,-1],
            [1,3,8,9,1,8,-1],
            [0,9,1,-1],
            [0,3,8,-1],
            [-1]
        ];

        this.init(this.resolution);
    }

    init(s) {
        this.resolution = s;
        this.field = new Float32Array(s * s * s);
    }

    reset() {
        this.balls = [];
        this.capsules = [];
        this.boxes = [];
        this.cylinders = [];
        if (this.field) this.field.fill(0);
    }

    addBall(pos, strength, subtract = 0.2) {
        this.balls.push({ pos: pos.clone(), strength, subtract });
    }

    addCapsule(p1, p2, r1, r2) {
        this.capsules.push({
            ax: p1.x, ay: p1.y, az: p1.z,
            bx: p2.x, by: p2.y, bz: p2.z,
            r1, r2
        });
    }

    addBox(center, quaternion, hx, hy, hz) {
        this.boxes.push({
            cx: center.x, cy: center.y, cz: center.z,
            qx: quaternion.x, qy: quaternion.y, qz: quaternion.z, qw: quaternion.w,
            hx, hy, hz
        });
    }

    addCylinder(center, quaternion, radius, halfHeight) {
        this.cylinders.push({
            cx: center.x, cy: center.y, cz: center.z,
            qx: quaternion.x, qy: quaternion.y, qz: quaternion.z, qw: quaternion.w,
            radius, halfHeight
        });
    }

    update() {
        if (this.capsules.length || this.boxes.length || this.cylinders.length) {
            this.updateSDF();
            return;
        }
        this.updateBalls();
    }

    updateBalls() {
        const s = this.resolution;
        this.field.fill(0);
        const invScaleX = s / (this.scale.x || 1);
        const invScaleY = s / (this.scale.y || 1);
        const invScaleZ = s / (this.scale.z || 1);
        const halfS = s / 2;

        for (let b = 0; b < this.balls.length; b++) {
            const ball = this.balls[b];
            const pos = ball.pos;
            const str2 = ball.strength * ball.strength;

            const ballx = (pos.x - this.position.x) * invScaleX + halfS;
            const bally = (pos.y - this.position.y) * invScaleY + halfS;
            const ballz = (pos.z - this.position.z) * invScaleZ + halfS;

            // Bounding box optimization: only evaluate within effective radius
            const radius = Math.ceil(ball.strength * Math.max(invScaleX, invScaleY, invScaleZ) * 2.2);
            const minZ = Math.max(0, Math.floor(ballz - radius));
            const maxZ = Math.min(s - 1, Math.ceil(ballz + radius));
            const minY = Math.max(0, Math.floor(bally - radius));
            const maxY = Math.min(s - 1, Math.ceil(bally + radius));
            const minX = Math.max(0, Math.floor(ballx - radius));
            const maxX = Math.min(s - 1, Math.ceil(ballx + radius));

            for (let z = minZ; z <= maxZ; z++) {
                const dz2 = (z - ballz) * (z - ballz);
                const zOffset = z * s * s;
                for (let y = minY; y <= maxY; y++) {
                    const dy2 = (y - bally) * (y - bally);
                    const yOffset = zOffset + y * s;
                    for (let x = minX; x <= maxX; x++) {
                        const dx2 = (x - ballx) * (x - ballx);
                        const dist2 = dx2 + dy2 + dz2;
                        if (dist2 > 0.0001) {
                            this.field[yOffset + x] += str2 / dist2;
                        }
                    }
                }
            }
        }
    }

    worldToVoxel(wx, wy, wz) {
        const n = this.resolution - 1;
        return {
            x: (wx - (this.position.x - this.scale.x / 2)) * n / (this.scale.x || 1),
            y: (wy - (this.position.y - this.scale.y / 2)) * n / (this.scale.y || 1),
            z: (wz - (this.position.z - this.scale.z / 2)) * n / (this.scale.z || 1)
        };
    }

    paintSDF(minVx, minVy, minVz, maxVx, maxVy, maxVz, sdfAt) {
        const s = this.resolution;
        const x0 = Math.max(0, Math.floor(minVx));
        const y0 = Math.max(0, Math.floor(minVy));
        const z0 = Math.max(0, Math.floor(minVz));
        const x1 = Math.min(s - 1, Math.ceil(maxVx));
        const y1 = Math.min(s - 1, Math.ceil(maxVy));
        const z1 = Math.min(s - 1, Math.ceil(maxVz));
        const sx = this.scale.x / (s - 1);
        const sy = this.scale.y / (s - 1);
        const sz = this.scale.z / (s - 1);
        const ox = this.position.x - this.scale.x / 2;
        const oy = this.position.y - this.scale.y / 2;
        const oz = this.position.z - this.scale.z / 2;

        for (let z = z0; z <= z1; z++) {
            const wz = oz + z * sz;
            const zOffset = z * s * s;
            for (let y = y0; y <= y1; y++) {
                const wy = oy + y * sy;
                const yOffset = zOffset + y * s;
                for (let x = x0; x <= x1; x++) {
                    const wx = ox + x * sx;
                    const val = sdfAt(wx, wy, wz);
                    const idx = yOffset + x;
                    if (val > this.field[idx]) this.field[idx] = val;
                }
            }
        }
    }

    updateSDF() {
        const s = this.resolution;
        this.field.fill(this.fieldSentinel);
        const extra = 2;

        for (let i = 0; i < this.capsules.length; i++) {
            const c = this.capsules[i];
            const maxR = Math.max(c.r1, c.r2);
            const min = this.worldToVoxel(
                Math.min(c.ax, c.bx) - maxR,
                Math.min(c.ay, c.by) - maxR,
                Math.min(c.az, c.bz) - maxR
            );
            const max = this.worldToVoxel(
                Math.max(c.ax, c.bx) + maxR,
                Math.max(c.ay, c.by) + maxR,
                Math.max(c.az, c.bz) + maxR
            );
            this.paintSDF(min.x - extra, min.y - extra, min.z - extra, max.x + extra, max.y + extra, max.z + extra, (wx, wy, wz) => (
                capsuleInside(wx, wy, wz, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r1, c.r2)
            ));
        }

        for (let i = 0; i < this.boxes.length; i++) {
            const b = this.boxes[i];
            const reach = Math.hypot(b.hx, b.hy, b.hz);
            const min = this.worldToVoxel(b.cx - reach, b.cy - reach, b.cz - reach);
            const max = this.worldToVoxel(b.cx + reach, b.cy + reach, b.cz + reach);
            this.paintSDF(min.x - extra, min.y - extra, min.z - extra, max.x + extra, max.y + extra, max.z + extra, (wx, wy, wz) => (
                boxInside(wx, wy, wz, b)
            ));
        }

        for (let i = 0; i < this.cylinders.length; i++) {
            const c = this.cylinders[i];
            const reach = Math.hypot(c.radius, c.halfHeight);
            const min = this.worldToVoxel(c.cx - reach, c.cy - reach, c.cz - reach);
            const max = this.worldToVoxel(c.cx + reach, c.cy + reach, c.cz + reach);
            this.paintSDF(min.x - extra, min.y - extra, min.z - extra, max.x + extra, max.y + extra, max.z + extra, (wx, wy, wz) => (
                cylinderInside(wx, wy, wz, c)
            ));
        }
    }

    getFieldValue(x, y, z) {
        const s = this.resolution;
        return this.field[z * s * s + y * s + x];
    }

    /**
     * Chamfer undersides toward 45°, but only for maxDrop millimeters.
     * A full-hand silhouette would otherwise pour down into a staircase.
     * Nothing below floorY is changed, so a pedestal can keep a flat foot.
     */
    applySupportSlopes(floorY = -Infinity, maxDrop = Infinity) {
        const s = this.resolution;
        const n = s - 1;
        if (n < 2) return;
        const dx = this.scale.x / n;
        const dy = this.scale.y / n;
        const dz = this.scale.z / n;
        const oy = this.position.y - this.scale.y / 2;
        const diag = Math.hypot(dx, dz);
        const INF = 1e5;
        const mask = new Uint8Array(s * s * s);
        for (let i = 0; i < mask.length; i++) mask[i] = this.field[i] > this.isolation ? 1 : 0;

        const yStop = Math.max(1, Math.ceil((floorY - oy) / dy - 1e-6));
        const dist = new Float32Array(s * s);
        const added = new Uint8Array(s * s * s);
        const drop = new Float32Array(s * s * s);

        for (let y = s - 2; y >= yStop; y--) {
            for (let z = 0; z < s; z++) {
                const row = z * s;
                const mrow = (z * s + (y + 1)) * s;
                for (let x = 0; x < s; x++) dist[row + x] = mask[mrow + x] ? INF : 0;
            }
            for (let z = 0; z < s; z++) {
                for (let x = 0; x < s; x++) {
                    const i = rowIndex(z, x, s);
                    let d = dist[i];
                    if (x > 0) d = Math.min(d, dist[i - 1] + dx);
                    if (z > 0) d = Math.min(d, dist[i - s] + dz);
                    if (x > 0 && z > 0) d = Math.min(d, dist[i - s - 1] + diag);
                    if (x + 1 < s && z > 0) d = Math.min(d, dist[i - s + 1] + diag);
                    dist[i] = d;
                }
            }
            for (let z = s - 1; z >= 0; z--) {
                for (let x = s - 1; x >= 0; x--) {
                    const i = rowIndex(z, x, s);
                    let d = dist[i];
                    if (x + 1 < s) d = Math.min(d, dist[i + 1] + dx);
                    if (z + 1 < s) d = Math.min(d, dist[i + s] + dz);
                    if (x + 1 < s && z + 1 < s) d = Math.min(d, dist[i + s + 1] + diag);
                    if (x > 0 && z + 1 < s) d = Math.min(d, dist[i + s - 1] + diag);
                    dist[i] = d;
                }
            }

            for (let z = 1; z < s - 1; z++) {
                for (let x = 1; x < s - 1; x++) {
                    const above = (z * s + (y + 1)) * s + x;
                    const raw = dist[z * s + x];
                    const nextDrop = (mask[above] ? drop[above] : 0) + dy;
                    if (nextDrop > maxDrop) continue;
                    // The first step under the real surface keeps that footprint.
                    // Later steps move inward, and they stop after maxDrop.
                    const underSurface = mask[above] && !added[above];
                    const inside = underSurface ? (raw > 1e-4 ? Math.min(raw, dy) * 0.5 : -1) : raw - dy;
                    if (!(inside > 1e-4)) continue;
                    const idx = (z * s + y) * s + x;
                    if (inside > this.field[idx]) {
                        this.field[idx] = inside;
                        mask[idx] = 1;
                        added[idx] = 1;
                        drop[idx] = nextDrop;
                    }
                }
            }
        }
    }

    paintCone(cone) {
        const reach = Math.max(cone.r0, cone.r1);
        const min = this.worldToVoxel(cone.cx - reach, cone.y0, cone.cz - reach);
        const max = this.worldToVoxel(cone.cx + reach, cone.y1, cone.cz + reach);
        this.paintSDF(min.x - 2, min.y - 2, min.z - 2, max.x + 2, max.y + 2, max.z + 2, (wx, wy, wz) => (
            coneInside(wx, wy, wz, cone)
        ));
    }

    generateBufferGeometry() {
        this.update();
        if (typeof this.afterField === 'function') this.afterField();
        const THREE = window.THREE;
        const s = this.resolution;
        const verts = [];
        const p = [
            new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
            new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
        ];
        const dx = this.scale.x / (s - 1);
        const dy = this.scale.y / (s - 1);
        const dz = this.scale.z / (s - 1);
        const ox = this.position.x - this.scale.x / 2;
        const oy = this.position.y - this.scale.y / 2;
        const oz = this.position.z - this.scale.z / 2;

        for (let z = 0; z < s - 1; z++) {
            for (let y = 0; y < s - 1; y++) {
                for (let x = 0; x < s - 1; x++) {
                    const fx = ox + x * dx;
                    const fy = oy + y * dy;
                    const fz = oz + z * dz;

                    p[0].set(fx, fy, fz);
                    p[1].set(fx + dx, fy, fz);
                    p[2].set(fx + dx, fy, fz + dz);
                    p[3].set(fx, fy, fz + dz);
                    p[4].set(fx, fy + dy, fz);
                    p[5].set(fx + dx, fy + dy, fz);
                    p[6].set(fx + dx, fy + dy, fz + dz);
                    p[7].set(fx, fy + dy, fz + dz);

                    const f = [
                        this.getFieldValue(x, y, z),
                        this.getFieldValue(x + 1, y, z),
                        this.getFieldValue(x + 1, y, z + 1),
                        this.getFieldValue(x, y, z + 1),
                        this.getFieldValue(x, y + 1, z),
                        this.getFieldValue(x + 1, y + 1, z),
                        this.getFieldValue(x + 1, y + 1, z + 1),
                        this.getFieldValue(x, y + 1, z + 1)
                    ];

                    let cubeindex = 0;
                    if (f[0] > this.isolation) cubeindex |= 1;
                    if (f[1] > this.isolation) cubeindex |= 2;
                    if (f[2] > this.isolation) cubeindex |= 4;
                    if (f[3] > this.isolation) cubeindex |= 8;
                    if (f[4] > this.isolation) cubeindex |= 16;
                    if (f[5] > this.isolation) cubeindex |= 32;
                    if (f[6] > this.isolation) cubeindex |= 64;
                    if (f[7] > this.isolation) cubeindex |= 128;

                    const bits = this.edgeTable[cubeindex];
                    if (bits === 0) continue;

                    const vertlist = new Array(12);
                    if (bits & 1) vertlist[0] = p[0].clone().lerp(p[1], (this.isolation - f[0]) / (f[1] - f[0] || 0.0001));
                    if (bits & 2) vertlist[1] = p[1].clone().lerp(p[2], (this.isolation - f[1]) / (f[2] - f[1] || 0.0001));
                    if (bits & 4) vertlist[2] = p[2].clone().lerp(p[3], (this.isolation - f[2]) / (f[3] - f[2] || 0.0001));
                    if (bits & 8) vertlist[3] = p[3].clone().lerp(p[0], (this.isolation - f[3]) / (f[0] - f[3] || 0.0001));
                    if (bits & 16) vertlist[4] = p[4].clone().lerp(p[5], (this.isolation - f[4]) / (f[5] - f[4] || 0.0001));
                    if (bits & 32) vertlist[5] = p[5].clone().lerp(p[6], (this.isolation - f[5]) / (f[6] - f[5] || 0.0001));
                    if (bits & 64) vertlist[6] = p[6].clone().lerp(p[7], (this.isolation - f[6]) / (f[7] - f[6] || 0.0001));
                    if (bits & 128) vertlist[7] = p[7].clone().lerp(p[4], (this.isolation - f[7]) / (f[4] - f[7] || 0.0001));
                    if (bits & 256) vertlist[8] = p[0].clone().lerp(p[4], (this.isolation - f[0]) / (f[4] - f[0] || 0.0001));
                    if (bits & 512) vertlist[9] = p[1].clone().lerp(p[5], (this.isolation - f[1]) / (f[5] - f[1] || 0.0001));
                    if (bits & 1024) vertlist[10] = p[2].clone().lerp(p[6], (this.isolation - f[2]) / (f[6] - f[2] || 0.0001));
                    if (bits & 2048) vertlist[11] = p[3].clone().lerp(p[7], (this.isolation - f[3]) / (f[7] - f[3] || 0.0001));

                    const tri = this.triTable[cubeindex];
                    if (!tri) continue;
                    for (let i = 0; i + 2 < tri.length && tri[i] !== -1; i += 3) {
                        verts.push(vertlist[tri[i]].x, vertlist[tri[i]].y, vertlist[tri[i]].z);
                        verts.push(vertlist[tri[i + 1]].x, vertlist[tri[i + 1]].y, vertlist[tri[i + 1]].z);
                        verts.push(vertlist[tri[i + 2]].x, vertlist[tri[i + 2]].y, vertlist[tri[i + 2]].z);
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.computeVertexNormals();
        this.reset();
        return geometry;
    }
}

function rowIndex(z, x, s) {
    return z * s + x;
}

function coneInside(px, py, pz, cone) {
    const height = cone.y1 - cone.y0 || 1;
    const t = (py - cone.y0) / height;
    const radialAt = (radius) => radius - Math.hypot(px - cone.cx, pz - cone.cz);
    if (t < 0 || t > 1) {
        const axial = t < 0 ? py - cone.y0 : cone.y1 - py;
        return Math.min(radialAt(t < 0 ? cone.r0 : cone.r1), axial);
    }
    const radius = cone.r0 + (cone.r1 - cone.r0) * t;
    const axial = Math.min(py - cone.y0, cone.y1 - py);
    return Math.min(radialAt(radius), axial);
}

function capsuleInside(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const abLen2 = abx * abx + aby * aby + abz * abz;
    let t = 0;
    if (abLen2 > 1e-8) {
        t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLen2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
    }
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const cz = az + abz * t;
    const dist = Math.hypot(px - cx, py - cy, pz - cz);
    const radius = r1 + (r2 - r1) * t;
    return radius - dist;
}

function rotateByInverseQuat(qx, qy, qz, qw, vx, vy, vz) {
    const iqx = -qx;
    const iqy = -qy;
    const iqz = -qz;
    const tx = 2 * (iqy * vz - iqz * vy);
    const ty = 2 * (iqz * vx - iqx * vz);
    const tz = 2 * (iqx * vy - iqy * vx);
    return {
        x: vx + qw * tx + (iqy * tz - iqz * ty),
        y: vy + qw * ty + (iqz * tx - iqx * tz),
        z: vz + qw * tz + (iqx * ty - iqy * tx)
    };
}

function boxInside(px, py, pz, box) {
    const local = rotateByInverseQuat(box.qx, box.qy, box.qz, box.qw, px - box.cx, py - box.cy, pz - box.cz);
    const dx = box.hx - Math.abs(local.x);
    const dy = box.hy - Math.abs(local.y);
    const dz = box.hz - Math.abs(local.z);
    return Math.min(dx, dy, dz);
}

function cylinderInside(px, py, pz, cyl) {
    const local = rotateByInverseQuat(cyl.qx, cyl.qy, cyl.qz, cyl.qw, px - cyl.cx, py - cyl.cy, pz - cyl.cz);
    const radial = cyl.radius - Math.hypot(local.x, local.z);
    const axial = cyl.halfHeight - Math.abs(local.y);
    return Math.min(radial, axial);
}
