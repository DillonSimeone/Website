#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include "DFRobot_INA219.h"
#include <FastLED.h>

// ——— EAdjustable Parameters ——— E// Power spike (mW) above baseline to register SOLVED
float solveThreshold_mW   = 500.0;
// Power drop (mW) above baseline to register UNSOLVED
float restoreThreshold_mW = 10.0;

// ——— EWi-Fi & MQTT Settings ——— Econst char* ssid        = "Command-Module";
const char* password    = "cym4spac3";
const char* mqtt_server = "192.168.4.1";

// ——— EI²C Wattmeter ——— E#define SDA_PIN 21
#define SCL_PIN 22
DFRobot_INA219_IIC ina219(&Wire, INA219_I2C_ADDRESS4);

// ——— ELED Strip ——— E#define DATA_PIN 23
#define NUM_LEDS 3
CRGB leds[NUM_LEDS];

// ——— EConnection Attempt Limits ——— Econst int MAX_WIFI_TRIES = 3;
const int MAX_MQTT_TRIES = 3;

// ——— EState & Mode Flags ——— Ebool solved       = false;
bool skipMode     = false;
bool wifiEnabled  = true;

// ——— EBaseline Power ——— Efloat baselinePower_mW;

WiFiClient   espClient;
PubSubClient mqttClient(espClient);

void setup_wifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  for (int tries = 0; tries < MAX_WIFI_TRIES && WiFi.status() != WL_CONNECTED; tries++) {
    // show orange LEDs counting attempts
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i] = (i <= tries) ? CRGB::Orange : CRGB::Black;
    }
    FastLED.show();
    delay(500);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiEnabled = false;
    Serial.println("Wi-Fi failed, standalone mode");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  String p;
  for (unsigned int i = 0; i < length; i++) p += (char)payload[i];

  if (t == "fuelrod/skip" && p == "SKIP") {
    skipMode = true;
    solved   = true;
    if (wifiEnabled) mqttClient.publish("fuelrod2/status", "SOLVED");
    fill_solid(leds, NUM_LEDS, CRGB::Green);
    FastLED.show();
  }
}

void reconnect_mqtt() {
  if (!wifiEnabled) return;
  for (int tries = 0; tries < MAX_MQTT_TRIES && !mqttClient.connected(); tries++) {
    // show orange LEDs counting attempts
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i] = (i <= tries) ? CRGB::Orange : CRGB::Black;
    }
    FastLED.show();
    if (mqttClient.connect("fuelrod2Client")) {
      mqttClient.subscribe("fuelrod2/skip");
      Serial.println("MQTT connected");
      return;
    }
    delay(2000);
  }
  if (!mqttClient.connected()) {
    wifiEnabled = false;
    Serial.println("MQTT failed, standalone mode");
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // I²C & INA219
  Wire.begin(SDA_PIN, SCL_PIN);
  while (!ina219.begin()) {
    Serial.println("INA219 init failed, retrying...");
    delay(2000);
  }
  ina219.linearCalibrate(1000.0, 1000.0);
  delay(200);
  baselinePower_mW = ina219.getPower_mW();
  Serial.print("Baseline power: ");
  Serial.print(baselinePower_mW, 1);
  Serial.println(" mW");

  // LEDs
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.clear();
  FastLED.show();

  // Wi-Fi & MQTT
  setup_wifi();
  if (wifiEnabled) {
    mqttClient.setServer(mqtt_server, 1883);
    mqttClient.setCallback(mqttCallback);
    reconnect_mqtt();
  }

  // start in UNSOLVED state (red)
  solved = false;
  fill_solid(leds, NUM_LEDS, CRGB::Red);
  FastLED.show();
}

void loop() {
  if (wifiEnabled) {
    if (!mqttClient.connected()) reconnect_mqtt();
    mqttClient.loop();
  }

  if (!skipMode) {
    float power = ina219.getPower_mW();
    // check for solve
    if (!solved && power > baselinePower_mW + solveThreshold_mW) {
      solved = true;
      if (wifiEnabled) mqttClient.publish("fuelrod2/status", "SOLVED");
      fill_solid(leds, NUM_LEDS, CRGB::Green);
      FastLED.show();
    }
    // check for un-solve
    else if (solved && power < baselinePower_mW + restoreThreshold_mW) {
      solved = false;
      if (wifiEnabled) mqttClient.publish("fuelrod2/status", "UNSOLVED");
      fill_solid(leds, NUM_LEDS, CRGB::Red);
      FastLED.show();
    }
  }

  delay(200);
}
