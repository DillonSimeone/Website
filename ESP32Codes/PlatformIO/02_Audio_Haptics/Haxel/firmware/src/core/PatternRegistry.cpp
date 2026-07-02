#include "PatternRegistry.h"
#include <cstring>

namespace haxel::core {

PatternRegistry& PatternRegistry::instance() {
    static PatternRegistry r;
    return r;
}

void PatternRegistry::registerPattern(IPattern* p) {
    if (!p) return;
    patterns_.push_back(p);
}

IPattern* PatternRegistry::find(const char* id) const {
    if (!id) return nullptr;
    for (auto* p : patterns_) {
        if (strcmp(p->meta().id, id) == 0) return p;
    }
    return nullptr;
}

IPattern* PatternRegistry::at(size_t idx) const {
    if (idx >= patterns_.size()) return nullptr;
    return patterns_[idx];
}

} // namespace haxel::core
