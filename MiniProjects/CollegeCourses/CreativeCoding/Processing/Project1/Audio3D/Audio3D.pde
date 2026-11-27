import ddf.minim.*;
import ddf.minim.analysis.*;
import queasycam.*;

Minim minim;
AudioPlayer song;
FFT fft;
QueasyCam cam;

// Variables to control spheres and spacing
int spheres = 2000;          // Number of spheres
float minDistance;           // Minimum distance between spheres (calculated)
float amplitude;             // Amplitude to be calculated in draw()

PVector[] spherePositions;

void setup() {
  //size(800, 800, P3D);
  fullScreen(P3D);
  
  minim = new Minim(this);
  song = minim.loadFile("1.wav");
  song.loop();
  
  fft = new FFT(song.bufferSize(), song.sampleRate());

  // Initialize QueasyCam
  cam = new QueasyCam(this);
  cam.speed = 50; // Set movement speed for WASD controls

  // Set perspective to extend the render distance (e.g., increase far clipping plane)
  float fov = PI / 3.0;  // Field of view (default: PI/3, you can increase or decrease this value)
  float aspect = (float) width / (float) height;  // Aspect ratio of the viewport
  float nearClip = 10;  // Near clipping plane (closer objects won't be rendered)
  float farClip = 100000; // Far clipping plane (increase to render distant objects)
  perspective(fov, aspect, nearClip, farClip);
  
  float boundingScale = spheres * 20; // Can't fit 1000000 spheres in the same space as 10 spheres!
  float boundingBox = max(800, boundingScale);

  // Set a reasonable minDistance based on the bounding box and the number of spheres
  minDistance = boundingBox / sqrt(spheres); // Calculate a minDistance based on space available

  // Initialize random positions for the spheres while respecting the minDistance
  spherePositions = new PVector[spheres];
  for (int i = 0; i < spheres; i++) {
    boolean validPosition = false;
    PVector position = new PVector();
    
    int attempts = 0; // Prevent infinite loops by setting an upper limit of attempts
    while (!validPosition && attempts < 1000) {
      float x = random(-boundingBox / 2, boundingBox / 2);
      float y = random(-boundingBox / 2, boundingBox / 2);
      float z = random(-boundingBox / 2, boundingBox / 2);
      position.set(x, y, z);
      
      validPosition = true;  // Assume it's valid unless proven otherwise
      
      // Check distance to all previously placed spheres
      for (int j = 0; j < i; j++) {
        if (position.dist(spherePositions[j]) < minDistance) {
          validPosition = false;  // Too close to another sphere
          break;
        }
      }
      attempts++;
    }

    if (attempts >= 1000) {
      println("Could not find a valid position for sphere " + i + " after 1000 attempts. Skipping.");
    } else {
      spherePositions[i] = position;
    }
  }
}

void draw() {
  background(0);
  
  // Perform FFT analysis to update amplitude values
  fft.forward(song.mix);
  amplitude = fft.getBand((int)random(fft.specSize())) * 0.5;

  drawSkybox();

  for (int i = 0; i < spheres; i++) {
    if (spherePositions[i] != null) {  // Only draw if position is assigned
      FFTsphere(spherePositions[i]);
    }
  }
}
float thickness = 1;
boolean growing = true;  // Variable to track the direction of growth

// Function to draw the skybox using a sphere
void drawSkybox() {
  pushMatrix();
  noFill();
  stroke(255, 0, 0);
  strokeWeight(thickness);

  // Adjust the thickness to create the "breathing" effect
  if (growing) {
    thickness += 0.05;  // Increase thickness
    if (thickness >= 10) {
      growing = false;  // Start decreasing once max thickness is reached
    }
  } else {
    thickness -= 0.05;  // Decrease thickness
    if (thickness <= 1) {
      growing = true;  // Start increasing once min thickness is reached
    }
  }

  float sphereSize = 5000; 


  sphereDetail(50);
  rotateY(radians(frameCount * 0.05));
  sphere(sphereSize);
  
  drawCubesOnSkybox(sphereSize);

  popMatrix();
}

// Function to draw cubes rising from the surface of the skybox sphere
void drawCubesOnSkybox(float sphereSize) {
  for (int i = 0; i < 10; i++) {
    pushMatrix();
    fill(0, 255, 0);
    stroke(0);
    strokeWeight(10);
    
    // Calculate random spherical coordinates
    float theta = random(TWO_PI);  // Angle around the y-axis
    float phi = random(PI);        // Angle from the z-axis

    // Convert spherical coordinates to Cartesian coordinates
    float x = sphereSize * sin(phi) * cos(theta);
    float y = sphereSize * sin(phi) * sin(theta);
    float z = sphereSize * cos(phi);

    // Translate to calculated position on the skybox sphere
    translate(x, y, z);

    // Rotate the cube to face the origin for a better effect
    rotateY(theta);
    rotateZ(phi);
    
    // Draw a cube with random height and width based on amplitude
    float cubeHeight = amplitude * random(100); // Height controlled by audio amplitude
    float cubeWidth = amplitude * random(50); // Random base size for cubes
    box(cubeWidth, cubeWidth, cubeHeight);
    
    popMatrix();
  }
}

// Function to draw an FFT-reactive sphere at a given position
void FFTsphere(PVector position) {
  pushMatrix();
  translate(position.x, position.y, position.z);
  
  // Randomly choose whether to fill or not for visual variety
  if (random(1) > 0.5) {
    noFill();
  } else {
    fill(0, 0.5);
  }

  // Apply rotation and visual effects based on amplitude
  rotateY(radians(frameCount * 0.5 * amplitude));
  rotateX(radians(frameCount * 0.2 * amplitude));
  
  // Set stroke color depending on amplitude
  if (amplitude < 0.4) {
    stroke(255, 255, 255);
  } else {
    stroke(random(255 * amplitude), random(255 * amplitude), random(255 * amplitude));
  }
  
  if(amplitude > 0)
    strokeWeight(amplitude);
  else
    strokeWeight(0.1);

  // Create reactive "spikes" based on FFT data
  float radius = random(100) + amplitude;
  sphereDetail(6);
  sphere(radius);
  
  popMatrix();
}

void stop() {
  song.close();
  minim.stop();
  super.stop();
}
