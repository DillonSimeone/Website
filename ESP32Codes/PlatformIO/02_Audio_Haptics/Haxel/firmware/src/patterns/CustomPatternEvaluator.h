#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <cmath>
#include <memory>
#include "../core/Pattern.h"

namespace haxel::patterns {

enum class TokenType {
    NUM,
    ID,
    OP,
    LPAREN,
    RPAREN,
    COMMA,
    SEMICOLON,
    EQUALS,
    QUESTION,
    COLON,
    EOF_TYPE
};

struct Token {
    TokenType type;
    std::string value;
    float numVal = 0.0f;
};

enum class ASTNodeKind {
    NUM,
    VAR,
    NEG,
    BIN_OP,
    TERN,
    CALL,
    ASN,
    PROG,
    EXP
};

struct ASTNode {
    ASTNodeKind kind;
    float val = 0.0f;
    std::string name;
    std::string op;
    std::vector<std::shared_ptr<ASTNode>> args;

    ASTNode(ASTNodeKind k) : kind(k) {}
};

class CustomPatternEvaluator {
public:
    CustomPatternEvaluator();
    bool compile(const std::string& source);
    float evaluate(const haxel::core::PatternContext& ctx, float speed, float floor);
    const std::string& getLastError() const { return lastError_; }

private:
    std::vector<Token> tokenize(const std::string& source);
    std::shared_ptr<ASTNode> parseProgram(const std::vector<Token>& tokens);
    std::shared_ptr<ASTNode> parseStmt(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parseTern(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parseCmp(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parseAdd(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parseMul(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parseUn(const std::vector<Token>& tokens, size_t& p);
    std::shared_ptr<ASTNode> parsePri(const std::vector<Token>& tokens, size_t& p);

    float evalNode(const std::shared_ptr<ASTNode>& node, const haxel::core::PatternContext& ctx, float speed, float floor);

    std::shared_ptr<ASTNode> root_;
    std::unordered_map<std::string, float> vars_;
    std::string lastError_;
    float lastT_ = 0.0f;
    float runT_ = 0.0f;
};

} // namespace haxel::patterns
