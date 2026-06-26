// Reusable SSD1306 OLED Display Geometry & Cutouts
import { makeCylinder, makeBox } from '../helpers.js';

export function generateOLEDGeometry(M) {
    if (!M) return null;

    const boardW = 26.0;
    const boardL = 26.0;
    const boardH = 1.6;
    let board = makeBox(M, boardW, boardL, boardH, true).translate([0, 0, -boardH / 2]);

    let screen = makeBox(M, 21.74, 16.60, 1.5, true).translate([0, 0, 1.5 / 2]);
    let active = makeBox(M, 21.74 - 1.0, 11.18, 0.2, true).translate([0, 1.5, 1.5 + 0.1]);

    const holeR = 2.2 / 2;
    let h1 = makeCylinder(M, holeR, 3.0, 16, true).translate([-12.35, 10.8, -boardH]);
    let h2 = makeCylinder(M, holeR, 3.0, 16, true).translate([12.35, 10.8, -boardH]);
    let h3 = makeCylinder(M, holeR, 3.0, 16, true).translate([-12.35, -11.1, -boardH]);
    let h4 = makeCylinder(M, holeR, 3.0, 16, true).translate([12.35, -11.1, -boardH]);

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

export function generateOLEDCutout(M) {
    if (!M) return null;

    let viewWindow = makeBox(M, 22.2, 17.0, 20.0, true).translate([0, 0, 0]);

    const holeR = 2.2 / 2;
    let h1 = makeCylinder(M, holeR, 20.0, 16, true).translate([-12.35, 10.8, 0]);
    let h2 = makeCylinder(M, holeR, 20.0, 16, true).translate([12.35, 10.8, 0]);
    let h3 = makeCylinder(M, holeR, 20.0, 16, true).translate([-12.35, -11.1, 0]);
    let h4 = makeCylinder(M, holeR, 20.0, 16, true).translate([12.35, -11.1, 0]);

    let boardClearance = makeBox(M, 27.0, 27.0, 4.0, true).translate([0, 0, -2.0]);

    let cutout = viewWindow.add(h1).add(h2).add(h3).add(h4).add(boardClearance);

    viewWindow.delete();
    h1.delete(); h2.delete(); h3.delete(); h4.delete();
    boardClearance.delete();

    return cutout;
}
