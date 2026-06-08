#pragma once

#include "Pattern.h"
#include <vector>

namespace haxel::core {

class PatternRegistry {
public:
    static PatternRegistry& instance();

    void registerPattern(IPattern* p);
    IPattern* find(const char* id) const;
    IPattern* at(size_t idx) const;
    size_t size() const { return patterns_.size(); }

    const std::vector<IPattern*>& all() const { return patterns_; }

private:
    std::vector<IPattern*> patterns_;
};

} // namespace haxel::core
