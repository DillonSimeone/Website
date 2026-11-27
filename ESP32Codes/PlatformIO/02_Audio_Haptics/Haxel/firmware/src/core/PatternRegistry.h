#pragma once

#include "Pattern.h"
#include <vector>
#ifndef HAXEL_HOST_TEST
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#endif

namespace haxel::core {

class PatternRegistry {
public:
    static PatternRegistry& instance();
    ~PatternRegistry();

    void registerPattern(IPattern* p);
    void registerCustomPattern(IPattern* p);
    void unregisterPattern(const char* id);
    IPattern* find(const char* id) const;
    IPattern* at(size_t idx) const;
    bool contains(const IPattern* p) const;
    size_t size() const;

    // Thread-safe snapshot of registered patterns (prevents vector reallocation races).
    std::vector<IPattern*> snapshot() const;

    // Short evaluation lock protecting pattern sample() against concurrent unregister/delete.
    void lockEval() const;
    void unlockEval() const;
    bool copyIdIfValid(const IPattern* p, char* out, size_t cap) const;

    // Legacy direct accessor (prefer snapshot() for cross-task callers).
    const std::vector<IPattern*>& all() const { return patterns_; }

private:
    PatternRegistry();
    void lockData_() const;
    void unlockData_() const;

    std::vector<IPattern*> patterns_;
    std::vector<IPattern*> customPatternsOwned_;
#ifndef HAXEL_HOST_TEST
    mutable SemaphoreHandle_t dataMux_ = nullptr;
    mutable SemaphoreHandle_t evalMux_ = nullptr;
#endif
};

} // namespace haxel::core
