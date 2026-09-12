#include "CustomPatternEvaluator.h"
#include <sstream>
#include <algorithm>
#include <cstring>

namespace haxel::patterns {

// --- Noise Implementation ---
static float fade(float t) { return t * t * t * (t * (t * 6 - 15) + 10); }
static float lerp_fn(float a, float b, float t) { return a + (b - a) * t; }
static float grad1(int h, float x) { return (h & 1) ? -x : x; }

static uint8_t PRM[512];
static bool prmInitialized = false;
static void initPRM() {
    if (prmInitialized) return;
    for (int i = 0; i < 256; i++) PRM[i] = i;
    uint32_t seed = 2654435769;
    for (int i = 255; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223);
        int j = seed % (i + 1);
        uint8_t temp = PRM[i];
        PRM[i] = PRM[j];
        PRM[j] = temp;
    }
    for (int i = 0; i < 256; i++) PRM[i + 256] = PRM[i];
    prmInitialized = true;
}

static float pnoise1(float x) {
    initPRM();
    float fx = floorf(x);
    int X = ((int)fx) & 255;
    x -= fx;
    float u = fade(x);
    int a = PRM[X];
    int b = PRM[X + 1];
    return (lerp_fn(grad1(a, x), grad1(b, x - 1.0f), u) + 1.0f) * 0.5f;
}

CustomPatternEvaluator::CustomPatternEvaluator() {
    vars_["PI"] = (float)M_PI;
    vars_["TAU"] = (float)M_PI * 2.0f;
}

std::vector<Token> CustomPatternEvaluator::tokenize(const std::string& source) {
    std::vector<Token> tokens;
    size_t i = 0;
    size_t len = source.length();

    while (i < len) {
        char c = source[i];
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
            i++;
            continue;
        }
        // Line Comments
        if (c == '/' && i + 1 < len && source[i + 1] == '/') {
            while (i < len && source[i] != '\n') i++;
            continue;
        }
        // Block Comments
        if (c == '/' && i + 1 < len && source[i + 1] == '*') {
            i += 2;
            while (i + 1 < len && !(source[i] == '*' && source[i + 1] == '/')) i++;
            i = std::min(i + 2, len);
            continue;
        }
        // Numbers
        if ((c >= '0' && c <= '9') || (c == '.' && i + 1 < len && source[i + 1] >= '0' && source[i + 1] <= '9')) {
            size_t j = i;
            while (j < len && ((source[j] >= '0' && source[j] <= '9') || source[j] == '.')) j++;
            std::string valStr = source.substr(i, j - i);
            Token t;
            t.type = TokenType::NUM;
            t.value = valStr;
            t.numVal = (float)atof(valStr.c_str());
            tokens.push_back(t);
            i = j;
            continue;
        }
        // Identifiers
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_') {
            size_t j = i;
            while (j < len && ((source[j] >= 'a' && source[j] <= 'z') || (source[j] >= 'A' && source[j] <= 'Z') || (source[j] >= '0' && source[j] <= '9') || source[j] == '_')) j++;
            std::string valStr = source.substr(i, j - i);
            Token t;
            t.type = TokenType::ID;
            t.value = valStr;
            tokens.push_back(t);
            i = j;
            continue;
        }
        // Operators & punctuation
        if (i + 1 < len) {
            std::string two = source.substr(i, 2);
            if (two == "<=" || two == ">=" || two == "==" || two == "!=") {
                Token t;
                t.type = TokenType::OP;
                t.value = two;
                tokens.push_back(t);
                i += 2;
                continue;
            }
        }
        if (strchr("+-*/%<>=?:(),;{}", c) != nullptr) {
            Token t;
            t.value = std::string(1, c);
            if (c == '(') t.type = TokenType::LPAREN;
            else if (c == ')') t.type = TokenType::RPAREN;
            else if (c == ',') t.type = TokenType::COMMA;
            else if (c == ';') t.type = TokenType::SEMICOLON;
            else if (c == '=') t.type = TokenType::EQUALS;
            else if (c == '?') t.type = TokenType::QUESTION;
            else if (c == ':') t.type = TokenType::COLON;
            else t.type = TokenType::OP;
            tokens.push_back(t);
            i++;
            continue;
        }
        i++;
    }

    Token t;
    t.type = TokenType::EOF_TYPE;
    t.value = "eof";
    tokens.push_back(t);
    return tokens;
}

bool CustomPatternEvaluator::compile(const std::string& source) {
    try {
        std::vector<Token> tokens = tokenize(source);
        root_ = parseProgram(tokens);
        lastError_ = "";
        return true;
    } catch (const std::exception& e) {
        lastError_ = e.what();
        root_ = nullptr;
        return false;
    }
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseProgram(const std::vector<Token>& tokens) {
    auto prog = std::make_shared<ASTNode>(ASTNodeKind::PROG);
    size_t p = 0;
    while (tokens[p].type != TokenType::EOF_TYPE) {
        while (tokens[p].type == TokenType::SEMICOLON) p++;
        if (tokens[p].type == TokenType::EOF_TYPE) break;
        prog->args.push_back(parseStmt(tokens, p));
        while (tokens[p].type == TokenType::SEMICOLON) p++;
    }
    return prog;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseStmt(const std::vector<Token>& tokens, size_t& p) {
    if (tokens[p].type == TokenType::ID && tokens[p + 1].type == TokenType::EQUALS) {
        std::string name = tokens[p].value;
        p += 2; // eat ID and =
        auto val = parseTern(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::ASN);
        node->name = name;
        node->args.push_back(val);
        return node;
    }
    auto val = parseTern(tokens, p);
    auto node = std::make_shared<ASTNode>(ASTNodeKind::EXP);
    node->args.push_back(val);
    return node;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseTern(const std::vector<Token>& tokens, size_t& p) {
    auto c = parseCmp(tokens, p);
    if (tokens[p].type == TokenType::QUESTION) {
        p++; // eat ?
        auto a = parseTern(tokens, p);
        if (tokens[p].type != TokenType::COLON) {
            throw std::runtime_error("expected ':' in ternary expression");
        }
        p++; // eat :
        auto b = parseTern(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::TERN);
        node->args.push_back(c);
        node->args.push_back(a);
        node->args.push_back(b);
        return node;
    }
    return c;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseCmp(const std::vector<Token>& tokens, size_t& p) {
    auto l = parseAdd(tokens, p);
    while (tokens[p].type == TokenType::OP && 
          (tokens[p].value == "<" || tokens[p].value == ">" || 
           tokens[p].value == "<=" || tokens[p].value == ">=" || 
           tokens[p].value == "==" || tokens[p].value == "!=")) {
        std::string op = tokens[p].value;
        p++;
        auto r = parseAdd(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::BIN_OP);
        node->op = op;
        node->args.push_back(l);
        node->args.push_back(r);
        l = node;
    }
    return l;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseAdd(const std::vector<Token>& tokens, size_t& p) {
    auto l = parseMul(tokens, p);
    while (tokens[p].type == TokenType::OP && (tokens[p].value == "+" || tokens[p].value == "-")) {
        std::string op = tokens[p].value;
        p++;
        auto r = parseMul(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::BIN_OP);
        node->op = op;
        node->args.push_back(l);
        node->args.push_back(r);
        l = node;
    }
    return l;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseMul(const std::vector<Token>& tokens, size_t& p) {
    auto l = parseUn(tokens, p);
    while (tokens[p].type == TokenType::OP && (tokens[p].value == "*" || tokens[p].value == "/" || tokens[p].value == "%")) {
        std::string op = tokens[p].value;
        p++;
        auto r = parseUn(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::BIN_OP);
        node->op = op;
        node->args.push_back(l);
        node->args.push_back(r);
        l = node;
    }
    return l;
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parseUn(const std::vector<Token>& tokens, size_t& p) {
    if (tokens[p].type == TokenType::OP && tokens[p].value == "-") {
        p++;
        auto e = parseUn(tokens, p);
        auto node = std::make_shared<ASTNode>(ASTNodeKind::NEG);
        node->args.push_back(e);
        return node;
    }
    if (tokens[p].type == TokenType::OP && tokens[p].value == "+") {
        p++;
        return parseUn(tokens, p);
    }
    return parsePri(tokens, p);
}

std::shared_ptr<ASTNode> CustomPatternEvaluator::parsePri(const std::vector<Token>& tokens, size_t& p) {
    const Token& t = tokens[p];
    if (t.type == TokenType::NUM) {
        auto node = std::make_shared<ASTNode>(ASTNodeKind::NUM);
        node->val = t.numVal;
        p++;
        return node;
    }
    if (t.type == TokenType::LPAREN) {
        p++; // eat (
        auto e = parseTern(tokens, p);
        if (tokens[p].type != TokenType::RPAREN) {
            throw std::runtime_error("expected ')'");
        }
        p++; // eat )
        return e;
    }
    if (t.type == TokenType::ID) {
        std::string name = t.value;
        p++;
        if (tokens[p].type == TokenType::LPAREN) {
            p++; // eat (
            auto node = std::make_shared<ASTNode>(ASTNodeKind::CALL);
            node->name = name;
            if (tokens[p].type != TokenType::RPAREN) {
                node->args.push_back(parseTern(tokens, p));
                while (tokens[p].type == TokenType::COMMA) {
                    p++; // eat ,
                    node->args.push_back(parseTern(tokens, p));
                }
            }
            if (tokens[p].type != TokenType::RPAREN) {
                throw std::runtime_error("expected ')'");
            }
            p++; // eat )
            return node;
        }
        auto node = std::make_shared<ASTNode>(ASTNodeKind::VAR);
        node->name = name;
        return node;
    }
    throw std::runtime_error("unexpected token: " + t.value);
}

float CustomPatternEvaluator::evaluate(const haxel::core::PatternContext& ctx, float speed, float floorVal) {
    if (!root_) return 0.0f;

    float t = ctx.tMs / 1000.0f; // convert to seconds
    float dt = lastT_ == 0.0f ? 0.016f : (t - lastT_);
    lastT_ = t;

    vars_["t"] = t;
    vars_["time"] = t;
    vars_["dt"] = dt;
    vars_["delta"] = dt;
    vars_["freq"] = 150.0f; // default frequency shift parameter
    vars_["speed"] = speed;
    vars_["intensity"] = ctx.intensityMaster;
    vars_["floor"] = floorVal;

    runT_ = t;
    float lastVal = 0.0f;
    for (const auto& s : root_->args) {
        if (s->kind == ASTNodeKind::ASN) {
            vars_[s->name] = evalNode(s->args[0], ctx, speed, floorVal);
        } else if (s->kind == ASTNodeKind::EXP) {
            lastVal = evalNode(s->args[0], ctx, speed, floorVal);
        }
    }
    // Clamp output to 0.0..1.0
    return lastVal < 0.0f ? 0.0f : (lastVal > 1.0f ? 1.0f : lastVal);
}

float CustomPatternEvaluator::evalNode(const std::shared_ptr<ASTNode>& node, const haxel::core::PatternContext& ctx, float speed, float floorVal) {
    if (!node) return 0.0f;

    switch (node->kind) {
        case ASTNodeKind::NUM:
            return node->val;
        case ASTNodeKind::VAR:
            if (vars_.find(node->name) != vars_.end()) {
                return vars_[node->name];
            }
            return 0.0f;
        case ASTNodeKind::NEG:
            return -evalNode(node->args[0], ctx, speed, floorVal);
        case ASTNodeKind::BIN_OP: {
            float l = evalNode(node->args[0], ctx, speed, floorVal);
            float r = evalNode(node->args[1], ctx, speed, floorVal);
            if (node->op == "+") return l + r;
            if (node->op == "-") return l - r;
            if (node->op == "*") return l * r;
            if (node->op == "/") return r != 0.0f ? l / r : 0.0f;
            if (node->op == "%") return r != 0.0f ? fmodf(l, r) : 0.0f;
            if (node->op == "<") return l < r ? 1.0f : 0.0f;
            if (node->op == ">") return l > r ? 1.0f : 0.0f;
            if (node->op == "<=") return l <= r ? 1.0f : 0.0f;
            if (node->op == ">=") return l >= r ? 1.0f : 0.0f;
            if (node->op == "==") return fabsf(l - r) < 1e-5f ? 1.0f : 0.0f;
            if (node->op == "!=") return fabsf(l - r) >= 1e-5f ? 1.0f : 0.0f;
            return 0.0f;
        }
        case ASTNodeKind::TERN:
            return evalNode(node->args[0], ctx, speed, floorVal) != 0.0f ? 
                   evalNode(node->args[1], ctx, speed, floorVal) : 
                   evalNode(node->args[2], ctx, speed, floorVal);
        case ASTNodeKind::CALL: {
            std::vector<float> args;
            for (const auto& a : node->args) {
                args.push_back(evalNode(a, ctx, speed, floorVal));
            }
            // Math library built-ins
            if (node->name == "sin") return args.size() > 0 ? sinf(args[0]) : 0.0f;
            if (node->name == "cos") return args.size() > 0 ? cosf(args[0]) : 0.0f;
            if (node->name == "tan") return args.size() > 0 ? tanf(args[0]) : 0.0f;
            if (node->name == "abs") return args.size() > 0 ? fabsf(args[0]) : 0.0f;
            if (node->name == "sqrt") return args.size() > 0 ? sqrtf(fabsf(args[0])) : 0.0f;
            if (node->name == "pow") return args.size() > 1 ? powf(args[0], args[1]) : 0.0f;
            if (node->name == "floor") return args.size() > 0 ? floorf(args[0]) : 0.0f;
            if (node->name == "ceil") return args.size() > 0 ? ceilf(args[0]) : 0.0f;
            if (node->name == "round") return args.size() > 0 ? roundf(args[0]) : 0.0f;
            if (node->name == "frac") return args.size() > 0 ? args[0] - floorf(args[0]) : 0.0f;
            if (node->name == "min") return args.size() > 1 ? std::min(args[0], args[1]) : 0.0f;
            if (node->name == "max") return args.size() > 1 ? std::max(args[0], args[1]) : 0.0f;
            if (node->name == "clamp") return args.size() > 2 ? std::max(args[1], std::min(args[2], args[0])) : 0.0f;
            if (node->name == "mix" || node->name == "lerp") {
                return args.size() > 2 ? args[0] + (args[1] - args[0]) * args[2] : 0.0f;
            }
            if (node->name == "step") return args.size() > 1 ? (args[1] < args[0] ? 0.0f : 1.0f) : 0.0f;
            if (node->name == "smoothstep") {
                if (args.size() < 3) return 0.0f;
                float t = (args[2] - args[0]) / (args[1] - args[0]);
                t = std::max(0.0f, std::min(1.0f, t));
                return t * t * (3.0f - 2.0f * t);
            }
            if (node->name == "wave") {
                return args.size() > 0 ? (sinf(args[0] * 2.0f * (float)M_PI) + 1.0f) * 0.5f : 0.0f;
            }
            if (node->name == "triangle") {
                if (args.size() == 0) return 0.0f;
                float f = args[0] - floorf(args[0]);
                return f < 0.5f ? f * 2.0f : 2.0f - f * 2.0f;
            }
            if (node->name == "square") {
                if (args.size() == 0) return 0.0f;
                float duty = args.size() > 1 ? args[1] : 0.5f;
                float f = args[0] - floorf(args[0]);
                return f < duty ? 1.0f : 0.0f;
            }
            if (node->name == "time") {
                if (args.size() == 0 || args[0] <= 0.0f) return 0.0f;
                return (runT_ / args[0]) - floorf(runT_ / args[0]);
            }
            if (node->name == "random") {
                return (float)rand() / (float)RAND_MAX;
            }
            if (node->name == "hash") {
                return args.size() > 0 ? fmodf(fabsf(sinf(args[0] * 12.9898f + 78.233f) * 43758.5453f), 1.0f) : 0.0f;
            }
            if (node->name == "noise" || node->name == "perlin1d") {
                return args.size() > 0 ? pnoise1(args[0]) : 0.0f;
            }

            // Audio reactivity
            float audioRms = ctx.audio.valid ? ctx.audio.rms : 0.0f;
            if (node->name == "vu") return audioRms;
            if (node->name == "peak") return audioRms * 1.2f;
            if (node->name == "pitch") return 0.5f + sinf(runT_) * 0.2f;
            if (node->name == "beat") return powf(std::max(0.0f, sinf(runT_ * 4.5f)), 4.0f);
            if (node->name == "band") {
                if (args.size() == 0 || !ctx.audio.valid) return 0.0f;
                int idx = std::max(0, std::min(31, (int)args[0]));
                return ctx.audio.mags[idx];
            }
            if (node->name == "bass") {
                if (!ctx.audio.valid) return 0.0f;
                float sum = 0.0f;
                for (int b = 0; b < 4; b++) sum += ctx.audio.mags[b];
                return sum / 4.0f;
            }
            if (node->name == "mid") {
                if (!ctx.audio.valid) return 0.0f;
                float sum = 0.0f;
                for (int b = 4; b < 16; b++) sum += ctx.audio.mags[b];
                return sum / 12.0f;
            }
            if (node->name == "treble") {
                if (!ctx.audio.valid) return 0.0f;
                float sum = 0.0f;
                for (int b = 16; b < 32; b++) sum += ctx.audio.mags[b];
                return sum / 16.0f;
            }

            return 0.0f;
        }
        default:
            return 0.0f;
    }
}

} // namespace haxel::patterns
