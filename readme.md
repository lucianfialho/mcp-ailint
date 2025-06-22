# 🎯 AILint MCP Server

**Stop AI from generating shit code - Intelligent code analysis for AI assistants**

> 🚀 **The Problem**: AI assistants generate functional code that violates best practices, security principles, and architectural patterns.
> 
> ✅ **The Solution**: AILint analyzes code in real-time and provides intelligent suggestions based on proven software engineering principles.

## ⚡ Quick Start

### Installation

```bash
# Install globally (recommended)
npm install -g @ailint/mcp

# Or use directly with npx
npx -y @ailint/mcp@latest
```

### Setup in Your IDE
#### Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ailint": {
      "command": "npx",
      "args": ["-y", "@ailint/mcp@latest"]
    }
  }
}
```


#### Windsurf

Add to your Windsurf MCP config:

```json
{
  "mcpServers": {
    "ailint": {
      "command": "npx",
      "args": ["-y", "@ailint/mcp@latest"]
    }
  }
}
```

#### Claude Desktop

Add to your Claude config:

```json
{
  "mcpServers": {
    "AILint": {
      "command": "npx",
      "args": ["-y", "@ailint/mcp@latest"]
    }
  }
}
```

#### VS Code

Add to your VS Code MCP config:

```json
{
  "mcp": {
    "servers": {
      "ailint": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@ailint/mcp@latest"]
      }
    }
  }
}
```

## 🔍 How to Use

Simply add `use ailint` to your prompts in any AI assistant:

### Basic Analysis

```txt
Review this Python function for issues. use ailint

def process_user_data(user_id, email, password):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    result = db.execute(query)
    hashed = md5(password)
    return result
```

**AILint Response:**
```txt
🚨 SQL INJECTION VULNERABILITY (Line 2)
Never use string interpolation for SQL queries!
💡 Fix: Use parameterized queries with placeholders

🚨 WEAK CRYPTOGRAPHY (Line 4)  
MD5 is cryptographically broken!
💡 Fix: Use bcrypt or Argon2 for password hashing
```

### Advanced Analysis with GitHub Rules

```txt
Analyze this React component with solid, react rules. use ailint

function UserProfile({ userId }) {
    const [user, setUser] = useState(null);
    const [posts, setPosts] = useState([]);
    // ... 50 more lines with multiple responsibilities
}
```

**AILint Response:**
```txt
⚠️ GOD COMPONENT (17 responsibilities detected)
Component handles user data, posts, comments, validation...
💡 Fix: Split into UserInfo, UserPosts, UserComments

🚨 MISSING DEPENDENCIES (useEffect)
userId not in dependency array - can cause stale closures
💡 Fix: Add [userId] to useEffect dependencies
```

### Project Setup

```txt
Setup this project with universal rules for cursor. use ailint
```

**AILint Response:**
```txt
✅ Project setup completed!
📁 Created: .cursor/rules/universal/
📄 Downloaded: 4 universal rules (avoid-god-classes.mdc, secure-by-default.mdc, etc.)
🔄 Auto-attach: Enabled for future analysis

Next: All code analysis will automatically include these rules!
```

## 📋 Available Rules

### 🌍 Universal Rules (Always Active)

| Rule | Description | Severity |
|------|-------------|----------|
| **avoid-god-classes** | Prevents classes with too many methods (SRP) | ⚠️ Warning |
| **secure-by-default** | Blocks SQL injection and weak crypto | 🚨 Error |
| **dependency-injection** | Enforces testable, loosely-coupled code | ⚠️ Warning |
| **prefer-early-returns** | Reduces deep nesting with guard clauses | 💡 Info |

### 🚀 Framework Rules (GitHub Integration)

| Framework | Rules Available | Status |
|-----------|-----------------|--------|
| **React** | Hooks, components, performance patterns | 🔄 Coming Soon |
| **Vue** | Composition API, reactivity patterns | 🔄 Coming Soon |
| **Angular** | DI, lifecycle, best practices | 🔄 Coming Soon |
| **Node.js** | Async patterns, security, performance | 🔄 Coming Soon |

### 🏗️ Principle Rules (GitHub Integration)

| Principle | Description | Status |
|-----------|-------------|--------|
| **SOLID** | Single Responsibility, Open/Closed, etc. | 🔄 Coming Soon |
| **DDD** | Domain-Driven Design patterns | 🔄 Coming Soon |
| **Clean Architecture** | Dependency rules, clean code | 🔄 Coming Soon |
| **Object Calisthenics** | Strict clean code rules | 🔄 Coming Soon |

## 🛠️ MCP Tools

AILint provides three main tools for AI assistants:

### 1. `analyze-code`
Analyzes code for quality issues and security vulnerabilities.

**Parameters:**
- `code` (required): Code to analyze
- `language` (optional): Programming language (auto-detected if not provided)
- `filename` (optional): Helps with language detection
- `rulesets` (optional): Additional rules to apply (e.g., `['react', 'solid']`)

### 2. `get-available-rules`
Lists all available rules organized by category.

**Usage:**
```txt
What rules does AILint check for? use ailint
```

### 3. `setup-project`
Sets up AILint for a project with custom rule sets.

**Parameters:**
- `projectPath` (required): Project directory path
- `rulesets` (required): Rule sets to apply (e.g., `['solid', 'react']`)
- `ide` (optional): Target IDE (cursor, windsurf, vscode, etc.)

## 🔥 Real-World Examples

### Example 1: Catching Security Issues

**Input Code:**
```python
def login(username, password):
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    user = db.execute(query).fetchone()
    return user is not None
```

**AILint Detection:**
```txt
🚨 SQL INJECTION VULNERABILITY (Line 2)
String interpolation in SQL query allows injection attacks
💡 Fix: Use parameterized queries

❌ Avoid:
query = f"SELECT * FROM users WHERE name = '{username}'"

✅ Prefer:  
query = "SELECT * FROM users WHERE name = ? AND password = ?"
cursor.execute(query, (username, password_hash))
```

### Example 2: Architectural Improvements

**Input Code:**
```python
class UserManager:
    def validate_email(self): pass
    def validate_password(self): pass
    def save_user(self): pass
    def delete_user(self): pass
    def send_email(self): pass
    def log_action(self): pass
    def cache_data(self): pass
    def backup_user(self): pass
    def generate_report(self): pass
    def export_data(self): pass
    def import_data(self): pass
    def sync_external(self): pass
    # ... 15+ methods
```

**AILint Detection:**
```txt
⚠️ GOD CLASS DETECTED (17 methods)
Class has too many responsibilities, violates Single Responsibility Principle
💡 Fix: Split into UserValidator, UserRepository, UserNotifier

✅ Better Architecture:
class UserValidator:
    def validate_email(self): pass
    def validate_password(self): pass

class UserRepository:  
    def save_user(self): pass
    def delete_user(self): pass

class UserService:
    def __init__(self, validator, repository):
        self.validator = validator
        self.repository = repository
```

### Example 3: Code Quality Improvements

**Input Code:**
```python
def process_order(user, product, payment, shipping):
    if user is not None:
        if user.is_active:
            if user.has_permission('buy'):
                if product is not None:
                    if product.in_stock:
                        if payment is not None:
                            if payment.is_valid():
                                # Deep nesting continues...
                                return "Success"
```

**AILint Detection:**
```txt
💡 DEEP NESTING DETECTED (7 levels)
Function has complex nested structure, reduces readability
💡 Fix: Use guard clauses and early returns

✅ Better Approach:
def process_order(user, product, payment, shipping):
    # Guard clauses - early returns
    if user is None:
        return "User not found"
    
    if not user.is_active:
        return "User inactive"
        
    if not user.has_permission('buy'):
        return "No permission"
        
    # Main logic at the same level
    return process_purchase(user, product, payment)
```

## 📊 Code Metrics

AILint provides comprehensive code quality metrics:

```txt
📊 Code Metrics
- Lines of Code: 181
- Complexity: 8/10  
- Maintainability Index: 65/100
- Technical Debt: medium

🎯 Quality Score: 67/100
```

## 🚀 Advanced Usage

### Project-Specific Configuration

After running `setup-project`, AILint creates persistent configuration:

```
your-project/
├── .cursor/rules/
│   ├── universal/
│   │   ├── avoid-god-classes.mdc
│   │   ├── secure-by-default.mdc
│   │   └── index.json
│   └── ailint-config.json
```

Future analysis automatically loads these rules:

```txt
"Review this component. use ailint"
→ Automatically applies universal + project-specific rules
→ No need to specify rulesets again
```

### Custom Rule Development

AILint stores rules in MDC format (Markdown + YAML frontmatter):

```markdown
---
name: "max-function-length"
description: "Functions should not exceed 20 lines"
category: "universal"
severity: "warning"
triggers:
  - type: "regex"
    pattern: "def\\s+\\w+.*?(?=def|$)"
---

# Max Function Length

Enforce maximum function length to improve readability...
```

## 🔧 Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/lucianfialho/ailint.git
cd ailint

# Install dependencies  
npm install

# Build
npm run build

# Test locally
npm run dev
```

### Project Structure

```
ailint-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   └── lib/
│       ├── analyzer.ts       # Code analysis engine
│       ├── ruleEngine.ts     # Rule processing + state machine  
│       ├── projectConfig.ts  # Project setup + rule management
│       ├── api.ts           # GitHub API integration
│       ├── types.ts         # TypeScript interfaces
│       └── hardcodedRules.ts # Universal rules
├── package.json
└── README.md
```

## 🧪 Testing

### Test with Sample Code

Create a test file with intentional issues:

```python
# test-code.py
class UserService:
    def __init__(self):
        self.db = Database("localhost:5432")  # Hardcoded dependency
    
    def get_user(self, user_id):
        query = f"SELECT * FROM users WHERE id = {user_id}"  # SQL injection
        return self.db.execute(query)
```

Then analyze:

```txt
Analyze this Python file for security and quality issues. use ailint
```

### Expected Results

```txt
🚨 SQL INJECTION VULNERABILITY (Line 6)
🚨 HARDCODED DEPENDENCY (Line 3)
📊 Maintainability Index: 40/100
🎯 2 critical issues found
```

## 🤝 Contributing

We welcome contributions! Here's how to help:

### Adding New Rules

1. **Fork the repository**
2. **Create rule file** in `rules/` directory using MDC format
3. **Test the rule** with sample code
4. **Submit pull request** with examples

### Reporting Issues

- 🐛 **Bug reports**: Describe the issue with code examples
- 💡 **Feature requests**: Explain the use case and benefit
- 📚 **Documentation**: Help improve examples and guides

### Rule Requests

Most wanted rules (community voted):
- ⭐ React hooks best practices
- ⭐ TypeScript strict mode compliance  
- ⭐ Node.js security patterns
- ⭐ API design guidelines

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **🏠 Homepage**: [ailint.dev](https://ailint.dev)
- **📖 Documentation**: [docs.ailint.dev](https://docs.ailint.dev)  
- **🐛 Issues**: [GitHub Issues](https://github.com/lucianfialho/ailint/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/lucianfialho/ailint/discussions)
- **🐦 Twitter**: [@ailint_dev](https://twitter.com/ailint_dev)

## 🎯 Roadmap

### ✅ Phase 1 (Completed)
- Basic code analysis with 4 universal rules
- MCP server integration

### ✅ Phase 2 (Current)  
- Enhanced analysis engine (300% more accurate)
- GitHub API integration
- Project setup and configuration
- Multi-IDE support

### 🔜 Phase 3 (Planned)
- AST-based analysis (100% accuracy)
- Custom rule creation system
- Rule marketplace and community
- Team analytics and dashboards
- VS Code extension

## ❤️ Support

If AILint helps improve your code quality, consider:

- ⭐ **Starring the repository**
- 🐦 **Sharing on social media**  
- 🤝 **Contributing rules or features**
- 💬 **Joining our community discussions**

---

**Built with ❤️ by developers who are tired of AI generating problematic code.**

> 🎯 *"Stop the shit code epidemic - one AI constraint at a time"* - AILint Team