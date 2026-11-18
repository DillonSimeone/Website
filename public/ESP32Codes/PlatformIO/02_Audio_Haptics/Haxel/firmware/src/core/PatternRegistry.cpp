#include "PatternRegistry.h"
#include <cstring>

namespace haxel::core {

PatternRegistry::PatternRegistry() {
#ifndef HAXEL_HOST_TEST
    dataMux_ = xSemaphoreCreateRecursiveMutex();
    evalMux_ = xSemaphoreCreateRecursiveMutex();
#endif
}

PatternRegistry& PatternRegistry::instance() {
    static PatternRegistry r;
    return r;
}

PatternRegistry::~PatternRegistry() {
    lockData_();
    for (auto* p : customPatternsOwned_) {
        delete p;
    }
    customPatternsOwned_.clear();
    patterns_.clear();
    unlockData_();
#ifndef HAXEL_HOST_TEST
    if (dataMux_) { vSemaphoreDelete(dataMux_); dataMux_ = nullptr; }
    if (evalMux_) { vSemaphoreDelete(evalMux_); evalMux_ = nullptr; }
#endif
}

void PatternRegistry::lockData_() const {
#ifndef HAXEL_HOST_TEST
    if (dataMux_) xSemaphoreTakeRecursive(dataMux_, portMAX_DELAY);
#endif
}

void PatternRegistry::unlockData_() const {
#ifndef HAXEL_HOST_TEST
    if (dataMux_) xSemaphoreGiveRecursive(dataMux_);
#endif
}

void PatternRegistry::lockEval() const {
#ifndef HAXEL_HOST_TEST
    if (evalMux_) xSemaphoreTakeRecursive(evalMux_, portMAX_DELAY);
#endif
}

void PatternRegistry::unlockEval() const {
#ifndef HAXEL_HOST_TEST
    if (evalMux_) xSemaphoreGiveRecursive(evalMux_);
#endif
}

bool PatternRegistry::copyIdIfValid(const IPattern* p, char* out, size_t cap) const {
    if (!out || cap == 0) return false;
    out[0] = '\0';
    if (!p) return false;
    lockEval();
    bool ok = contains(p);
    if (ok) {
        const char* pid = p->id() ? p->id() : "";
        strncpy(out, pid, cap - 1);
        out[cap - 1] = '\0';
    }
    unlockEval();
    return ok;
}

void PatternRegistry::registerPattern(IPattern* p) {
    if (!p) return;
    lockData_();
    patterns_.push_back(p);
    unlockData_();
}

void PatternRegistry::registerCustomPattern(IPattern* p) {
    if (!p) return;
    lockData_();
    patterns_.push_back(p);
    customPatternsOwned_.push_back(p);
    unlockData_();
}

void PatternRegistry::unregisterPattern(const char* id) {
    if (!id) return;
    lockEval();
    lockData_();
    // Only erase custom patterns so built-in C++ singletons are never overwritten.
    for (auto it = patterns_.begin(); it != patterns_.end(); ++it) {
        if (strcmp((*it)->meta().id, id) == 0 &&
            strcmp((*it)->meta().category, "custom") == 0) {
            patterns_.erase(it);
            break;
        }
    }
    // Remove and delete from owned custom patterns list
    for (auto it = customPatternsOwned_.begin(); it != customPatternsOwned_.end(); ++it) {
        if (strcmp((*it)->meta().id, id) == 0) {
            IPattern* p = *it;
            customPatternsOwned_.erase(it);
            delete p;
            break;
        }
    }
    unlockData_();
    unlockEval();
}

static bool idEqualsIgnoreCase_(const char* a, const char* b) {
    if (!a || !b) return false;
    while (*a && *b) {
        char ca = *a++, cb = *b++;
        if (ca >= 'A' && ca <= 'Z') ca = (char)(ca + 32);
        if (cb >= 'A' && cb <= 'Z') cb = (char)(cb + 32);
        if (ca != cb) return false;
    }
    return *a == *b;
}

IPattern* PatternRegistry::find(const char* id) const {
    if (!id) return nullptr;
    lockData_();
    IPattern* found = nullptr;
    for (auto* p : patterns_) {
        if (strcmp(p->meta().id, id) == 0) { found = p; break; }
    }
    if (!found) {
        // Fallback: case-insensitive match for portal/UI typos.
        for (auto* p : patterns_) {
            if (idEqualsIgnoreCase_(p->meta().id, id)) { found = p; break; }
        }
    }
    unlockData_();
    return found;
}

IPattern* PatternRegistry::at(size_t idx) const {
    lockData_();
    IPattern* p = (idx < patterns_.size()) ? patterns_[idx] : nullptr;
    unlockData_();
    return p;
}

bool PatternRegistry::contains(const IPattern* p) const {
    if (!p) return false;
    lockData_();
    bool ok = false;
    for (auto* reg : patterns_) {
        if (reg == p) { ok = true; break; }
    }
    unlockData_();
    return ok;
}

size_t PatternRegistry::size() const {
    lockData_();
    size_t n = patterns_.size();
    unlockData_();
    return n;
}

std::vector<IPattern*> PatternRegistry::snapshot() const {
    lockData_();
    std::vector<IPattern*> copy = patterns_;
    unlockData_();
    return copy;
}

} // namespace haxel::core
