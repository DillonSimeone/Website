#include "I2cBus.h"
#include <Wire.h>

namespace haxel::hal {

I2cBus& I2cBus::instance() {
    static I2cBus bus;
    return bus;
}

bool I2cBus::lock(TickType_t ticks) {
    if (!mutex_) {
        mutex_ = xSemaphoreCreateRecursiveMutex();
    }
    if (!mutex_) return false;
    return xSemaphoreTakeRecursive(mutex_, ticks) == pdTRUE;
}

void I2cBus::unlock() {
    if (mutex_) {
        xSemaphoreGiveRecursive(mutex_);
    }
}

bool I2cBus::ensureInit(int8_t sda, int8_t scl, uint32_t clockHz) {
    I2cLock guard;
    if (!guard.locked()) return false;

    if (!initialized_) {
        if (sda >= 0 && scl >= 0) {
            Wire.begin(sda, scl, clockHz);
            sda_ = sda;
            scl_ = scl;
        } else {
            Wire.begin();
            Wire.setClock(clockHz);
        }
        initialized_ = true;
        return true;
    }

    if (sda >= 0 && scl >= 0 && (sda_ < 0 || scl_ < 0)) {
        Wire.begin(sda, scl, clockHz);
        sda_ = sda;
        scl_ = scl;
    } else if (sda >= 0 && scl >= 0 && (sda != sda_ || scl != scl_)) {
        log_w("I2C already initialized on SDA=%d SCL=%d; ignoring conflicting request (%d,%d)",
              (int)sda_, (int)scl_, (int)sda, (int)scl);
    }
    return true;
}

} // namespace haxel::hal
