Eye e1, e2;
float rotationAngle = 0.0;  // Rotation angle for the entire scene
float rotationSpeed = 0.01; // Slow rotation speed
float rotationX = 0.0;  // For 3D X-axis rotation
float rotationY = 0.0;  // For 3D Y-axis rotation
boolean is3D = false;  // Flag for 3D rotation
PImage img;


void setup() {
  //size(640, 360, P3D);  // Set P3D renderer for 3D support
  fullScreen(P3D);
  noStroke();
  noSmooth();
  img = loadImage("roll.jpg");
  
  
  // Adjusting the x-coordinates to center the eyes
  int eyeDistance = 140;  // Distance between the centers of the two eyes
  int centerX = width / 2;  // Center of the canvas
  
  // Position eyes symmetrically around the center
  e1 = new Eye(centerX - eyeDistance / 2, height / 3, 120);
  e2 = new Eye(centerX + eyeDistance / 2, height / 3, 120);  
}
float bgColor;

void draw() {
  bgColor = lerp(bgColor, mouseX, 0.5);
  println(bgColor);
  background(bgColor, 0, 0);
  //image(img, 0, 0);  // Display at full opacity

  // Set rotation speed based on mouse click
  if (mousePressed) {
    rotationSpeed = 0.1;
  } else {
    rotationSpeed = 0;
  }

  // Update the rotation angle for 2D rotation
  rotationAngle += rotationSpeed;

  // Check if spacebar is pressed for 3D rotation
  if (is3D) {
    rotationX += 0.02;  // Rotate faster on the X-axis
    rotationY += 0.03;  // Rotate faster on the Y-axis
  }
  
  // Translate to the center of the canvas and apply 2D/3D rotations
  pushMatrix();
  translate(width / 2, height / 2);
  
  if (is3D) {
    rotateX(rotationX);  // Apply 3D rotation on the X-axis
    rotateY(rotationY);  // Apply 3D rotation on the Y-axis
  } else {
    rotate(rotationAngle);  // Normal 2D rotation
  }
  
  translate(-width / 2, -height / 2);  // Translate back after rotation

  // Update and display the eyes, nose, and mouth
  e1.update(mouseX, mouseY);
  e2.update(mouseX, mouseY);

  if (mousePressed) {
    e1.enlarge();
    e2.enlarge();
  } else {
    e1.shrink();
    e2.shrink();
  }

  e1.display();
  e2.display();
  
  drawNose();
  drawMouth();

  popMatrix();  // Reset the transformation matrix after drawing the scene
}

// Detect key presses for various effects
void keyPressed() {
  if (key == ' ') { //Spacebar
    is3D = true;  // 3D rotation Mode
  }
}

// Detect key release for various effects
void keyReleased() {
  if (key == ' ') {
    is3D = false; 
  }
}

// Draw a simple nose
void drawNose() {
  fill(255, mouseY, 153);
  triangle(width/2 - 20, height/2 - 20, width/2 + 20, height/2 - 20, width/2, height/2 + 20);
}

// Draw a simple mouth
void drawMouth() {
  noFill();
  stroke(0);
  strokeWeight(4);
  arc(width/2, height/1.75, mouseX/10, mouseY/10, 0, PI);
}

class Eye {
  int x, y;
  int size;
  float angle = 0.0;
  int defaultSize;
  int enlargedSize;
  String shape = "circle";
  color shapeColor = color(153, 204, 0);
  
  Eye(int tx, int ty, int ts) {
    x = tx;
    y = ty;
    size = ts;
    defaultSize = ts;
    enlargedSize = ts + (int)random(100);  // How much bigger the eyes get on click
  }
  
  void update(int mx, int my) {
    angle = atan2(my - y, mx - x); //Tri to figure out where the pointer is in relational to the current pos of the eyes' x and y. (TODO: Eyes' x and y doesn't update when rotating, implement. Meh.)
  }
  
  void display() {
    pushMatrix();
    translate(x, y);
    fill(255);
    ellipse(0, 0, size, size);
    rotate(angle);
    tint(255, 30);
    image(img, rotationY, rotationX);
    
    // Set the fill color for the shape inside the eye
    fill(shapeColor);
    
    // Draw the random shape inside the eye
    switch (shape) {
      case "circle":
        ellipse(size / 4, 0, size / 2, size / 2);
        break;
      case "square":
        rectMode(CENTER);
        rect(size / 4, 0, size / 2, size / 2);
        break;
      case "hexagon":
        drawHexagon(size / 4, 0, size / 4);
        break;
    }
    
    popMatrix();
  }

  // Function to draw a hexagon
  void drawHexagon(float x, float y, float radius) {
    beginShape();
    for (int i = 0; i < 6; i++) {
      float angle = TWO_PI / 6 * i;
      float sx = x + cos(angle) * radius;
      float sy = y + sin(angle) * radius;
      vertex(sx, sy);
    }
    endShape(CLOSE);
  }

  // Enlarge the eye size
  void enlarge() {
    size = enlargedSize;
  }
  
  // Shrink back to the default size and randomize shape and color
  void shrink() {
    size = defaultSize;
    
    // Randomize the shape of the eye pupils
    int shapeType = int(random(3)); // 0 for circle, 1 for square, 2 for hexagon
    switch (shapeType) {
      case 0:
        shape = "circle";
        break;
      case 1:
        shape = "square";
        break;
      case 2:
        shape = "hexagon";
        break;
    }
    
    // Randomize the shape color
    shapeColor = color(random(255), random(255), random(255));
  }
}
