# carrie-brain-badge — Build & Flash

## Toolchain
Install ESP-IDF v5.2+ : https://docs.espressif.com/projects/esp-idf/en/v5.2/esp32c3/get-started/

## Build
```
. $IDF_PATH/export.sh
idf.py set-target esp32c3
idf.py build
```

## Flash
```
./flash.sh         # uses $PORT env var or autodetect
```

## Notes
- Hold BOOT (GPIO 9) at power-up to wake from deep sleep.
- Stand-by current with TLV70233 LDO + MPU6050 in sleep should measure under 50 µA.
