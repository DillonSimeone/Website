#pragma once

#include "../core/Pattern.h"
#include "CustomPatternEvaluator.h"

namespace haxel::patterns {

class CustomPattern : public core::IPattern {
public:
    CustomPattern(const std::string& id, const std::string& name, const std::string& code) 
        : id_(id), name_(name), code_(code) {
        
        evaluator_.compile(code_);
        
        meta_.id = id_.c_str();
        meta_.category = "custom";
        meta_.tags = "custom,user-defined";
        meta_.description = name_.c_str();
        meta_.params = nullptr;
        meta_.paramCount = 0;
        meta_.multiChannel = false;
        
        // Scan code for audio functions to determine if audio task needs to be active
        meta_.usesAudio = (code_.find("vu(") != std::string::npos || 
                           code_.find("peak(") != std::string::npos ||
                           code_.find("band(") != std::string::npos ||
                           code_.find("bass(") != std::string::npos ||
                           code_.find("mid(") != std::string::npos ||
                           code_.find("treble(") != std::string::npos);
    }

    const core::PatternMeta& meta() const override {
        return meta_;
    }

    float sample(const core::PatternContext& ctx) override {
        // speed/floor are engine-owned; Engine applies startupFloor after sample().
        // Pass them as script variables only — do not re-apply the floor here.
        return evaluator_.evaluate(ctx, ctx.speed, ctx.startupFloor);
    }

    const std::string& getCode() const { return code_; }
    const std::string& getName() const { return name_; }

private:
    std::string id_;
    std::string name_;
    std::string code_;
    CustomPatternEvaluator evaluator_;
    core::PatternMeta meta_;
};

} // namespace haxel::patterns
