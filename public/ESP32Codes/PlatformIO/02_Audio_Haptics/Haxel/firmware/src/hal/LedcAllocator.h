#pragma once

#include <stdint.h>

namespace haxel::hal {

// Centralized allocator for the 16 ESP32 LEDC channels. Tracks which channels
// are taken and the pin each is bound to so a re-begin() releases cleanly.
class LedcAllocator {
public:
    static LedcAllocator& instance();

    // Returns ledc channel index (0..15) on success, -1 on failure.
    int8_t allocate(int8_t pin, uint32_t hz, uint8_t bits);

    // Release a previously allocated pin (no-op if not allocated).
    void release(int8_t pin);

    // Release every pin (called by DriverFactory between driver swaps).
    void releaseAll();

    // Write duty (0..1) to a previously allocated pin.
    void write(int8_t pin, float duty01);

private:
    struct Slot {
        int8_t   pin = -1;
        uint8_t  bits = 0;
        uint32_t hz = 0;
    };
    static constexpr int8_t kMaxSlots = 16;
    Slot slots_[kMaxSlots];
};

} // namespace haxel::hal
