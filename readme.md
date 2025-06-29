# AILint: Constraint Rules for AI Code Generation

**Stop AI from generating problematic code – Enforce software engineering principles.**

> **The Problem**: AI assistants are incredible at generating functional code, but they often produce code that violates best practices, security principles, and architectural patterns. This leads to technical debt, security vulnerabilities, and maintainability nightmares.
>
> **The Solution**: AILint provides a set of deterministic state machine rules that act as "guardrails" for AI code generation. By applying proven software engineering principles as constraints *during* the code generation process, AILint ensures the output is high-quality, secure, and maintainable.

## Why AILint?

AI assistants, while powerful, frequently exhibit common pitfalls in code generation:
- **Tightly Coupled & Untestable Code**: Defaults to hardcoded dependencies and monolithic structures.
- **Insecure Patterns**: Introduces SQL injection vulnerabilities, weak cryptography, and other security flaws.
- **Unreadable & Complex Code**: Generates deeply nested logic and vague naming conventions.
- **Inefficient Operations**: Uses blocking calls instead of asynchronous, concurrent patterns.
- **Inconsistent Practices**: Produces non-standard commit messages, unhelpful error messages, and generic variable/function names.

**AILint solves these issues by applying constraints *during* the code generation process, not just after.**

## How It Works

Each AILint rule is a sophisticated **state machine** designed to guide AI behavior:

1.  **Detection**: Identifies problematic patterns or anti-patterns in AI requests or generated code snippets.
2.  **Analysis**: Evaluates the context, intent, and potential implications of the detected pattern.
3.  **Constraint**: Applies specific architectural principles, security best practices, or code quality standards as constraints.
4.  **Validation**: Ensures the AI's output adheres to these constraints, providing feedback if violations occur.

```
AI Request → Detection → Analysis → Constraint → Validation → High-Quality Code
```

## Universal Rules

AILint's core strength lies in its universal rules, which are language-agnostic and apply fundamental software engineering principles. These rules are defined in `.mdc` files within the `rules/universal/` directory.

### **Architecture & Design**
- **[avoid-god-classes](rules/universal/avoid-god-classes.mdc)**: Prevents AI from creating massive, multi-responsibility classes, enforcing the Single Responsibility Principle.
- **[composition-over-inheritance](rules/universal/composition-over-inheritance.mdc)**: Guides AI to favor composition for flexible, testable designs over rigid inheritance hierarchies.
- **[dependency-injection](rules/universal/dependency-injection.mdc)**: Ensures AI generates code with proper dependency injection, promoting testability and loose coupling.

### **Security & Performance**
- **[secure-by-default](rules/universal/secure-by-default.mdc)**: Enforces security-first patterns, preventing SQL injection, weak cryptography, and other common vulnerabilities.
- **[promise-patterns](rules/universal/promise-patterns.mdc)**: Guides AI to use concurrent asynchronous patterns, eliminating blocking operations and improving performance.

### **Code Quality & Readability**
- **[prefer-early-returns](rules/universal/prefer-early-returns.mdc)**: Eliminates deeply nested if-else chains by enforcing guard clauses and early return patterns.
- **[conventional-commits](rules/universal/conventional-commits.mdc)**: Ensures AI generates clear, structured commit messages following the Conventional Commits standard.
- **[descriptive-function-names](rules/universal/descriptive-function-names.mdc)**: Prevents vague function names (`process`, `handle`) by enforcing intention-revealing, behavior-specific naming.
- **[explicit-error-messages](rules/universal/explicit-error-messages.mdc)**: Guides AI to generate specific, actionable error messages instead of generic, unhelpful ones.
- **[meaningful-variable-names](rules/universal/meaningful-variable-names.mdc)**: Eliminates vague variable names (`data`, `result`) by enforcing intention-revealing, context-specific naming.

## Before vs After

See the dramatic improvement in AI-generated code when AILint's constraints are applied.

### **Without AILint** (what AI typically generates):

```python
# Tightly coupled, insecure, unreadable nightmare
class UserService:
    def __init__(self):
        self.db = PostgresDatabase("localhost:5432")  # Hardcoded!
        self.cache = RedisCache("localhost:6379")     # Untestable!
    
    def login(self, username, password):
        # SQL injection vulnerability
        query = f"SELECT * FROM users WHERE username = '{username}'"
        user = self.db.execute(query).fetchone()
        
        # Weak password hashing
        password_hash = hashlib.md5(password.encode()).hexdigest()
        
        if user:
            if user.get('is_active'):
                if user.get('email'):
                    if '@' in user['email']:
                        if user.get('has_permission'):
                            # Logic buried 5 levels deep!
                            return user['email'].lower()
```

### **With AILint** (constrained generation):

```python
# Loosely coupled, secure, testable, and readable
class UserService:
    def __init__(self, db, cache, logger):
        # Dependencies injected - fully testable!
        self.db = db
        self.cache = cache
        self.logger = logger
    
    def login(self, username, password):
        # Guard clauses - fail fast, clear flow
        if not username:
            raise ValueError('Username required')
        if not password:
            raise ValueError('Password required')
        
        # Parameterized query - SQL injection impossible
        query = "SELECT * FROM users WHERE username = ?"
        user = self.db.execute(query, (username,)).fetchone()
        
        # Secure password verification with bcrypt
        if user and bcrypt.checkpw(password.encode(), user['password_hash']):
            self.logger.info(f"User {username} logged in successfully")
            return user
        
        raise AuthenticationError('Invalid credentials')
```

## Quick Start

### **Copy-Paste Method** (Immediate Use)
For quick, ad-hoc application of rules:
1.  **Choose a rule** from the `rules/universal/` directory (e.g., `secure-by-default.mdc`).
2.  **Copy the entire content** of the `.mdc` file.
3.  **Paste the rule content** directly into your AI assistant's prompt *before* your code generation request.
4.  **Generate code** – the AI will automatically follow the constraints!

**Example**: To prevent hardcoded dependencies, copy the content of `dependency-injection.mdc` into your prompt.

### **MCP Integration** (Professional Setup)
For seamless, persistent integration with AI tools like Claude, Cursor, and others, use the AILint MCP (Model Context Protocol) server. This project (`ailint-mcp`) provides the server implementation.

```bash
npm install -g @ailint/mcp
```

See the [ailint-mcp repository](https://github.com/lucianfialho/ailint-mcp) for detailed setup instructions for various IDEs and AI clients.

## Repository Structure

```
ailint/
├── rules/
│   ├── universal/              # Language-agnostic rules (e.g., SRP, Security, Naming)
│   │   ├── avoid-god-classes.mdc
│   │   ├── composition-over-inheritance.mdc
│   │   ├── conventional-commits.mdc
│   │   ├── dependency-injection.mdc
│   │   ├── descriptive-function-names.mdc
│   │   ├── explicit-error-messages.mdc
│   │   ├── meaningful-variable-names.mdc
│   │   ├── prefer-early-returns.mdc
│   │   ├── promise-patterns.mdc
│   │   └── secure-by-default.mdc
│   ├── language-specific/      # (Future) Rules for specific languages (e.g., Python, JS, Java)
│   └── framework-specific/     # (Future) Rules for specific frameworks (e.g., React, Spring)
├── schemas/                    # (Future) Schemas for rule validation
│   └── rule-schema.json
├── docs/                       # (Future) Documentation on writing rules, philosophy
│   └── writing-rules.md
├── .gitignore
└── README.md                   # This file
```

## Language Support

AILint rules are designed to be universal, but examples and adaptations are provided for clarity across different programming languages:

-   **Python**: Primary examples, focusing on idiomatic Python patterns.
-   **JavaScript**: ES6+ patterns, Promise-based async, modern module practices.
-   **Java**: Enterprise patterns, `CompletableFuture`, Spring conventions.
-   **C#**: .NET patterns, `Task.WhenAll`, secure coding practices.

## Contributing

We welcome contributions to expand AILint's rule set and improve its effectiveness!

### **Adding New Rules**

1.  **Identify an AI limitation**: Pinpoint a common problematic pattern AI generates (e.g., "AI generates synchronous code when async is better").
2.  **Create a rule file**: Add a new `.mdc` file in `rules/universal/` (or a new language/framework directory if applicable).
3.  **Define the state machine**: Structure your rule with `triggers`, `states`, `transitions`, and `actions` as demonstrated in existing `.mdc` files.
4.  **Include clear examples**: Provide "bad" (AI-generated without AILint) and "good" (AI-generated with AILint) code examples.
5.  **Submit a Pull Request**: Ensure your commit message follows Conventional Commits.

### **Improving Existing Rules**

-   Add language-specific adaptations or more diverse examples.
-   Refine rule descriptions, triggers, or constraints.
-   Optimize state machine logic for better detection.

### **Reporting Issues**

-   **Bug reports**: Describe unexpected AI behavior or rule failures with reproducible examples.
-   **Feature requests**: Suggest new rules or enhancements to the AILint system.
-   **Documentation**: Help improve clarity, examples, and guides.



## Roadmap

-   [ ] **Phase 3 (Planned)**:
    -   **AST-based Analysis**: Implement deeper, more accurate code analysis.
    -   **Custom Rule Creation UI**: A user-friendly interface for defining new rules.
    -   **Rule Marketplace**: A platform for sharing and discovering community-contributed rules.
    -   **Team Analytics & Dashboards**: Insights into code quality trends over time.
    -   **VS Code Extension**: Direct integration into the VS Code editor.
-   [ ] **Future Enhancements**:
    -   Language-specific rule packs (e.g., Python, JavaScript, Java).
    -   Framework-specific rule packs (e.g., React, Spring, Django).
    -   Integration APIs for popular AI coding assistants.

## Philosophy

AILint is built on the principle that **constraints enable creativity**. By providing AI assistants with clear, well-defined boundaries based on proven software engineering principles, we empower them to generate not just functional code, but *excellent* code.

Think of it as **"guardrails that prevent AI from generating problematic code"** – keeping AI on the path to quality, security, and maintainability.

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

## Community

-   **GitHub Issues**: [Report bugs or request features](https://github.com/lucianfialho/ailint/issues)
-   **Discussions**: [Share ideas, ask questions, and collaborate](https://github.com/lucianfialho/ailint/discussions)
-   **Twitter**: Follow [@ailint_dev](https://twitter.com/ailint_dev) for updates

---

**Built with ❤️ by developers who are tired of AI generating problematic code.**

> *"Stop the problematic code epidemic – one AI constraint at a time"* – AILint Team
