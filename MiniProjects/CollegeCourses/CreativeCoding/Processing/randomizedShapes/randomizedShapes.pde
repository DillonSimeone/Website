PImage clickMeTexture;
PImage[] shapeTextures;  // Array to hold textures for randomized shapes
boolean bgEnabled = true;

int maxShapes = 1000;
float cubeSize = 300;  // Half of the size of the invisible boundary cube

float angle = 0; //Used to rotate the main shape
ArrayList<Shape> shapes = new ArrayList<Shape>();
Shape mainCube;

void setup() {
  size(800, 800, P3D);  // Set up a 3D window

  // Load the texture for the main cube
  clickMeTexture = loadImage("clickMe.png");

  // Load an array of textures for the randomized shapes
  shapeTextures = new PImage[3];  // Adjust the size according to how many images you have
  shapeTextures[0] = loadImage("1.png");
  shapeTextures[1] = loadImage("2.png");
  shapeTextures[2] = loadImage("3.png");

  // Create the main cube
  mainCube = new Shape(0, 0, 0, 100, "cube", clickMeTexture, color(255));
}

void draw() {
  checkBackground(shapes.size(), maxShapes);
  lights();  // Enable lighting for a 3D effect

  // Display the main cube at the center
  translate(width / 2, height / 2);
  mainCube.display();
  mainCube.rotate();

  // Display and update all floating shapes
  for (Shape s : shapes) {
    s.update();  // Update the position
    checkCubeBounds(s);  // Check and bounce off the invisible cube walls
    s.display();  // Display the shape
  }
  
  for (int i = 0; i < shapes.size(); i++) {
  Shape s1 = shapes.get(i);
  for (int j = i + 1; j < shapes.size(); j++) {
    Shape s2 = shapes.get(j);

    if (checkCollision(s1, s2)) {
      handleCollision(s1, s2);  // Apply collision and velocity transfer
      }
    }
  }
}

void checkBackground(int currentShapeCount, int maxShapes) {
  if (bgEnabled) {
    background(255);
    float noiseIntensity = map(currentShapeCount, 0, maxShapes, 0, 255);  // Map shape count to noise intensity
    
    // Create a fading static effect as shape count approaches the max
    for (int i = 0; i < width; i += 10) {
      for (int j = 0; j < height; j += 10) {
        float noiseValue = random(noiseIntensity);  // Random noise based on intensity
        fill(noiseValue);
        noStroke();
        rect(i, j, 10, 10);  // Small rectangles to simulate static
      }
    }
  }
}

void mousePressed() {
   ArrayList<Shape> newShapes = new ArrayList<Shape>();  // Temporary list for new shapes (You can't modify an array when it's in use.)

  if (mainCube.isHovered()) {
    newShapes.add(spawnRandomShape(0, 0, 0));  // Spawn a shape from the main cube
  }

  // Check if any random shape is clicked
  for (Shape s : shapes) {
    if (s.isHovered()) {
      newShapes.add(spawnRandomShape((s.x + 10), (s.y + 10), (s.z + 10)));  // Spawn a shape from the clicked shape
    }
  }

  shapes.addAll(newShapes);
  
  while (shapes.size() > maxShapes) {
    shapes.remove(0);  // Remove the oldest shape (first in the list)
  }

  if (mouseButton == RIGHT) {
    bgEnabled = !bgEnabled;
  }
}

boolean checkCollision(Shape s1, Shape s2) {
  float distance = dist(s1.x, s1.y, s1.z, s2.x, s2.y, s2.z);
  float minDistance = s1.size / 2 + s2.size / 2;  // Consider size as the hitbox

  return distance < minDistance;  // Collision happens when distance is less than hitbox size
}

void checkCubeBounds(Shape s) {
  // Check for collision with the boundary cube walls and invert velocity on impact
  
  // X-axis boundaries
  if (s.x - s.size / 2 < -cubeSize || s.x + s.size / 2 > cubeSize) {
    s.vx *= -1;
  }

  // Y-axis boundaries
  if (s.y - s.size / 2 < -cubeSize || s.y + s.size / 2 > cubeSize) {
    s.vy *= -1;
  }

  // Z-axis boundaries
  if (s.z - s.size / 2 < -cubeSize || s.z + s.size / 2 > cubeSize) {
    s.vz *= -1;
  }
}

void handleCollision(Shape s1, Shape s2) {
  // Calculate the vector between the two shapes
  PVector collisionVector = new PVector(s1.x - s2.x, s1.y - s2.y, s1.z - s2.z);

  // Calculate the distance between the centers
  float distance = collisionVector.mag();

  // Calculate the minimum distance to keep them from overlapping
  float minDistance = (s1.size / 2) + (s2.size / 2);

  // If they're stuck together (i.e., distance is less than minDistance), move them apart
  if (distance < minDistance) {
    // Normalize the collision vector and push the shapes apart equally
    collisionVector.normalize();
    float overlap = minDistance - distance;

    // Push each shape away from the other by half the overlap
    s1.x += collisionVector.x * overlap / 2;
    s1.y += collisionVector.y * overlap / 2;
    s1.z += collisionVector.z * overlap / 2;

    s2.x -= collisionVector.x * overlap / 2;
    s2.y -= collisionVector.y * overlap / 2;
    s2.z -= collisionVector.z * overlap / 2;
  }

  // Randomize velocity transfer
  PVector tempV1 = new PVector(s1.vx, s1.vy, s1.vz);
  PVector tempV2 = new PVector(s2.vx, s2.vy, s2.vz);

  // Exchange and randomize velocities on collision
  s1.vx = tempV2.x * random(0.5, 1.5);
  s1.vy = tempV2.y * random(0.5, 1.5);
  s1.vz = tempV2.z * random(0.5, 1.5);

  s2.vx = tempV1.x * random(0.5, 1.5);
  s2.vy = tempV1.y * random(0.5, 1.5);
  s2.vz = tempV1.z * random(0.5, 1.5);
}

Shape spawnRandomShape(float x, float y, float z) {
  String[] shapeTypes = {"cube", "sphere", "triangle", "polygon"};
  String randomShapeType = shapeTypes[(int) random(0, shapeTypes.length)];

  PImage randomTexture = null;
  color randomColor = color(random(255), random(255), random(255));

  if (!randomShapeType.equals("sphere")) {
    randomTexture = shapeTextures[(int) random(0, shapeTextures.length)];
  }

  return new Shape(x, y, z, random(10, 100), random(-10, 10), random(-10, 10), random(-10, 10), randomTexture, randomColor, randomShapeType);
}

// Shape class definition
class Shape {
  float x, y, z;
  float size;
  float vx, vy, vz;  // Velocity
  float rotX = 0;
  float rotY = 0;
  float rotSpeed = 0.01;
  PImage texture;  // Texture for the shape
  color shapeColor;  // Color for the shape (only used for spheres)
  String shapeType;  // The type of shape (cube, sphere, etc.)

  Shape(float x, float y, float z, float size, String shapeType, PImage texture, color shapeColor) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.size = size;
    this.shapeType = shapeType;
    this.texture = texture;
    this.shapeColor = shapeColor;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }

  Shape(float x, float y, float z, float size, float vx, float vy, float vz, PImage texture, color shapeColor, String shapeType) {
    this(x, y, z, size, shapeType, texture, shapeColor);
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
  }

  void update() {
    // Move the shape by its velocity
    x += vx;
    y += vy;
    z += vz;
  }

  void display() {
    pushMatrix();
    translate(x, y, z);
    rotateX(rotX);
    rotateY(rotY);

    // If the shape is a cube, triangle, or polygon, use textures. If it's a sphere, use random colors.
    if (shapeType.equals("cube")) {
      drawTexturedCube();
    } else if (shapeType.equals("sphere")) {
      drawColoredSphere();
    } else if (shapeType.equals("triangle")) {
      drawTexturedPyramid();
    } else if (shapeType.equals("polygon")) {
      drawTexturedPolygon(int(random(3, 8)));
    }

    popMatrix();
  }

  void rotate() {
    rotX += rotSpeed;
    rotY += rotSpeed;
  }

  void drawTexturedCube() {
    if (texture != null) {
      beginShape(QUADS);
      texture(texture);

      // Front face
      vertex(-size/2, -size/2, size/2, 0, 0);
      vertex(size/2, -size/2, size/2, texture.width, 0);
      vertex(size/2, size/2, size/2, texture.width, texture.height);
      vertex(-size/2, size/2, size/2, 0, texture.height);

      // Back face
      vertex(size/2, -size/2, -size/2, 0, 0);
      vertex(-size/2, -size/2, -size/2, texture.width, 0);
      vertex(-size/2, size/2, -size/2, texture.width, texture.height);
      vertex(size/2, size/2, -size/2, 0, texture.height);

      // Left face
      vertex(-size/2, -size/2, -size/2, 0, 0);
      vertex(-size/2, -size/2, size/2, texture.width, 0);
      vertex(-size/2, size/2, size/2, texture.width, texture.height);
      vertex(-size/2, size/2, -size/2, 0, texture.height);

      // Right face
      vertex(size/2, -size/2, size/2, 0, 0);
      vertex(size/2, -size/2, -size/2, texture.width, 0);
      vertex(size/2, size/2, -size/2, texture.width, texture.height);
      vertex(size/2, size/2, size/2, 0, texture.height);

      // Top face
      vertex(-size/2, -size/2, -size/2, 0, 0);
      vertex(size/2, -size/2, -size/2, texture.width, 0);
      vertex(size/2, -size/2, size/2, texture.width, texture.height);
      vertex(-size/2, -size/2, size/2, 0, texture.height);

      // Bottom face
      vertex(-size/2, size/2, size/2, 0, 0);
      vertex(size/2, size/2, size/2, texture.width, 0);
      vertex(size/2, size/2, -size/2, texture.width, texture.height);
      vertex(-size/2, size/2, -size/2, 0, texture.height);

      endShape();
    }
  }

  void drawColoredSphere() {
    fill(shapeColor);
    noStroke();
    sphereDetail(30);  // Add more detail to the sphere
    sphere(size / 2);
  }

  void drawTexturedPyramid() {
    if (texture != null) {
      beginShape(TRIANGLES);
      texture(texture);
      vertex(-size / 2, size / 2, -size / 2, 0, 0);
      vertex(size / 2, size / 2, -size / 2, texture.width, 0);
      vertex(0, -size / 2, 0, texture.width / 2, texture.height);
      endShape();
    }
  }

  void drawTexturedPolygon(int n) {
    if (texture != null) {
      beginShape();
      texture(texture);
      for (int i = 0; i < n; i++) {
        float angle = TWO_PI / n * i;
        float x = cos(angle) * size / 2;
        float y = sin(angle) * size / 2;
        vertex(x, y, 0, map(x, -size / 2, size / 2, 0, texture.width), map(y, -size / 2, size / 2, 0, texture.height));
      }
      endShape(CLOSE);
    }
  }

  boolean isHovered() {
    PVector screenPos = new PVector(x, y, z);
    screenPos = modelToScreen(screenPos);
    float distance = dist(mouseX, mouseY, screenPos.x, screenPos.y);
    return distance < size / 2;
  }

  PVector modelToScreen(PVector modelPos) {
    PVector screenPos = new PVector();
    float[] screenCoords = new float[4];
    screenCoords = modelviewToScreen(modelPos.x, modelPos.y, modelPos.z);
    screenPos.x = screenCoords[0];
    screenPos.y = screenCoords[1];
    return screenPos;
  }

  float[] modelviewToScreen(float x, float y, float z) {
    PVector vec = new PVector(x, y, z);
    PVector screen = new PVector();
    float[] mv = new float[16];
    getMatrix().get(mv);
    float w = mv[3] * vec.x + mv[7] * vec.y + mv[11] * vec.z + mv[15];
    screen.x = (mv[0] * vec.x + mv[4] * vec.y + mv[8] * vec.z + mv[12]) / w;
    screen.y = (mv[1] * vec.x + mv[5] * vec.y + mv[9] * vec.z + mv[13]) / w;
    screen.x = (screen.x + 1) / 2 * width;
    screen.y = (1 - screen.y) / 2 * height;
    return new float[] { screen.x, screen.y };
  }
}
