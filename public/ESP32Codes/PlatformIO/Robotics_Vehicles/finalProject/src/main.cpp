#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <WebServer.h>
#include <MyLD2410.h>
#include <FastLED.h>

//LED
#define NUM_LEDS 2
#define DATA_PIN 8
CRGB leds[NUM_LEDS];
unsigned long previousMillis = 0;  // Tracks the last time the LED state changed
const unsigned long interval = 100;
int whiteLed = 0;  // Tracks the current LED index
bool ledMode = false;


// OLED Configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Wi-Fi Configuration
const char* ssid = "DSfinal";
const char* password = ""; // Leave blank for open network
WebServer server(80);

//Misc
bool sensorMode = false;
int shrekCounter = 0;

String action = "Idle";

//LED2410 Sensor
#define sensorSerial Serial0
MyLD2410 sensor(sensorSerial);
#define RX_PIN 17
#define TX_PIN 16

// Motor Control Pins
#define MOTOR_FL_A 5
#define MOTOR_FL_B 4
#define MOTOR_FR_A 2
#define MOTOR_FR_B 3
#define MOTOR_BL_A 15
#define MOTOR_BL_B 6
#define MOTOR_BR_A 7
#define MOTOR_BR_B 23


unsigned long lastCommandTime = 0;
const unsigned long motorTimeout = 1000; // Stop motors after 1 second of inactivity


// Ultrasonic Sensor Pins
#define trigPin  21
#define echoPin  22
long cm = 0;


// HTML Content
const char* webpage = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <title>Dillon's Final Project</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            overflow: hidden;
            background: #333;
            color: #fff;
            font-family: sans-serif;
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            grid-template-rows: 1fr 1fr 1fr;
            height: 100%;
            width: 100%;
        }
        button {
            background: #555;
            border: none;
            color: #fff;
            font-size: 4vw;
            width: 100%;
            height: 100%;
            cursor: pointer;
        }
        .up { grid-column: 2; grid-row: 1; }
        .left { grid-column: 1; grid-row: 2; }
        .center { grid-column: 2; grid-row: 2; }
        .right { grid-column: 3; grid-row: 2; }
        .down { grid-column: 2; grid-row: 3; }
    </style>
    <script>
        let interval;

        function sendCommand(command) {
            fetch('/' + command);
        }

        function startSending(command) {
            interval = setInterval(() => sendCommand(command), 20);
        }

        function stopSending() {
            clearInterval(interval);
            resetShrekAfterDelay();
        }

        function clickOnce(command) {
            sendCommand(command);
            resetShrekAfterDelay();
        }

        function resetShrekAfterDelay() {
            setTimeout(() => {fetch('/shrek')}, 1000);
        }
    </script>
</head>
<body>
    <div class="grid">
        <div></div>
        <div class="up">
            <button onmousedown="startSending('up')" onmouseup="stopSending()" onmouseleave="stopSending()" onclick="clickOnce('up')">Up</button>
        </div>
        <div></div>

        <div class="left">
            <button onmousedown="startSending('left')" onmouseup="stopSending()" onmouseleave="stopSending()" onclick="clickOnce('left')">Left</button>
        </div>
        <div class="center">
            <button onclick="clickOnce('shrek')">Center</button>
        </div>
        <div class="right">
            <button onmousedown="startSending('right')" onmouseup="stopSending()" onmouseleave="stopSending()" onclick="clickOnce('right')">Right</button>
        </div>

        <div></div>
        <div class="down">
            <button onmousedown="startSending('down')" onmouseup="stopSending()" onmouseleave="stopSending()" onclick="clickOnce('down')">Down</button>
        </div>
        <div></div>
    </div>
</body>
</html>
)rawliteral";


void setup() {
  Serial.begin(115200);

  //Led
  FastLED.addLeds<WS2811, DATA_PIN, RGB>(leds, NUM_LEDS);

  // Initialize OLED display
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println("Hello, Shrek!"); //Sanity Test
  display.display();

  int motorPins[] = {MOTOR_FL_A, MOTOR_FL_B, MOTOR_FR_A, MOTOR_FR_B, MOTOR_BL_A, MOTOR_BL_B, MOTOR_BR_A, MOTOR_BR_B};
  for (int pin : motorPins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }

  // Initialize Ultrasonic Sensor Pins
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  //HumanPresence
  sensorSerial.begin(LD2410_BAUD_RATE, SERIAL_8N1, RX_PIN, TX_PIN);

  // Start Wi-Fi Access Point
  WiFi.softAP(ssid, password);
  Serial.println("Wi-Fi Access Point started.");
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Set up web server routes
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", webpage);
  });

  server.on("/sensor", HTTP_GET, []() {
    sensorMode = !sensorMode; // Toggle the sensor mode
    server.send(200, "text/plain", sensorMode ? "Sensor Mode ON" : "Sensor Mode OFF");
  });

  server.on("/leds", HTTP_GET, []() {
    ledMode = !ledMode; // Toggle the sensor mode
    server.send(200, "text/plain", sensorMode ? "Sensor Mode ON" : "Sensor Mode OFF");
  });

  server.on("/shrek", HTTP_GET, []() {
    shrekCounter++;
    stopMotors();
    server.send(200, "text/plain", "Button Pressed");
  });

  server.on("/up", HTTP_GET, []() {
    up();
    server.send(200, "text/plain", "Up");
  });

  server.on("/down", HTTP_GET, []() {
    down();
    server.send(200, "text/plain", "Down");
  });

  server.on("/left", HTTP_GET, []() {
    left();
    server.send(200, "text/plain", "Left");
  });

  server.on("/right", HTTP_GET, []() {
    right();
    server.send(200, "text/plain", "Right");
  });

  server.begin();
}
static unsigned long lastSonicTime = 0;

void loop() {
  // Handle client requests
  server.handleClient();

  if(ledMode){
    unsigned long currentMillis = millis();

    if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;

        // Turn off the previous LED
        if (whiteLed > 0) {
            leds[whiteLed - 1] = CRGB::Black;
        } else {
            leds[NUM_LEDS - 1] = CRGB::Black; // Wrap around at the end
        }

        // Turn on the current LED
        leds[whiteLed] = CRGB::White;

        // Show the updated LEDs
        FastLED.show();

        // Move to the next LED, wrapping around at the end
        whiteLed = (whiteLed + 1) % NUM_LEDS;
    }
  }else{
    FastLED.clear();  // Ensure all LEDs are off initially
    FastLED.show();
  }
  


  display.clearDisplay();
  display.setCursor(0, 0);
  if(sensorMode == true){
    if (millis() - lastSonicTime > 1000) {
      lastSonicTime = millis();
      measureDistance();
    }
    display.print("UltraSonicDist: ");
    display.print(cm);
    display.println(" cm");
    
    display.println("HumanDetector Readout");
    if(sensor.presenceDetected()){
      display.print("    ");
      display.println("Meatbag detected");
      display.print("Dist: ");
      display.print(sensor.detectedDistance());
      display.println("cm");
      if(sensor.movingTargetDetected()){
        display.print("Status: Moving");
      }

      if(sensor.stationaryTargetDetected()){
        display.println("Status: Idle");
        display.print("Dist: ");
        display.print(sensor.stationaryTargetDistance());
        display.println("cm");
      }
    }
    else{
      display.println("  No humans detected!");
      display.println("(Is this working...?)");
    }

  }else{
    display.println("  Microcontroller 1    ");
    display.println("    Final Project   ");
    display.print("Access Point:");
    display.println("DSFinal");
    display.println("Ctrl at: 192.168.4.1");
    display.print("ShrekBtn counter: ");
    display.println(shrekCounter);
  }
  
  display.print("CurAction:");
  display.println(action);
  display.display();
}

unsigned int measureDistance() {
  digitalWrite(trigPin, LOW);
  digitalWrite(trigPin, HIGH);
  unsigned long LowLevelTime = pulseIn(echoPin, LOW) ;
  if(LowLevelTime != 0){
    cm = LowLevelTime/50;  // every 50us low level stands for 1cm
  }
  return cm;
  }

void stopMotors() {
  action = "Idle";
  digitalWrite(MOTOR_FL_A, LOW);
  digitalWrite(MOTOR_FL_B, LOW);
  digitalWrite(MOTOR_FR_A, LOW);
  digitalWrite(MOTOR_FR_B, LOW);
  digitalWrite(MOTOR_BL_A, LOW);
  digitalWrite(MOTOR_BL_B, LOW);
  digitalWrite(MOTOR_BR_A, LOW);
  digitalWrite(MOTOR_BR_B, LOW);
}

void motorDrive(String direction) {
  lastCommandTime = millis();

  if (direction == "up") {
    action = "Moving Up";
    digitalWrite(MOTOR_FL_A, HIGH);
    digitalWrite(MOTOR_FL_B, LOW);
    digitalWrite(MOTOR_FR_A, HIGH);
    digitalWrite(MOTOR_FR_B, LOW);
    digitalWrite(MOTOR_BL_A, HIGH);
    digitalWrite(MOTOR_BL_B, LOW);
    digitalWrite(MOTOR_BR_A, HIGH);
    digitalWrite(MOTOR_BR_B, LOW);
  } else if (direction == "down") {
    action = "Moving Down";
    digitalWrite(MOTOR_FL_A, LOW);
    digitalWrite(MOTOR_FL_B, HIGH);
    digitalWrite(MOTOR_FR_A, LOW);
    digitalWrite(MOTOR_FR_B, HIGH);
    digitalWrite(MOTOR_BL_A, LOW);
    digitalWrite(MOTOR_BL_B, HIGH);
    digitalWrite(MOTOR_BR_A, LOW);
    digitalWrite(MOTOR_BR_B, HIGH);
  } else if (direction == "left") {
    action = "Turning Left";
    digitalWrite(MOTOR_FL_A, LOW);
    digitalWrite(MOTOR_FL_B, HIGH);
    digitalWrite(MOTOR_FR_A, HIGH);
    digitalWrite(MOTOR_FR_B, LOW);
    digitalWrite(MOTOR_BL_A, LOW);
    digitalWrite(MOTOR_BL_B, HIGH);
    digitalWrite(MOTOR_BR_A, HIGH);
    digitalWrite(MOTOR_BR_B, LOW);
  } else if (direction == "right") {
    action = "Turning Right";
    digitalWrite(MOTOR_FL_A, HIGH);
    digitalWrite(MOTOR_FL_B, LOW);
    digitalWrite(MOTOR_FR_A, LOW);
    digitalWrite(MOTOR_FR_B, HIGH);
    digitalWrite(MOTOR_BL_A, HIGH);
    digitalWrite(MOTOR_BL_B, LOW);
    digitalWrite(MOTOR_BR_A, LOW);
    digitalWrite(MOTOR_BR_B, HIGH);
  }
}

void up() {
  motorDrive("up");
}

void down() {
  motorDrive("down");
}

void left() {
  motorDrive("left");
}

void right() {
  motorDrive("right");
}


