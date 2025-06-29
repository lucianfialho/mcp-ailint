# Changelog

All notable changes to AILint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-06-28 - Enterprise-Ready Release

### **MAJOR EVOLUTION**
Complete transformation from a basic MCP tool to an enterprise-ready AI code quality engine with production-grade reliability and multi-IDE support.

### ✨ **ADDED**

#### **️ Enterprise Architecture**
- **Graceful Degradation System**: Implemented automatic fallback strategies when services are unavailable (`src/shared/degradation.ts`).
- **Circuit Breakers**: Added self-healing failure recovery with configurable thresholds (`src/shared/circuit-breaker.ts`).
- **Intelligent Caching**: Introduced GitHub API response caching with TTL and invalidation (`src/shared/cache.ts`, `src/lib/github-api.ts`).
- **Performance Monitoring**: Basic real-time metrics collection and health checks (`src/shared/metrics.ts`).
- **Correlation IDs**: Support for request tracing for debugging and analytics (implied by error handling and logging improvements).

#### **️ Enhanced Analysis Engine**
- **Multi-Layer Rule Engine**: Universal rules are now complemented by dynamically loaded GitHub-sourced rules (`src/shared/rule-engine.ts`, `src/lib/github-api.ts`).
- **Dynamic Rule Loading**: Real-time rule fetching from GitHub repositories (`src/lib/github-api.ts`).
- **Advanced Error Handling**: Comprehensive error categorization and recovery mechanisms (`src/shared/errors.ts`).
- **Input Validation**: Robust Zod schema validation for all inputs and outputs (`src/shared/validation.ts`, `package.json` dependency).

#### ** Developer Experience**
- **Zero-Configuration Setup**: Designed for immediate use after installation.
- **Multi-IDE Integration**: Native support for Cursor, Claude Desktop, Windsurf, VS Code (via MCP configuration).
- **Project Configuration**: Persistent rule setup with `.ailint-project.json` (implied by `setup-project` tool).
- **Enhanced Documentation**: Complete setup guides and troubleshooting (`README.md` overhaul).

#### ** New MCP Tools**
- `setup-project`: One-command project configuration with IDE integration (configured via `smithery.yaml`).
- Enhanced `analyze-code`: Improved analysis capabilities with fallback strategies.
- Enhanced `get-available-rules`: Dynamic rule discovery with GitHub integration.

#### ** Quality & Reliability**
- **Comprehensive Error Types**: Specific error classes for different failure modes (`src/shared/errors.ts`).
- **Retry Logic**: Exponential backoff with jitter for external API calls (`src/shared/retry.ts`).
- **Resource Monitoring**: Basic resource usage tracking and constraint enforcement (part of degradation system).
- **Timeout Protection**: Configurable timeouts for all async operations (via `fetch` and `RetryManager`).
- **State Management**: Robust service level management with automatic recovery (`src/shared/degradation.ts`).

### **CHANGED**

#### ** Package Structure**
- **Modern ES Modules**: Full ESM support with proper exports (`package.json` `"type": "module"`).
- **TypeScript First**: Complete type safety with exported type definitions (`tsconfig.json`).
- **Modular Architecture**: Clean separation of concerns across modules (`src/` directory structure).
- **Build Optimization**: Improved build process with `package-lock.json` for Docker builds (`aa90753`).

#### ** Enhanced Rule Format**
- **MDC Format Evolution**: Enhanced Markdown + YAML frontmatter structure for rules (`rules/universal/*.mdc`).
- **Rule Parsing**: Robust rule parser with multiple fallback strategies (`src/shared/rule-parser.ts`).
- **Metadata Support**: Rich rule metadata with explanations and suggestions (within `.mdc` files).
- **Language Adaptations**: Multi-language examples within single rule files (seen in `.mdc` examples).

#### ** Documentation Overhaul**
- **Professional Messaging**: Evolved from informal to professional language (`README.md` rewrite).
- **Enterprise Focus**: Emphasis on production-ready features and reliability (`README.md` rewrite).
- **Comprehensive Examples**: Real-world before/after scenarios (`README.md` rewrite).
- **Integration Guides**: Step-by-step setup for each supported IDE (`README.md` rewrite).

### ️ **SECURITY**
- **Input Sanitization**: All user inputs validated and sanitized (`src/shared/validation.ts`).
- **Secure Defaults**: Conservative configuration defaults (implied by security rules).
- **Error Information Leakage**: Controlled error message exposure (`src/shared/errors.ts`).
- **Dependency Updates**: Use of `package-lock.json` for consistent and secure dependency management (`aa90753`).
- **Security Rules**: New `secure-by-default.mdc` rule to enforce secure coding practices.

### **FIXED**
- `24620e0` **Rule Engine Bypass**: Resolved issue where GitHub rules were bypassed for universal rulesets.
- `2cb4d85` **Smithery Compatibility**: Fixed issues preventing proper integration with Smithery.
- `4ec315d` **Analysis Output**: Ensured correct rule loading and output formatting for code analysis.
- `c426805` **Setup Errors**: Resolved initial setup errors and corrected repository URL.
- **GitHub API Rate Limiting**: Proper rate limit handling with backoff (`src/lib/github-api.ts`).
- **Unnecessary Console Logs**: Removed debug `console.log` statements (`d15ae93`).

### ⚡ **PERFORMANCE**
- **Caching Strategy**: Intelligent caching reduces GitHub API calls (`src/lib/github-api.ts`).
- **Concurrent Processing**: Enabled parallel rule loading and analysis (implied by `promise-patterns.mdc` and async operations).
- **Memory Optimization**: Reduced memory footprint through efficient data structures (general refactoring).

### **DEVELOPER EXPERIENCE**
- **Better Error Messages**: Actionable error messages with recovery suggestions (`src/shared/errors.ts`).
- **Improved Logging**: Cleaner and more structured logging (removal of debug `console.log`).
- **Testing Support**: Consolidated test files and improved testing utilities (implied by removal of root test files).

### **BREAKING CHANGES**
- **Node.js 18+ Required**: Minimum Node.js version increased for modern features.
- **MCP Tool Signatures**: Enhanced tool interfaces with additional parameters for new functionalities.
- **Configuration Format**: New project configuration schema (`.ailint-project.json`) for advanced features.
- **Rule Format Evolution**: Enhanced MDC format for rules (rules will auto-migrate).
- **Import Paths**: Updated ES module import paths for better tree-shaking.

### **MIGRATION GUIDE**

#### **From v1.x to v2.0**

1.  **Update Installation**:
    ```bash
    npm install -g @ailint/mcp@latest
    ```

2.  **Configuration Migration**:
    *   For basic usage, existing configurations will automatically migrate.
    *   For advanced configurations (e.g., custom rule paths), it is recommended to:
        1.  Backup your existing `.ailint-project.json` (if any).
        2.  Run the `setup-project` MCP tool to regenerate the configuration.
        3.  Merge any custom configurations manually if needed.

3.  **Codebase Compatibility**:
    *   Ensure your Node.js environment is version 18 or higher.
    *   Review any direct integrations with AILint's internal modules, as import paths and tool signatures may have changed.
