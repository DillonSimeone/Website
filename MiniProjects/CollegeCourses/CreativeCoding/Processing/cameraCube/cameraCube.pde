import processing.video.*;

Capture cam;
PImage boxTexture;

void setup() {
  size(640, 480, P3D);

  String[] cameras = Capture.list();
  
  if (cameras.length == 0) {
    println("There are no cameras available for capture.");
    exit();
  } else {
    println("Available cameras:");
    for (int i = 0; i < cameras.length; i++) {
      println(cameras[i]);
    }
    
    // The camera can be initialized directly using an 
    // element from the array returned by list():
    cam = new Capture(this, cameras[0]);
    cam.start();     
  }      
}

void draw() {
  if (cam.available() == true) {
    cam.read();
  }
  
  // Create the box texture from the camera image
  boxTexture = applyImageToBox(cam, 200);
  
  background(0);
  
  pushMatrix();
  translate(width/2, height/2);
  rotateY(radians(frameCount));
  rotateX(radians(frameCount/2));
  
  noStroke();
  textureMode(NORMAL);
  beginShape(QUADS);
  texture(boxTexture);
  
  // Front
  vertex(-100, -100, 100, 0.25, 0.3333);
  vertex(100, -100, 100, 0.5, 0.3333);
  vertex(100, 100, 100, 0.5, 0.6666);
  vertex(-100, 100, 100, 0.25, 0.6666);

  // Back
  vertex(100, -100, -100, 0.75, 0.3333);
  vertex(-100, -100, -100, 1, 0.3333);
  vertex(-100, 100, -100, 1, 0.6666);
  vertex(100, 100, -100, 0.75, 0.6666);

  // Left
  vertex(-100, -100, -100, 0, 0.3333);
  vertex(-100, -100, 100, 0.25, 0.3333);
  vertex(-100, 100, 100, 0.25, 0.6666);
  vertex(-100, 100, -100, 0, 0.6666);

  // Right
  vertex(100, -100, 100, 0.5, 0.3333);
  vertex(100, -100, -100, 0.75, 0.3333);
  vertex(100, 100, -100, 0.75, 0.6666);
  vertex(100, 100, 100, 0.5, 0.6666);

  // Top
  vertex(-100, -100, -100, 0.25, 0);
  vertex(100, -100, -100, 0.5, 0);
  vertex(100, -100, 100, 0.5, 0.3333);
  vertex(-100, -100, 100, 0.25, 0.3333);

  // Bottom
  vertex(-100, 100, 100, 0.25, 0.6666);
  vertex(100, 100, 100, 0.5, 0.6666);
  vertex(100, 100, -100, 0.5, 1);
  vertex(-100, 100, -100, 0.25, 1);

  endShape();
  
  popMatrix();
}

PImage applyImageToBox(PImage img, float size) {
  PGraphics pg = createGraphics(int(size * 4), int(size * 3), P3D);
  pg.beginDraw();
  pg.background(0, 0);
  
  // Front face
  pg.image(img, size, size, size, size);
  
  // Back face
  pg.image(img, size * 3, size, size, size);
  
  // Left face
  pg.image(img, 0, size, size, size);
  
  // Right face
  pg.image(img, size * 2, size, size, size);
  
  // Top face
  pg.image(img, size, 0, size, size);
  
  // Bottom face
  pg.image(img, size, size * 2, size, size);
  
  pg.endDraw();
  return pg;
}
