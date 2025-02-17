// From Daniel Shiffman's Coding Challenge #145: 2D Raycasting
// https://editor.p5js.org/SebastienR/sketches/mpTerXYIy
// https://youtu.be/TOEi6T2mtHo


// Heavily modified by Dillon Simeone on 2/10/2025, for his creative coding 2 class's project 1 

let walls = []
let particle //The source of rays
let rays = 300 //More rays, more... Accurate it is.
let liquidParticles = [] // magical effects
let liquidParticlesLifeTime = 20

// 100%'ing what was requested for the project...
let phaseSlider, colorPicker;

function setup() {
  createCanvas(windowWidth, windowHeight)

  statsDiv = createDiv(`
      <h2>Creative Coding 2 - Project 1: Moon Phases</h2>
      <p>A creative exploration of raycasting and moon phases, blending physics-based light with magical effects.</p>
      <hr>
      <label>Rays: <input id="raysInput" type="number" value="${rays}" min="50" max="1000" step="10"></label>
      <br>
      <label>Liquid Particle Lifetime: <input id="lifetimeInput" type="number" value="${liquidParticlesLifeTime}" min="5" max="100" step="1"></label>
    `);

  // Get inputs and attach event listeners
  raysInput = select('#raysInput');
  lifetimeInput = select('#lifetimeInput');

  raysInput.input(() => {
    rays = constrain(int(raysInput.value()), 50, 1000);
    particle = new Particle(); // Reset particle system with new ray count
  });

  lifetimeInput.input(() => {
    liquidParticlesLifeTime = constrain(int(lifetimeInput.value()), 5, 100);
  });

  // Slider for manual phase control (0 - 30)
  phaseSlider = createSlider(0, 30, 15, 1);
  phaseSlider.position(width / 2 - 75, height * 0.9);

  // Color picker for moon color
  colorPicker = createColorPicker('#ffffcc');
  colorPicker.position(width / 2 + 100, height * 0.9);

  // Top, left, right and bottom of canvas. Need walls there for rays to appear.
  walls.push(new Boundary(0, 0, width, 0))
  walls.push(new Boundary(width, 0, width, height))
  walls.push(new Boundary(width, height, 0, height))
  walls.push(new Boundary(0, height, 0, 0))

  // Choose a radius for each moons.
  let r = windowWidth/20;
  // Resolutions for each moons.
  let numSegments = 30;

  // Adding moons to the sandbox
  walls = walls.concat(createThirdMoon(width / 6, height / 4, r, numSegments, false));
  walls = walls.concat(createHalfMoon(width / 3, height / 4, r, numSegments, false));
  walls = walls.concat(createFullMoon(width / 2, height / 4, r, numSegments));
  walls = walls.concat(createHalfMoon(width / 1.5, height / 4, r, numSegments, true));
  walls = walls.concat(createThirdMoon(width / 1.25, height / 4, r, numSegments, true));

  particle = new Particle(100, 200)
}

function draw() {
  background(0)

  particle.update(mouseX, mouseY)
  particle.show()
  particle.look(walls)

  for (let i = liquidParticles.length - 1; i >= 0; i--) {
    liquidParticles[i].update();
    liquidParticles[i].show();
    if (liquidParticles[i].isDead()) {
      liquidParticles.splice(i, 1); // Remove dead particles
    }
  }

  walls.forEach(wall => {
    wall.show()
  });

  drawMoon(width / 2, height / 2, 100, color(255, 255, 200), frameCount % 60);

  manualDrawMoon(width / 2, height * 0.8, 100);
}

// Function to draw a moon manually controlled by the slider
function manualDrawMoon(x, y, size) {
  push();
  translate(x, y);
  noStroke();

  let userColor = colorPicker.color();
  let userPhase = phaseSlider.value();

  fill(userColor);
  ellipse(0, 0, size);

  // Shadow controlled by slider
  let shadowOffset = map(userPhase, 0, 30, -size / 2, size / 2);
  fill(0);
  ellipse(shadowOffset, 0, size);

  pop();
}

// This moon shifts through phases by itself.
function drawMoon(x, y, size, color) {
  push();
  translate(x, y);
  noStroke();
  fill(color);

  // Draw full background moon
  ellipse(0, 0, size);

  // Oscillating shadow (moves back and forth)
  let shadowOffset = map(sin(frameCount * 0.02), -1, 1, -size / 2, size / 2);

  // Draw the moving shadow
  fill(0);
  ellipse(shadowOffset, 0, size);

  pop();
}


// Full Moon
function createFullMoon(cx, cy, r, numSegments = 50) {
  return Boundary.CreateArc(cx, cy, r, 0, TWO_PI, numSegments);
}

// Half Moon
function createHalfMoon(cx, cy, r, numSegments = 20, mirrored = false) {
  let boundaries = [];
  if (!mirrored) {
    let outerArc = Boundary.CreateArc(cx, cy, r, -HALF_PI, HALF_PI, numSegments);
    boundaries = boundaries.concat(outerArc);

    let pt1 = createVector(cx + r * cos(HALF_PI), cy + r * sin(HALF_PI)); // bottom
    let pt2 = createVector(cx + r * cos(-HALF_PI), cy + r * sin(-HALF_PI)); // top
    boundaries.push(new Boundary(pt1.x, pt1.y, pt2.x, pt2.y));
  } else {
    let outerArc = Boundary.CreateArc(cx, cy, r, HALF_PI, 3 * HALF_PI, numSegments);
    boundaries = boundaries.concat(outerArc);

    let pt1 = createVector(cx + r * cos(3 * HALF_PI), cy + r * sin(3 * HALF_PI)); // bottom
    let pt2 = createVector(cx + r * cos(HALF_PI), cy + r * sin(HALF_PI)); // top
    boundaries.push(new Boundary(pt1.x, pt1.y, pt2.x, pt2.y));
  }

  return boundaries;
}

// Third Moon
function createThirdMoon(cx, cy, r, numSegments = 20, mirrored = false) {
  let boundaries = [];
  let d = 0.54 * r; // Offset for the shadow circle

  let dy = sqrt(r * r - (d / 2) * (d / 2));
  let theta = atan2(dy, d / 2); // Angle where the full circle and shadow circle intersect

  if (!mirrored) {
    // Waxing Crescent (lit on the right)

    // Outer arc (part of the full circle)
    let outerArc = Boundary.CreateArc(cx, cy, r, -theta - 0.3, theta + 0.3, numSegments);
    boundaries = boundaries.concat(outerArc);

    // Inner arc (shadow circle)
    let innerArc = Boundary.CreateArc(cx + d + 10, cy, r + 10, PI - theta - 0.7, PI + theta + 0.7, numSegments);

    // Instead of reversing, we mirror the coordinates to flip the inner arc
    for (let boundary of innerArc) {
      let mirroredA = createVector(2 * (cx + d) - boundary.a.x, boundary.a.y);
      let mirroredB = createVector(2 * (cx + d) - boundary.b.x, boundary.b.y);
      boundaries.push(new Boundary(mirroredA.x, mirroredA.y, mirroredB.x, mirroredB.y));
    }

  } else {
    // Waning Crescent (lit on the left)

    // Outer arc (part of the full circle)
    let outerArc = Boundary.CreateArc(cx, cy, r, PI - theta - 0.3, PI + theta + 0.3, numSegments);
    boundaries = boundaries.concat(outerArc);

    // Inner arc (shadow circle)
    let innerArc = Boundary.CreateArc(cx - d - 10, cy, r + 10, -theta - 0.7, theta + 0.7, numSegments);

    // Mirror the inner arc to flip it correctly
    for (let boundary of innerArc) {
      let mirroredA = createVector(2 * (cx - d) - boundary.a.x, boundary.a.y);
      let mirroredB = createVector(2 * (cx - d) - boundary.b.x, boundary.b.y);
      boundaries.push(new Boundary(mirroredA.x, mirroredA.y, mirroredB.x, mirroredB.y));
    }
  }

  return boundaries;
}