/**
 * PoseSolver - The "Math Bridge"
 * Converts OpenCV's row-major 4x4 matrices into Three.js column-major world space.
 */

class PoseSolver {
    constructor(camera) {
        this.camera = camera;
        this._matrix = new THREE.Matrix4();

        // OpenCV to Three.js Coordinate conversion matrix
        // OpenCV: X+, Y(down)+, Z(forward)+
        // Three.js: X+, Y(up)+, Z(backward)+
        this._cvToThree = new THREE.Matrix4().set(
            1, 0, 0, 0,
            0, -1, 0, 0,
            0, 0, -1, 0,
            0, 0, 0, 1
        );
    }

    /**
     * @param {Array} corners - pixel corners (redundant but kept for API)
     * @param {number} imgWidth - frame width
     * @param {number} imgHeight - frame height
     * @param {Array} workerMatrix - The 16-float row-major matrix from OpenCV
     */
    solve(corners, imgWidth, imgHeight, workerMatrix) {
        if (!workerMatrix) return null;

        // 1. Load row-major matrix from worker (OpenCV format)
        // THREE.Matrix4.set() is row-major! So we can pass it directly.
        this._matrix.set(
            workerMatrix[0], workerMatrix[1], workerMatrix[2], workerMatrix[3],
            workerMatrix[4], workerMatrix[5], workerMatrix[6], workerMatrix[7],
            workerMatrix[8], workerMatrix[9], workerMatrix[10], workerMatrix[11],
            workerMatrix[12], workerMatrix[13], workerMatrix[14], workerMatrix[15]
        );

        // 2. Transpose it to Three.js column-major (Wait, Three.js .set is row-major, 
        // internally it stores column-major. So we are good after .set())

        // 3. Apply coordinate system flip (OpenCV -> Three.js)
        this._matrix.premultiply(this._cvToThree);

        // 4. Decompose for easy use in app.js
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        this._matrix.decompose(pos, quat, sc);

        return {
            position: pos,
            quaternion: quat
        };
    }
}

window.PoseSolver = PoseSolver;
