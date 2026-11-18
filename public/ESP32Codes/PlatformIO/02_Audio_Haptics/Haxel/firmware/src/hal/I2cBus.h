#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

namespace haxel::hal {

// Thread-safe Wire bus coordinator shared across Core 0 (OLED) and Core 1 (DRV2605L).
class I2cBus {
public:
    static I2cBus& instance();

    // Initializes Wire once (or keeps existing pins if already started).
    bool ensureInit(int8_t sda, int8_t scl, uint32_t clockHz = 400000);

    bool lock(TickType_t ticks = portMAX_DELAY);
    void unlock();

private:
    I2cBus() = default;
    SemaphoreHandle_t mutex_ = nullptr;
    bool initialized_ = false;
    int8_t sda_ = -1;
    int8_t scl_ = -1;
};

struct I2cLock {
    explicit I2cLock(TickType_t ticks = portMAX_DELAY)
        : locked_(I2cBus::instance().lock(ticks)) {}
    ~I2cLock() {
        if (locked_) I2cBus::instance().unlock();
    }
    I2cLock(const I2cLock&) = delete;
    I2cLock& operator=(const I2cLock&) = delete;
    bool locked() const { return locked_; }
private:
    bool locked_ = false;
};

} // namespace haxel::hal
