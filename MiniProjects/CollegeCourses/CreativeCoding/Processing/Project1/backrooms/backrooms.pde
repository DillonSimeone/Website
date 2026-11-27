import queasycam.*;
import java.util.Stack;

float roomSize = 1000;
float roomHeight = 1200;
ArrayList<Room> rooms = new ArrayList<Room>();
Room lastRoom;

PImage skyTexture;

String[] directions = {"north", "south", "east", "west"};
QueasyCam cam;

class Debris {
  PVector position;
  float size;
  color debrisColor;
  
  Debris(PVector position, float size, color debrisColor) {
    this.position = position;
    this.size = size;
    this.debrisColor = debrisColor;
  }
  
  void display() {
    pushMatrix();
    translate(position.x, position.y, position.z);
    fill(debrisColor);
    noStroke();
    box(size);
    popMatrix();
  }
}

class Room {
  int gridX, gridY; // Position in the grid
  PImage wallTexture, floorTexture, ceilingTexture;
  ArrayList<Debris> debrisList;
  
  // Walls are represented as booleans
  boolean wallNorth = true;
  boolean wallSouth = true;
  boolean wallEast = true;
  boolean wallWest = true;
  
  PVector orbPosition;
  PVector orbOffset;
  PVector orbMovement;
  color orbColor;
  float orbSize;
  float orbAngle;
  float orbSpeed;
  
  Room(int gridX, int gridY) {
    this.gridX = gridX;
    this.gridY = gridY;
    // Load default textures or set them later
    wallTexture = loadImage("wall.jpg");
    floorTexture = loadImage("floor.jpg");
    ceilingTexture = loadImage("ceiling.jpg");
    
    orbSize = random(1, 80);
    orbColor = color(random(50, 255), random(50, 255), random(50, 255));
    orbPosition = new PVector(0, roomHeight / 2, 0);
    orbOffset = new PVector(random(-roomSize / 4, roomSize / 4), 0, random(-roomSize / 4, roomSize / 4));
    orbMovement = new PVector(random(0.05f, 1.5f), random(0.05f, 1.5f), random(0.05f, 1.5f));
    orbAngle = random(TWO_PI);
    orbSpeed = random(0.001f, 0.1f);
    
    // Generate debris
    debrisList = new ArrayList<Debris>();
    int debrisCount = (int) random(1, 5); // Random number of debris
    for (int i = 0; i < debrisCount; i++) {
      float size = random(20, 80);
      float x = random(-roomSize / 2 + size, roomSize / 2 - size);
      float z = random(-roomSize / 2 + size, roomSize / 2 - size);
      float y = size / 2; // So it sits on the floor
      color debrisColor = color(random(50, 255), random(50, 255), random(50, 255));
      Debris d = new Debris(new PVector(x, y, z), size, debrisColor);
      debrisList.add(d);
    }
  }
  
  void display() {
    pushMatrix();
    textureMode(NORMAL); 
    translate(gridX * roomSize, 0, gridY * roomSize);
    
    // Draw floor
    beginShape();
    texture(floorTexture);
    vertex(-roomSize / 2, 0, -roomSize / 2, 0, 0);
    vertex(roomSize / 2, 0, -roomSize / 2, 1, 0);
    vertex(roomSize / 2, 0, roomSize / 2, 1, 1);
    vertex(-roomSize / 2, 0, roomSize / 2, 0, 1);
    endShape();
    
    // Draw ceiling
    beginShape();
    texture(ceilingTexture);
    vertex(-roomSize / 2, roomHeight, -roomSize / 2, 0, 0);
    vertex(roomSize / 2, roomHeight, -roomSize / 2, 1, 0);
    vertex(roomSize / 2, roomHeight, roomSize / 2, 1, 1);
    vertex(-roomSize / 2, roomHeight, roomSize / 2, 0, 1);
    endShape();
    
    float wallHeight = roomHeight * 0.25f;
    
    // Draw walls based on the presence of walls
    if (wallNorth) {
      drawWall(0, wallHeight / 2, -roomSize / 2, 0);
    }
    if (wallSouth) {
      drawWall(0, wallHeight / 2, roomSize / 2, 180);
    }
    if (wallEast) {
      drawWall(roomSize / 2, wallHeight / 2, 0, 90);
    }
    if (wallWest) {
      drawWall(-roomSize / 2, wallHeight / 2, 0, -90);
    }
    
    for (Debris d : debrisList) {
      d.display();
    }
    
    drawOrb();
    
    popMatrix();
  }
  
  void drawWall(float x, float y, float z, float rotation) {
    float wallHeight = roomHeight * 0.25f;
    pushMatrix();
    translate(x, y, z);
    rotateY(radians(rotation));
    beginShape();
    texture(wallTexture);
    vertex(-roomSize / 2, 0, 0, 0, 0);
    vertex(roomSize / 2, 0, 0, 1, 0);
    vertex(roomSize / 2, wallHeight, 0, 1, 1);
    vertex(-roomSize / 2, wallHeight, 0, 0, 1);
    endShape();
    popMatrix();
  }
  
  void drawOrb() {
    pushMatrix();
    // Update orb position (e.g., circling movement)
    orbAngle += orbSpeed;
    float x = orbOffset.x + cos(orbAngle) * roomSize / 4;
    float y = orbPosition.y + sin(orbAngle * orbMovement.y) * (roomHeight / 4);
    float z = orbOffset.z + sin(orbAngle) * roomSize / 4;
    translate(x, y, z);
    
    // Set the orb color and disable textures
    noStroke();
    fill(orbColor);
    emissive(orbColor);
    sphereDetail(16);
    sphere(orbSize);
    emissive(0); // Reset emissive property
    
    popMatrix();
  }
}

Room getRoomAt(int x, int y) {
  for (Room r : rooms) {
    if (r.gridX == x && r.gridY == y) {
      return r;
    }
  }
  return null;
}

void generateRoom() {
  boolean roomGenerated = false;
  int maxAttempts = 1000; // Limit to prevent infinite loops
  
  // First, try to generate from the lastRoom
  Stack<Room> roomStack = new Stack<Room>();
  roomStack.push(lastRoom);
  
  while (!roomGenerated) {
    if (!roomStack.isEmpty()) {
      Room currentRoom = roomStack.peek();
      int currentX = currentRoom.gridX;
      int currentY = currentRoom.gridY;
      
      // List of possible directions where there is no room
      ArrayList<String> availableDirections = new ArrayList<String>();
      
      // Check each direction
      if (getRoomAt(currentX, currentY - 1) == null) {
        availableDirections.add("north");
      }
      if (getRoomAt(currentX, currentY + 1) == null) {
        availableDirections.add("south");
      }
      if (getRoomAt(currentX + 1, currentY) == null) {
        availableDirections.add("east");
      }
      if (getRoomAt(currentX - 1, currentY) == null) {
        availableDirections.add("west");
      }
      
      if (availableDirections.size() > 0) {
        // Randomly choose a direction from the available ones
        String dir = availableDirections.get((int) random(availableDirections.size()));
        
        int newX = currentX;
        int newY = currentY;
        
        switch (dir) {
          case "north":
            newY -= 1;
            break;
          case "south":
            newY += 1;
            break;
          case "east":
            newX += 1;
            break;
          case "west":
            newX -= 1;
            break;
        }
        
        // Create the new room
        Room newRoom = new Room(newX, newY);
        rooms.add(newRoom);
        
        // Remove walls between new room and adjacent existing rooms
        removeWallsBetweenAdjacentRooms(newRoom);
        
        // Update lastRoom and push newRoom onto the stack
        lastRoom = newRoom;
        roomStack.push(newRoom);
        roomGenerated = true;
      } else {
        // No available directions from current room, backtrack
        roomStack.pop();
      }
    } else {
      // No rooms in stack, try to find any room with available directions
      boolean foundRoomWithSpace = false;
      for (Room room : rooms) {
        int currentX = room.gridX;
        int currentY = room.gridY;
        
        if (getRoomAt(currentX, currentY - 1) == null ||
            getRoomAt(currentX, currentY + 1) == null ||
            getRoomAt(currentX + 1, currentY) == null ||
            getRoomAt(currentX - 1, currentY) == null) {
          // Found a room with available directions
          lastRoom = room;
          roomStack.push(room);
          foundRoomWithSpace = true;
          break;
        }
      }
      
      if (!foundRoomWithSpace) {
        // No rooms with available directions, generate at random empty position
        int attempts = 0;
        boolean foundEmpty = false;
        int newX = 0;
        int newY = 0;
        
        while (!foundEmpty && attempts < maxAttempts) {
          newX = (int) random(-1000, 1000);
          newY = (int) random(-1000, 1000);
          if (getRoomAt(newX, newY) == null) {
            foundEmpty = true;
          }
          attempts++;
        }
        
        if (foundEmpty) {
          // Create the new room
          Room newRoom = new Room(newX, newY);
          rooms.add(newRoom);
          
          // Remove walls between new room and adjacent existing rooms
          removeWallsBetweenAdjacentRooms(newRoom);
          
          // Update lastRoom to the new room
          lastRoom = newRoom;
          roomGenerated = true;
        } else {
          println("No empty positions found after maximum attempts.");
          break; // Could not find an empty position
        }
      }
    }
  }
}

void removeWallsBetweenAdjacentRooms(Room room) {
  int x = room.gridX;
  int y = room.gridY;
  
  Room neighbor;
  
  // North
  neighbor = getRoomAt(x, y - 1);
  if (neighbor != null) {
    room.wallNorth = false;
    neighbor.wallSouth = false;
  }
  // South
  neighbor = getRoomAt(x, y + 1);
  if (neighbor != null) {
    room.wallSouth = false;
    neighbor.wallNorth = false;
  }
  // East
  neighbor = getRoomAt(x + 1, y);
  if (neighbor != null) {
    room.wallEast = false;
    neighbor.wallWest = false;
  }
  // West
  neighbor = getRoomAt(x - 1, y);
  if (neighbor != null) {
    room.wallWest = false;
    neighbor.wallEast = false;
  }
}

void drawSkySphere() {
  // Calculate the size of the sphere
  float maxDistance = getMaxDistanceFromOrigin() + roomSize * 2;

  pushMatrix();

  // Position the sphere at the camera's position to simulate an infinite sky
  translate(cam.position.x, cam.position.y, cam.position.z);

  // Invert the sphere by scaling negatively
  scale(-1, 1, 1); // Invert along the X-axis

  // Disable depth testing to prevent clipping
  hint(DISABLE_DEPTH_TEST);

  // Disable lighting for the sky sphere
  noLights();

  // Apply the texture and draw the sphere
  textureMode(NORMAL);
  beginShape(TRIANGLE_FAN);
  texture(skyTexture);
  sphereDetail(60); // Adjust for performance

  for (int i = 0; i <= 60; i++) {
    float lat = map(i, 0, 60, -HALF_PI, HALF_PI);
    for (int j = 0; j <= 60; j++) {
      float lon = map(j, 0, 60, 0, TWO_PI);

      float x = cos(lat) * cos(lon);
      float y = sin(lat);
      float z = cos(lat) * sin(lon);

      float u = map(j, 0, 60, 0, 1);
      float v = map(i, 0, 60, 0, 1);

      vertex(x * maxDistance, y * maxDistance, z * maxDistance, u, v);
    }
  }

  endShape();

  // Re-enable depth testing and lighting
  hint(ENABLE_DEPTH_TEST);
  lights();

  popMatrix();
}

float getMaxDistanceFromOrigin() {
  float maxDistance = 0;
  for (Room room : rooms) {
    float distance = dist(0, 0, 0, room.gridX * roomSize, 0, room.gridY * roomSize);
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }
  return maxDistance;
}

void keyPressed() {
  if (key == ' ') 
    generateRoom();
    
  if(key== 'r')
    roomSize += 100;
   
  if(key=='t')
    roomHeight += 100;
}

void setup() {
  fullScreen(P3D);
  cam = new QueasyCam(this);
  cam.speed = 10; // Set movement speed for WASD controls
  
  // Set perspective to extend the render distance
  float fov = PI / 3.0;  // Field of view
  float aspect = (float) width / (float) height;  // Aspect ratio
  float nearClip = 10;  // Near clipping plane
  float farClip = 100000; // Far clipping plane
  perspective(fov, aspect, nearClip, farClip);
  
  Room startRoom = new Room(0, 0);
  rooms.add(startRoom);
  lastRoom = startRoom;
  
  // Load the sky texture
  skyTexture = loadImage("stars.jpg");
}

void draw() {
  background(0);
  
  // Draw the sky sphere first
  drawSkySphere();
  
  // Set up lights after drawing the sky sphere
  lights();
  
  for (Room room : rooms) {
    room.display();
  }
}
