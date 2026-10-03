// Reusable SSD1306 OLED Display Geometry & Cutouts
import { makeCylinder, makeBox } from '../helpers.js';

export function generateOLEDGeometry(M, width = 25.0, height = 14.0, holeX = 21.0, holeY = 21.0) {
    if (!M) return null;

    const boardW = holeX + 4.5;
    const boardL = holeY + 4.5;
    const boardH = 1.6;
    let board = makeBox(M, boardW, boardL, boardH, true).translate([0, 0, -boardH / 2]);

    // Glass panel is width x height x 1.5, centered at y = 0
    let screen = makeBox(M, width, height, 1.5, true).translate([0, 0, 1.5 / 2]);
    // Active area is slightly smaller, centered at y = 0
    let active = makeBox(M, width - 2.0, height - 2.0, 0.2, true).translate([0, 0.0, 1.5 + 0.1]);

    const holeR = 3.2 / 2; // For M3 clearance / screw alignment
    let h1 = makeCylinder(M, holeR, 3.0, 16, true).translate([-holeX / 2, holeY / 2, -boardH]);
    let h2 = makeCylinder(M, holeR, 3.0, 16, true).translate([holeX / 2, holeY / 2, -boardH]);
    let h3 = makeCylinder(M, holeR, 3.0, 16, true).translate([-holeX / 2, -holeY / 2, -boardH]);
    let h4 = makeCylinder(M, holeR, 3.0, 16, true).translate([holeX / 2, -holeY / 2, -boardH]);

    let holes = h1.add(h2).add(h3).add(h4);
    let drilledBoard = board.subtract(holes);

    board.delete();
    holes.delete();
    h1.delete(); h2.delete(); h3.delete(); h4.delete();

    let oled = drilledBoard.add(screen).add(active);
    drilledBoard.delete();
    screen.delete();
    active.delete();

    return oled;
}

export function generateOLEDCutout(M, width = 25.0, height = 14.0, holeX = 21.0, holeY = 21.0) {
    if (!M) return null;

    // View window matching the screen, centered at y = 0
    let viewWindow = makeBox(M, width, height, 20.0, true).translate([0, 0, 0]);

    const holeR = 3.2 / 2; // For M3 screws
    let h1 = makeCylinder(M, holeR, 20.0, 16, true).translate([-holeX / 2, holeY / 2, 0]);
    let h2 = makeCylinder(M, holeR, 20.0, 16, true).translate([holeX / 2, holeY / 2, 0]);
    let h3 = makeCylinder(M, holeR, 20.0, 16, true).translate([-holeX / 2, -holeY / 2, 0]);
    let h4 = makeCylinder(M, holeR, 20.0, 16, true).translate([holeX / 2, -holeY / 2, 0]);

    // Board clearance
    let boardClearance = makeBox(M, holeX + 5.0, holeY + 5.0, 4.0, true).translate([0, 0, -2.0]);

    let cutout = viewWindow.add(h1).add(h2).add(h3).add(h4).add(boardClearance);

    viewWindow.delete();
    h1.delete(); h2.delete(); h3.delete(); h4.delete();
    boardClearance.delete();

    return cutout;
}
