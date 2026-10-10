/**
 * Camera Pin Definitions for ESP32-S3 WROOM N16R8 CAM Board
 * 
 * OV5640 Camera Module
 * These pins were working (camera detected) with the original configuration
 */

#ifndef CAMERA_PINS_H
#define CAMERA_PINS_H

// ============================================================
// ESP32-S3 WROOM N16R8 CAM - Working Configuration
// ============================================================

// Power control pins
#define PWDN_GPIO_NUM     -1    // Not connected
#define RESET_GPIO_NUM    -1    // Not connected

// XCLK (External Clock) 
// OV5640 needs 24MHz, OV2640 needs 20MHz
#define XCLK_GPIO_NUM     15

// I2C pins for camera control (SCCB) - ORIGINAL WORKING PINS
#define SIOD_GPIO_NUM     4     // I2C SDA
#define SIOC_GPIO_NUM     5     // I2C SCL

// Pixel data pins (D0-D7) - 8-bit parallel data
#define Y2_GPIO_NUM       11    // D0
#define Y3_GPIO_NUM       9     // D1
#define Y4_GPIO_NUM       8     // D2
#define Y5_GPIO_NUM       10    // D3
#define Y6_GPIO_NUM       12    // D4
#define Y7_GPIO_NUM       18    // D5
#define Y8_GPIO_NUM       17    // D6
#define Y9_GPIO_NUM       16    // D7

// Sync signals
#define VSYNC_GPIO_NUM    6     // Vertical Sync
#define HREF_GPIO_NUM     7     // Horizontal Reference
#define PCLK_GPIO_NUM     13    // Pixel Clock

// LED Flash
#define LED_GPIO_NUM      -1

#endif // CAMERA_PINS_H
