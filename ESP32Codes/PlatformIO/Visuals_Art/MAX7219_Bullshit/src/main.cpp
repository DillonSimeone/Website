#include <Arduino.h>
#include <MD_Parola.h>
#include <MD_MAX72xx.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include "index_html.h"

/**
 * Project: MAX7219_Bullshit
 * Hardware: ESP32-C3 SuperMini + 4x MAX7219 8x8 Dot Matrix
 * 
 * Added Web Server, Access Point, and Captive Portal for dynamic changes.
 */

#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES 5

// Pin definitions
#define DATA_PIN  6   // DIN
#define CLK_PIN   4   // CLK
#define CS_PIN    5   // CS

MD_Parola P = MD_Parola(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);

// WiFi & Captive Portal
const char* apSSID = "MAX7219-LINK";
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);
Preferences preferences;

// Global settings
String displayText = "ESP-CORE";
char displayBuffer[105] = "ESP-CORE";
bool animEnabled[10];
bool updateNeeded = false;
int animSpeed = 40;

struct animation_t {
  textEffect_t effectIn;
  textEffect_t effectOut;
  const char* name;
};

animation_t animations[] = {
  { PA_SCROLL_LEFT,    PA_SCROLL_LEFT,    "Scroll Left"  },
  { PA_SCROLL_RIGHT,   PA_SCROLL_RIGHT,   "Scroll Right" },
  { PA_SCROLL_UP,      PA_SCROLL_UP,      "Scroll Up"    },
  { PA_SCROLL_DOWN,    PA_SCROLL_DOWN,    "Scroll Down"  },
  { PA_FADE,           PA_FADE,           "Fade"         },
  { PA_WIPE,           PA_WIPE,           "Wipe"         },
  { PA_GROW_UP,        PA_GROW_DOWN,      "Grow"         },
  { PA_SCAN_HORIZ,     PA_SCAN_HORIZ,     "Scan"         },
  { PA_OPENING_CURSOR, PA_CLOSING_CURSOR, "Cursor"       },
  { PA_SLICE,          PA_DISSOLVE,       "Slice"        },
};

int animIndex = 0;
const int animCount = sizeof(animations) / sizeof(animations[0]);

/* -- Web Server Handlers -- */
void handleRoot() {
  server.send(200, "text/html", index_html);
}

void handleSettings() {
  String json = "{\"text\":\"" + displayText + "\", \"speed\":" + String(animSpeed) + ", \"currentAnim\":" + String(animIndex) + " ,\"anims\":[";
  for(int i = 0; i < animCount; i++) {
    json += animEnabled[i] ? "1" : "0";
    if (i < animCount - 1) json += ",";
  }
  json += "]}";
  server.send(200, "application/json", json);
}

void handleSave() {
  if (server.hasArg("text")) {
    displayText = server.arg("text");
    preferences.putString("text", displayText);
  }
  
  if (server.hasArg("speed")) {
    animSpeed = server.arg("speed").toInt();
    if(animSpeed < 10) animSpeed = 10;
    if(animSpeed > 2000) animSpeed = 2000;
    preferences.putInt("speed", animSpeed);
  }

  if (server.hasArg("anims")) {
    String a = server.arg("anims");
    // e.g., "1,0,1,1,0..."
    int parts = 0;
    int start = 0;
    while(start < a.length() && parts < animCount) {
      int idx = a.indexOf(',', start);
      if (idx == -1) idx = a.length();
      String val = a.substring(start, idx);
      
      bool en = (val == "1");
      animEnabled[parts] = en;
      preferences.putBool(("anim" + String(parts)).c_str(), en);
      
      start = idx + 1;
      parts++;
    }
  }
  
  // Triggers immediate display refresh in the loop
  updateNeeded = true;
  
  server.send(200, "text/plain", "OK");
}

void handleNotFound() {
  // Redirect practically everything else to the captive portal
  String redirectUrl = String("http://") + WiFi.softAPIP().toString() + String("/");
  server.sendHeader("Location", redirectUrl, true);
  server.send(302, "text/plain", "Redirecting to portal");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nMAX7219 + Captive Portal Init");

  // Load preferences
  preferences.begin("max7219", false);
  displayText = preferences.getString("text", "PUNK-SYS");
  animSpeed = preferences.getInt("speed", 40);
  strncpy(displayBuffer, displayText.c_str(), sizeof(displayBuffer) - 1);
  displayBuffer[sizeof(displayBuffer) - 1] = '\0';
  
  for (int i=0; i<animCount; i++) {
    animEnabled[i] = preferences.getBool(("anim" + String(i)).c_str(), true);
  }

  // Init Matrix
  P.begin();
  for (int i = 0; i < 3; i++) {
    P.displayClear();
    delay(10);
  }
  P.setIntensity(2);
  P.displayClear();

  // Pick a valid starting animation if available
  animIndex = 0;
  for(int i=0; i<animCount; i++) {
      if(animEnabled[i]) {
          animIndex = i;
          break;
      }
  }

  P.displayText(displayBuffer, PA_CENTER, animSpeed, 500, 
                animations[animIndex].effectIn, 
                animations[animIndex].effectOut);

  // Configure Wi-Fi AP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSSID);
  Serial.print("Access Point started! SSID: ");
  Serial.println(apSSID);
  Serial.print("IP address: ");
  Serial.println(WiFi.softAPIP());

  // Start DNS server (Captive Portal)
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
  Serial.println("DNS server started.");

  // Init HTTP routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/settings", HTTP_GET, handleSettings);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleNotFound); // Catch-all for Captive Portal

  server.begin();
  Serial.println("HTTP server started.");
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();

  // MD_Parola is non-blocking
    if (updateNeeded) {
       updateNeeded = false;
       // Safety copy into mutable buffer
       strncpy(displayBuffer, displayText.c_str(), sizeof(displayBuffer) - 1);
       displayBuffer[sizeof(displayBuffer) - 1] = '\0';
       
       // Abort active animation immediately
       P.displayClear();
       P.displayReset();
       
       // Re-init with aborted cycle
       P.displayText(displayBuffer, PA_CENTER, animSpeed, 500, 
                     animations[animIndex].effectIn, 
                     animations[animIndex].effectOut);
    } 
    else if (P.displayAnimate()) {
        // Find next enabled animation
        int nextAnim = (animIndex + 1) % animCount;
        int tries = 0;
        
        while (!animEnabled[nextAnim] && tries < animCount) {
            nextAnim = (nextAnim + 1) % animCount;
            tries++;
        }
        
        if (tries < animCount) {
            animIndex = nextAnim;
        }

        // Hardware re-initialization to prevent MAX7219 desync over time
        P.begin();
        P.setIntensity(2);
        P.displayClear();

        P.displayText(displayBuffer, PA_CENTER, animSpeed, 500, 
                      animations[animIndex].effectIn, 
                      animations[animIndex].effectOut);
        P.displayReset();
    }
}
