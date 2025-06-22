import { Rule } from './types.js'

// Hard-coded rules for MVP - will be replaced by GitHub API in Phase 2
export const UNIVERSAL_RULES: Rule[] = [
  {
    name: 'avoid-god-classes',
    category: 'universal',
    description: 'Prevent classes with too many methods (Single Responsibility Principle)',
    version: '1.0.0',
    severity: 'warning',
    triggers: [
      {
        type: 'regex',
        pattern: 'class\\s+\\w+[\\s\\S]*?(?=class|$)',
        context: 'class_definition'
      }
    ],
    constraints: [
      {
        type: 'limit',
        pattern: 'def\\s+\\w+\\s*\\(|function\\s+\\w+\\s*\\(',
        message: 'Class has too many methods. Maximum recommended: 10 methods per class.',
        suggestion: 'Split into smaller, focused classes following Single Responsibility Principle'
      }
    ],
    examples: {
      bad: `class UserManager:
    def validate_email(self, email): pass
    def validate_password(self, password): pass
    def save_user(self, user): pass
    def find_user(self, id): pass
    def delete_user(self, id): pass
    def send_welcome_email(self, user): pass
    def send_password_reset(self, user): pass
    def upload_avatar(self, user, file): pass
    def delete_avatar(self, user): pass
    def cache_user(self, user): pass
    def invalidate_cache(self, user_id): pass
    def log_user_action(self, user, action): pass
    # ... 15+ more methods doing EVERYTHING`,
      good: `# Split into focused classes
class UserValidator:
    def validate_email(self, email): pass
    def validate_password(self, password): pass

class UserRepository:
    def save_user(self, user): pass
    def find_user(self, id): pass
    def delete_user(self, id): pass

class UserNotifier:
    def send_welcome_email(self, user): pass
    def send_password_reset(self, user): pass

# Composition over god classes
class UserService:
    def __init__(self, validator, repository, notifier):
        self.validator = validator
        self.repository = repository
        self.notifier = notifier`,
      explanation: 'Each class now has a single responsibility, making them easier to test, maintain, and understand.'
    }
  },
  
  {
    name: 'secure-by-default',
    category: 'security',
    description: 'Prevent common security vulnerabilities like SQL injection',
    version: '1.0.0',
    severity: 'error',
    triggers: [
      {
        type: 'regex',
        pattern: 'f".*SELECT.*{.*}.*"',
        context: 'sql_injection_python'
      },
      {
        type: 'regex',
        pattern: '`SELECT.*\\$\\{.*\\}.*`',
        context: 'sql_injection_js'
      },
      {
        type: 'regex',
        pattern: '"SELECT.*"\\s*\\+',
        context: 'sql_concatenation'
      }
    ],
    constraints: [
      {
        type: 'forbidden',
        pattern: 'f".*SELECT.*{|`SELECT.*\\$\\{|"SELECT.*"\\s*\\+',
        message: 'SQL injection vulnerability detected! Never use string concatenation or f-strings for SQL queries.',
        suggestion: 'Use parameterized queries with placeholders (?, %s) to prevent SQL injection'
      }
    ],
    examples: {
      bad: `# DANGEROUS - SQL Injection vulnerability
query = f"SELECT * FROM users WHERE id = {user_id}"
cursor.execute(query)

# Also dangerous
query = "SELECT * FROM users WHERE name = '" + username + "'"`,
      good: `# SAFE - Parameterized query
query = "SELECT * FROM users WHERE id = ?"
cursor.execute(query, (user_id,))

# Also safe - with multiple parameters
query = "SELECT * FROM users WHERE name = ? AND email = ?"
cursor.execute(query, (username, email))`,
      explanation: 'Parameterized queries separate SQL logic from data, making injection attacks impossible.'
    }
  },

  {
    name: 'dependency-injection',
    category: 'universal',
    description: 'Prevent hardcoded dependencies, enforce testability',
    version: '1.0.0',
    severity: 'warning',
    triggers: [
      {
        type: 'regex',
        pattern: 'Database\\(|Redis\\(|HttpClient\\(',
        context: 'hardcoded_dependencies'
      }
    ],
    constraints: [
      {
        type: 'required',
        pattern: '__init__.*dependency|constructor.*dependency',
        message: 'Hardcoded dependencies detected. Use dependency injection for better testability.',
        suggestion: 'Inject dependencies through constructor parameters instead of creating them internally'
      }
    ],
    examples: {
      bad: `class UserService:
    def __init__(self):
        self.db = PostgresDatabase("localhost:5432")  # Hardcoded!
        self.cache = RedisCache("localhost:6379")     # Untestable!
        
    def create_user(self, data):
        # Impossible to test without real database
        return self.db.save(data)`,
      good: `class UserService:
    def __init__(self, database, cache):  # Injected!
        self.db = database
        self.cache = cache
        
    def create_user(self, data):
        # Easy to test with mock dependencies
        return self.db.save(data)
        
# Usage with real dependencies
service = UserService(
    database=PostgresDatabase("localhost:5432"),
    cache=RedisCache("localhost:6379")
)`,
      explanation: 'Dependency injection makes code testable and flexible by allowing different implementations.'
    }
  },

  {
    name: 'prefer-early-returns',
    category: 'universal',
    description: 'Use guard clauses instead of nested if-else pyramids',
    version: '1.0.0',
    severity: 'info',
    triggers: [
      {
        type: 'regex',
        pattern: 'if.*:\\s*\\n\\s*if.*:\\s*\\n\\s*if',
        context: 'nested_conditions'
      }
    ],
    constraints: [
      {
        type: 'required',
        pattern: 'return|raise|continue|break',
        message: 'Deep nesting detected. Consider using early returns or guard clauses.',
        suggestion: 'Use early returns to reduce nesting and improve readability'
      }
    ],
    examples: {
      bad: `def process_user(user):
    if user is not None:
        if user.is_active:
            if user.has_permission:
                if user.is_verified:
                    # Deeply nested logic
                    return user.process()
                else:
                    return "User not verified"
            else:
                return "No permission"
        else:
            return "User inactive"
    else:
        return "User not found"`,
      good: `def process_user(user):
    # Guard clauses - early returns
    if user is None:
        return "User not found"
        
    if not user.is_active:
        return "User inactive"
        
    if not user.has_permission:
        return "No permission"
        
    if not user.is_verified:
        return "User not verified"
        
    # Main logic at the same level
    return user.process()`,
      explanation: 'Early returns reduce nesting, making code easier to read and understand.'
    }
  }
]

// Count methods in a class for god-class detection
export function countMethodsInClass(code: string): number {
  const methodPatterns = [
    /def\s+\w+\s*\(/g,        // Python methods
    /function\s+\w+\s*\(/g,   // JavaScript functions
    /\w+\s*\([^)]*\)\s*{/g,   // JavaScript methods (arrow functions)
  ]
  
  let maxCount = 0
  for (const pattern of methodPatterns) {
    const matches = code.match(pattern)
    if (matches) {
      maxCount = Math.max(maxCount, matches.length)
    }
  }
  
  return maxCount
}

// Detect SQL injection patterns
export function detectSQLInjection(code: string): boolean {
  const dangerousPatterns = [
    /f".*SELECT.*{.*}.*"/g,           // Python f-strings
    /`SELECT.*\$\{.*\}.*`/g,          // JavaScript template literals
    /"SELECT.*"\s*\+/g,               // String concatenation
    /'SELECT.*'\s*\+/g,               // Single quote concatenation
  ]
  
  return dangerousPatterns.some(pattern => pattern.test(code))
}

// Detect hardcoded dependencies
export function detectHardcodedDependencies(code: string): boolean {
  const hardcodedPatterns = [
    /new\s+(Database|Redis|HttpClient|API)\(/g,
    /(Database|Redis|HttpClient|API)\(/g,
  ]
  
  return hardcodedPatterns.some(pattern => pattern.test(code))
}

// Detect deep nesting (3+ levels)
export function detectDeepNesting(code: string): boolean {
  const lines = code.split('\n')
  let maxIndentLevel = 0
  
  for (const line of lines) {
    const indentMatch = line.match(/^(\s*)/)
    if (indentMatch) {
      const indentLevel = Math.floor(indentMatch[1].length / 4) // Assuming 4-space indents
      maxIndentLevel = Math.max(maxIndentLevel, indentLevel)
    }
  }
  
  return maxIndentLevel >= 3
}