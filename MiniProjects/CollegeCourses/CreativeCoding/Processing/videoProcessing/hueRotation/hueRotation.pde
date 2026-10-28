import gab.opencv.*;
import processing.video.*;
import java.awt.Rectangle;

Capture video;
OpenCV opencv;

float deadzoneWidth = 200; // Adjustable width of the deadzone

int leftCounter = 0;
int rightCounter = 0;

String previousZone = "center"; // Initial previous zone
String currentZone = "center";

void setup() {
  size(640, 480);
  video = new Capture(this, 640, 480);
  opencv = new OpenCV(this, 640, 480);
  opencv.loadCascade(OpenCV.CASCADE_FRONTALFACE);

  video.start();

  // Set the color mode to RGB initially
  colorMode(RGB, 255);
}

void captureEvent(Capture c) {
  c.read();
}

void draw() {
  // Load the current video frame into OpenCV
  opencv.loadImage(video);
  video.loadPixels();

  // Detect faces in the video frame
  Rectangle[] faces = opencv.detect();
  if (faces.length > 0) {
    // Assume the first detected face
    Rectangle face = faces[0];
    int faceX = face.x + face.width/2; // X position of face center

    // Draw a rectangle around the detected face
    noFill();
    stroke(0, 255, 0);
    strokeWeight(3);
    rect(face.x, face.y, face.width, face.height);

    // Determine the current zone based on face position
    if (faceX < width/2 - deadzoneWidth/2) {
      currentZone = "left";
    } else if (faceX > width/2 + deadzoneWidth/2) {
      currentZone = "right";
    } else {
      currentZone = "center";
    }

    // Check for transitions from center to side zones
    if (previousZone.equals("center")) {
      if (currentZone.equals("left")) {
        leftCounter++;
      } else if (currentZone.equals("right")) {
        rightCounter++;
      }
    }

    // Update the previous zone
    previousZone = currentZone;

  } else {
    // If no face is detected, assume center zone
    currentZone = "center";
  }

  // Apply hue rotation filter to left and right sides separately
  colorMode(HSB, 255);

  float leftHueRotation = (leftCounter * 50) % 255;  // Increase for noticeable effect
  float rightHueRotation = (rightCounter * 50) % 255; // Increase for noticeable effect

  // Process the video image to apply hue rotation
  for (int y = 0; y < video.height; y++) {
    for (int x = 0; x < video.width; x++) {
      int i = x + y * video.width;
      color c = video.pixels[i];
      float h = hue(c);
      float s = saturation(c);
      float b = brightness(c);

      if (x < width/2 - deadzoneWidth/2) {
        // Left side
        h = (h + leftHueRotation) % 255;
      } else if (x > width/2 + deadzoneWidth/2) {
        // Right side
        h = (h + rightHueRotation) % 255;
      }
      // Else, in deadzone, do not change h

      video.pixels[i] = color(h, s, b);
    }
  }

  // Reset color mode to RGB
  colorMode(RGB, 255);

  // Update the video pixels and display the video
  video.updatePixels();
  image(video, 0, 0);

  // Display the counters on the screen
  fill(255);
  textSize(24);
  text("Left Counter: " + leftCounter, 10, 30);
  text("Right Counter: " + rightCounter, width - 200, 30);

  // Draw the deadzone boundaries
  stroke(255, 0, 0);
  line(width/2 - deadzoneWidth/2, 0, width/2 - deadzoneWidth/2, height);
  line(width/2 + deadzoneWidth/2, 0, width/2 + deadzoneWidth/2, height);
}
