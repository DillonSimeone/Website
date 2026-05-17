# fuel-rods-redesign — Cost-Down Analysis
Tiny LED art piece with I2C INA219 + MQTT. C3 has WiFi + I2C; ample headroom.
## Library Substitutions
PubSubClient → `mqtt_client.h` (esp-mqtt); INA219 lib → 3 register reads over `driver/i2c_master.h`.
