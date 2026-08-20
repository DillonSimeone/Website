function setup() {
  createCanvas(window.innerWidth, window.innerHeight)
  noFill();
}

let t = 0; // interpolation factor
let reset = false; //If a loop have completed
let shapeMod = 0;
function draw() {
  background(255);
  
  
  // Calculate interpolation factor
  let duration = mouseX; // duration of the transition in frames
  t += 1 / duration;
  if (t > 1) {
    t = 0; // Reset interpolation factor
    reset = true;
  }

  let from = color(218, 165, 32);
  let to = color(0, 61, 139);
  let interA = lerpColor(from, to, t);
  fill(interA)

  if(reset == true){
    shapeMod = random(0, mouseY)
    reset = false;
  }
  
  // Interpolated vertices
    let x1 = lerp(100, 300 + shapeMod, t);
    let y1 = lerp(100, 100 - shapeMod, t);
    let x2 = lerp(300, 300 + shapeMod, t);
    let y2 = lerp(100, 300 + shapeMod, t);
    let x3 = lerp(300, 100 - shapeMod, t);
    let y3 = lerp(300, 300 + shapeMod, t);
    let x4 = lerp(100, 100, t);
    let y4 = lerp(300, 100, t);
  
  
  // Draw the interpolated shape
  beginShape();
  vertex(x1, y1);
  vertex(x2, y2);
  vertex(x3, y3);
  vertex(x4, y4);
  endShape(CLOSE);
}



