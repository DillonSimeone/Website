#include "PatternRegistry.h"
#include <cstring>

namespace haxel::core {

PatternRegistry& PatternRegistry::instance() {
    static PatternRegistry r;
    return r;
}

PatternRegistry::~PatternRegistry() {
    for (auto* p : customPatternsOwned_) {
        delete p;
    }
}

void PatternRegistry::registerPattern(IPattern* p) {
    if (!p) return;
    patterns_.push_back(p);
}

void PatternRegistry::registerCustomPattern(IPattern* p) {
    if (!p) return;
    patterns_.push_back(p);
    customPatternsOwned_.push_back(p);
}

void PatternRegistry::unregisterPattern(const char* id) {
    if (!id) return;
    // Remove from main patterns list
    for (auto it = patterns_.begin(); it != patterns_.end(); ++it) {
        if (strcmp((*it)->meta().id, id) == 0) {
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
    for (auto* p : patterns_) {
        if (strcmp(p->meta().id, id) == 0) return p;
    }
    // Fallback: case-insensitive match for portal/UI typos.
    for (auto* p : patterns_) {
        if (idEqualsIgnoreCase_(p->meta().id, id)) return p;
    }
    return nullptr;
}

IPattern* PatternRegistry::at(size_t idx) const {
    if (idx >= patterns_.size()) return nullptr;
    return patterns_[idx];
}

} // namespace haxel::core
