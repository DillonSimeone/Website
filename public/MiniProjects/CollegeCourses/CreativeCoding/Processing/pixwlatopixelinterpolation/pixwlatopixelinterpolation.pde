PImage img1;
PImage img2;
int width = 600;
int pixelsToReplace = 0; // Track how many pixels to replace
int chunkSize = 1000; // How many pixels to replace per frame
int groupSize = 10; // Replace this many pixels in a group

void settings() { 
  size(width * 2, width); // Canvas size based on the image width
}

void setup(){
  frameRate(1000); // Set frame rate to a high value to run as fast as possible
  loadImages(); // Attempt to load images from the web or fallback to local files
}

void draw(){
  image(img1, 0, 0); // Display img1 on the left side
  image(img2, width, 0); // Display img2 on the right side

  // If there are pixels to replace, do it in small chunks per frame
  if (pixelsToReplace > 0) {
    for (int i = 0; i < chunkSize && pixelsToReplace > 0; i += groupSize) {
      int randomIndex = (int)random(0, width * width - groupSize); // Random index for the group
      for (int j = 0; j < groupSize; j++) {
        // Swap pixels between img1 and img2
        color temp = img1.pixels[randomIndex + j]; // Store img1's pixel in a temporary variable
        if(img2.pixels[randomIndex+j] != color(255, 255, 255)){
          img1.pixels[randomIndex + j] = img2.pixels[randomIndex + j]; // img1 gets img2's pixel
          img2.pixels[randomIndex + j] = temp; // img2 gets img1's pixel
          //img2.pixels[randomIndex + j] = color(255,255,255);
        }
        
        
      }
      pixelsToReplace -= groupSize; // Decrement the counter by the group size
    }
    img1.updatePixels(); // Update pixels in img1 after replacing
    img2.updatePixels(); // Update pixels in img2 after replacing
  }
   //img1.filter(BLUR,2);
}

void keyPressed() {
  if (key == ' ') { // Spacebar pressed
    pixelsToReplace = width * width; // Set the total number of pixels to replace
    img2.filter(BLUR,2);
  }
  if (key == 'a'){ // 'a' key pressed
    loadImages(); // Attempt to reload images from the web or fallback to local files
  }
}

// Function to load images from the web or fallback to local images if an error occurs
void loadImages() {
  try {
    println("Loading two new images...");
    img1 = loadImage("https://picsum.photos/" + str(width) + ".jpg");
    img2 = loadImage("https://picsum.photos/" + str(width) + ".jpg?grayscale"); // Load img2 as grayscale
    img1.loadPixels();
    img2.loadPixels();
    println("Loaded!");
  } catch (Exception e) {
    println("Failed to load images from the web, using local images instead.");
    img1 = loadImage("fallback1.jpg");
    img2 = loadImage("fallback2.jpg");
    img1.loadPixels();
    img2.loadPixels();
  }
}
