let cols;
let rows;
let current; // = new float[cols][rows];
let previous; // = new float[cols][rows];

let dampening = 0.995;
let width = 400;
let height = width;
let rippleInterval


function setup() {
  pixelDensity(1);
  createCanvas(width, height, WEBGL);
  cols = width;
  rows = height;
  // The following line initializes a 2D cols-by-rows array with zeroes
  // in every array cell, and is equivalent to this Processing line:
  // current = new float[cols][rows];
  current = new Array(cols).fill(0).map((n) => new Array(rows).fill(0));
  previous = new Array(cols).fill(0).map((n) => new Array(rows).fill(0));
  noStroke();
  setInterval(randomRipples, 200)
}

function mouseDragged() {
  //previous[mouseX][mouseY] = 3000;
}

function randomRipples(){
  previous[Math.floor(random(0, width))][Math.floor(random(0, height))] = Math.floor(random(0, 3000))
  console.log("ripple")
}

function draw() {
 background(0);

 loadPixels();
 
 for (let i = 1; i < cols - 1; i++) {
   for (let j = 1; j < rows - 1; j++) {
     current[i][j] =
       (
        previous[i - 1][j] +
        previous[i + 1][j] +
        previous[i][j - 1] +
        previous[i][j + 1]
      ) / 2 - current[i][j];
    let noiseNum = noise(i * j * 1) + 0.47  // uncomment to add noise
    let randNum = random(0.7,1.2); // If adding in noise, make second number 1.3.
    current[i][j] = current[i][j] * dampening* randNum //*noiseNum; //Remove "//" at left to add in noise.
     // Unlike in Processing, the pixels array in p5.js has 4 entries
     // for each pixel, so we have to multiply the index by 4 and then
     // set the entries for each color component separately.
     let index = (i + j * cols) * 4;
     pixels[index + 0] = current[i][j] / 4;
     pixels[index + 1] = current[i][j];
     pixels[index + 2] = current[i][j];
   }
 }
 updatePixels();

 let temp = previous;
 previous = current;
 current = temp;

 push();
 // Create an inverted mask.
 beginClip({ invert: true });
 triangle(15, 37, 30, 13, 43, 37);
 endClip();

 // Draw a backing shape.
 square(mouseX-200, mouseY-200, 100);
 pop();
}