/**
 * Configuration for 3D Printer Camera
 * ESP32-S3 WROOM N16R8 CAM Board
 */

#ifndef CONFIG_H
#define CONFIG_H

// ==================== WiFi Configuration ====================
#include "secrets.h"

// WiFi configuration is now in secrets.h (marked as gitignore)


// ==================== mDNS Configuration ====================
#define MDNS_HOSTNAME "3DprinterCam"

// ==================== FastLED Configuration ====================
#define LED_PIN       14        // GPIO pin for LED data
#define LED_TYPE      WS2812B   // LED strip type
#define COLOR_ORDER   GRB       // Color order for the LEDs
#define DEFAULT_LED_COUNT     60        // Default number of LEDs
#define DEFAULT_BRIGHTNESS    128       // Default brightness (0-255)
#define MAX_LED_COUNT         300       // Maximum supported LEDs

// ==================== Camera Configuration ====================
#define FRAME_SIZE    FRAMESIZE_VGA    // Default frame size
#define JPEG_QUALITY  10               // JPEG quality (0-63, lower = better quality)
#define FB_COUNT      2                // Frame buffer count (2 for PSRAM)

// ==================== Web Server Configuration ====================
#define WEB_SERVER_PORT 80

#endif // CONFIG_H
