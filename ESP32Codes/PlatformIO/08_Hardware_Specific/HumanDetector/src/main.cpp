#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <MyLD2410.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

// Default I2C pins for FireBeetle 2 ESP32-C6
#define SDA_PIN 19
#define SCL_PIN 20

// LD2410C Radar Pins
#define RADAR_RX 17
#define RADAR_TX 16

// URM37 Ultrasonic Pins
#define US_TRIG 21
#define US_ECHO 22

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MyLD2410 radar(Serial1);

// Smoothing variables (Exponential Moving Average)
float smoothM = 0;
float smoothS = 0;
float smoothUS = 0;
const float alpha = 0.2; // Smoothing factor (0.0 to 1.0, lower is smoother)

float getUSDistance() {
  // URM37 V5.0 Trigger: Pull LOW for 10us
  digitalWrite(US_TRIG, LOW);
  delayMicroseconds(10);
  digitalWrite(US_TRIG, HIGH);
  
  // URM37 V5.0 Echo: Measure duration of LOW pulse
  // Timeout 50ms (corresponds to ~1000cm)
  long duration = pulseIn(US_ECHO, LOW, 50000); 
  
  if (duration == 0 || duration >= 50000) return -1.0f;
  
  // URM37 V5.0 Calculation: 50us per cm
  return (float)duration / 50.0f;
}

void setup() {
  Serial.begin(115200);
  
  // Initialize I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // Initialize OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }

  // Initialize URM37 Pins - URM37 TRIG is active-LOW, so keep it HIGH
  pinMode(US_TRIG, OUTPUT);
  digitalWrite(US_TRIG, HIGH);
  pinMode(US_ECHO, INPUT);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println(F("Human Detector"));
  display.println(F("Initializing..."));
  display.display();

  // Initialize LD2410C on Serial1
  Serial1.begin(256000, SERIAL_8N1, RADAR_RX, RADAR_TX);
  
  delay(1000);
  Serial.println(F("System Initialized"));
}

void updateOLED(bool presence, uint16_t mDist, byte mEnergy, uint16_t sDist, byte sEnergy, float usDist) {
  display.clearDisplay();
  display.setCursor(0,0);
  display.setTextSize(1);
  display.println(F("--- HUMAN DETECTOR ---"));
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE); // First line
  display.drawLine(0, 12, 128, 12, SSD1306_WHITE); // Second line break
  
  // Radar Targets
  display.setCursor(0, 17);
  display.print(F("RADAR: "));
  
  // Determine if we should show the detection (Greater than 40cm threshold)
  bool significantDetection = presence && (mDist > 40 || sDist > 40);
  
  if (significantDetection) {
    // Flashing logic: Blink every 250ms
    bool showText = (millis() / 250) % 2 == 0;
    if (showText) {
      display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      display.print(F(" DETECTED "));
      display.setTextColor(SSD1306_WHITE);
    } else {
      display.print(F("          ")); // Blank space for flash
    }
  } else if (presence) {
    // Stationary/Near background detection (<= 40cm)
    display.print(F(" (NEAR)   "));
  } else {
    display.print(F(" NO       "));
  }

  // Radar Details
  display.setCursor(0, 24);
  display.print(F("MOV: ")); display.print(mDist); display.print(F("cm "));
  display.print(F("E:")); display.println(mEnergy);
  
  display.setCursor(0, 34);
  display.print(F("STA: ")); display.print(sDist); display.print(F("cm "));
  display.print(F("E:")); display.println(sEnergy);

  display.drawLine(0, 44, 128, 44, SSD1306_WHITE);

  // Ultrasonic Distance - Simplified layout
  display.setCursor(0, 48);
  display.setTextSize(1);
  if (usDist < 0) {
    display.println(F("US D: SENSOR ERROR"));
  } else {
    display.print(F("US D: "));
    display.print(usDist, 1);
    display.println(F(" cm"));
  }
  
  display.display();
}

void loop() {
  // Read radar data
  radar.check();
  bool isPresent = radar.presenceDetected();
  uint16_t movingDist = radar.movingTargetDistance();
  uint16_t staticDist = radar.stationaryTargetDistance();
  
  // Retrieve signal energies
  const MyLD2410::SensorData& data = radar.getSensorData();
  byte mEnergy = data.mTargetSignal;
  byte sEnergy = data.sTargetSignal;

  // Read ultrasonic data
  float usRaw = getUSDistance();

  // Apply Smoothing (EMA Filter)
  if (usRaw > 0) {
    if (smoothUS == 0) smoothUS = usRaw; // Initialize
    smoothUS = (alpha * usRaw) + ((1.0 - alpha) * smoothUS);
  } else {
    smoothUS = -1.0; // Pass through error
  }

  if (smoothM == 0) smoothM = movingDist;
  smoothM = (alpha * movingDist) + ((1.0 - alpha) * smoothM);
  
  if (smoothS == 0) smoothS = staticDist;
  smoothS = (alpha * staticDist) + ((1.0 - alpha) * smoothS);

  // Serial Logging for Debugging
  Serial.print(F("RADAR ["));
  if (isPresent) Serial.print(F("PRESENCE")); else Serial.print(F("NONE"));
  Serial.print(F("] Mov: ")); Serial.print((int)smoothM); Serial.print(F("cm (E:")); Serial.print(mEnergy);
  Serial.print(F(") Sta: ")); Serial.print((int)smoothS); Serial.print(F("cm (E:")); Serial.print(sEnergy);
  Serial.print(F(") | US: "));
  if (smoothUS < 0) Serial.println(F("ERROR"));
  else { Serial.print(smoothUS); Serial.println(F(" cm")); }

  // Update display with smoothed values
  updateOLED(isPresent, (uint16_t)smoothM, mEnergy, (uint16_t)smoothS, sEnergy, smoothUS);

  delay(150); // Increased frequency for smoother filter response
}
