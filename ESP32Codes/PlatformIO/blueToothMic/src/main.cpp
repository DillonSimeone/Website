#include "AudioTools.h"

/**
 * Project: blueToothMic
 * Goal: Stream audio from INMP441 (I2S Mic) to Smartphone
 * 
 * Hardware: ESP32-C3 SuperMini + INMP441
 * 
 * This sketch initializes the I2S microphone using the AudioTools library.
 * The audio data is read and can be directed to a variety of outputs.
 * 
 * NOTE ON BLUETOOTH:
 * ESP32-C3 only supports BLE. Standard Bluetooth Mic profiles (HFP/HSP)
 * usually require Bluetooth Classic. For BLE Audio (LE Audio), 
 * specific phone support and complex software (ESP-IDF 5.x + LC3) are required.
 */

I2SStream in;              // Access I2S as a stream
CsvStream<int16_t> out(Serial); // Stream to Serial as CSV for Data Plotter
StreamCopy copier(out, in); // Copy data from I2S to Serial

void setup() {
  Serial.begin(115200);
  AudioLogger::instance().begin(Serial, AudioLogger::Info);

  Serial.println("Starting I2S Mic Test...");

  // Configure I2S
  auto config = in.defaultConfig(RX_MODE);
  config.sample_rate = 16000;
  config.channels = 1;
  config.bits_per_sample = 16;
  config.i2s_format = I2S_STD_FORMAT;
  config.is_master = true;
  config.port_no = 0;
  
  // ESP32-C3 SuperMini Pins
  config.pin_ws = 3;   // WS
  config.pin_bck = 5;  // SCK
  config.pin_data = 4; // SD

  if (!in.begin(config)) {
    Serial.println("Failed to initialize I2S!");
    while(1);
  }

  Serial.println("I2S Mic Initialized. Data streaming to Serial Plotter...");
}

void loop() {
  copier.copy();
}
