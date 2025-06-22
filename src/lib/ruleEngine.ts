import { Rule, Violation, TriggerPattern, Constraint } from './types.js'

export class RuleEngine {
  
  /**
   * Apply a rule to code and detect violations
   */
  applyRule(code: string, rule: Rule, language?: string): Violation[] {
    const violations: Violation[] = []

    // Use specific detection methods for known rules
    switch (rule.name) {
      case 'avoid-god-classes':
        violations.push(...this.checkGodClassesImproved(code, rule))
        break
        
      case 'secure-by-default':
        violations.push(...this.checkSQLInjectionImproved(code, rule))
        break
        
      case 'dependency-injection':
        violations.push(...this.checkDependencyInjectionImproved(code, rule))
        break
        
      case 'prefer-early-returns':
        violations.push(...this.checkDeepNestingImproved(code, rule))
        break
        
      default:
        // Generic pattern matching for dynamic rules from GitHub
        violations.push(...this.applyGenericRule(code, rule))
    }

    return violations
  }

  /**
   * Improved God Class detection - analyze each class individually
   */
  private checkGodClassesImproved(code: string, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    // Find all class definitions
    const classRegex = /class\s+(\w+)[\s\S]*?(?=class\s+\w+|$)/g
    let match
    
    while ((match = classRegex.exec(code)) !== null) {
      const className = match[1]
      const classCode = match[0]
      
      // Count methods in this specific class
      const methodCount = this.countMethodsInClass(classCode)
      
      if (methodCount > 10) {
        const lines = code.substring(0, match.index).split('\n')
        const lineNumber = lines.length
        
        violations.push({
          rule: rule.name,
          category: rule.category,
          severity: rule.severity,
          line: lineNumber,
          message: `Class "${className}" has ${methodCount} methods, exceeds recommended limit of 10. This violates Single Responsibility Principle.`,
          suggestion: `Split class "${className}" into smaller, focused classes. Consider extracting related methods into separate classes.`,
          example: rule.examples
        })
      }
    }

    return violations
  }

  /**
   * Improved SQL injection detection - support more SQL operations
   */
  private checkSQLInjectionImproved(code: string, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    // Enhanced patterns for different SQL operations
    const dangerousPatterns = [
      // Python f-strings
      /f".*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*{.*}.*"/gi,
      // JavaScript template literals
      /`.*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*\$\{.*\}.*`/gi,
      // String concatenation
      /".*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*"\s*\+/gi,
      /'.*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*'\s*\+/gi,
      // String formatting
      /".*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*"\s*%/gi,
      // .format() calls
      /".*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*"\.format\(/gi
    ]
    
    const lines = code.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(line)) {
          violations.push({
            rule: rule.name,
            category: rule.category,
            severity: rule.severity,
            line: i + 1,
            message: 'SQL injection vulnerability detected! Never use string interpolation for SQL queries.',
            suggestion: 'Use parameterized queries with placeholders (?, %s) to prevent SQL injection attacks.',
            example: rule.examples
          })
          break // Only report once per line
        }
      }
    }

    return violations
  }

  /**
   * Improved dependency injection detection
   */
  private checkDependencyInjectionImproved(code: string, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    // Look for hardcoded instantiations inside constructors/init methods
    const constructorRegex = /(?:def __init__|constructor|function\s+\w+)\s*\([^)]*\)\s*[:{]([^}]*)/g
    let match
    
    while ((match = constructorRegex.exec(code)) !== null) {
      const constructorBody = match[1]
      
      // Check for hardcoded dependencies
      const hardcodedPatterns = [
        /new\s+(Database|Redis|HttpClient|EmailService|Logger|Cache)\(/g,
        /(Database|Redis|HttpClient|EmailService|Logger|Cache)\(/g,
        /self\.\w+\s*=\s*(Database|Redis|HttpClient|EmailService|Logger|Cache)\(/g
      ]
      
      for (const pattern of hardcodedPatterns) {
        if (pattern.test(constructorBody)) {
          const lines = code.substring(0, match.index).split('\n')
          const lineNumber = lines.length
          
          violations.push({
            rule: rule.name,
            category: rule.category,
            severity: rule.severity,
            line: lineNumber,
            message: 'Hardcoded dependencies detected. This makes testing difficult and violates Dependency Inversion Principle.',
            suggestion: 'Inject dependencies through constructor parameters instead of creating them internally. This enables testing with mock objects.',
            example: rule.examples
          })
          break
        }
      }
    }

    return violations
  }

  /**
   * Improved deep nesting detection - more intelligent analysis
   */
  private checkDeepNestingImproved(code: string, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    const lines = code.split('\n')
    let maxNestingInFunction = 0
    let currentFunction = ''
    let functionStartLine = 0
    let currentNesting = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()
      
      // Detect function/method start
      if (/(?:def\s+\w+|function\s+\w+|\w+\s*\([^)]*\)\s*[:{])/.test(trimmedLine)) {
        // Reset for new function
        if (maxNestingInFunction >= 4) {
          violations.push({
            rule: rule.name,
            category: rule.category,
            severity: rule.severity,
            line: functionStartLine,
            message: `Function "${currentFunction}" has deep nesting (${maxNestingInFunction} levels). This reduces readability and increases complexity.`,
            suggestion: 'Use guard clauses and early returns to reduce nesting. Check for error conditions first, then handle the main logic.',
            example: rule.examples
          })
        }
        
        maxNestingInFunction = 0
        currentNesting = 0
        functionStartLine = i + 1
        
        const funcMatch = trimmedLine.match(/(?:def\s+(\w+)|function\s+(\w+)|(\w+)\s*\()/)
        currentFunction = funcMatch ? (funcMatch[1] || funcMatch[2] || funcMatch[3]) : 'anonymous'
      }
      
      // Calculate indentation level (assuming 4-space or 2-space indents)
      const indentMatch = line.match(/^(\s*)/)
      if (indentMatch) {
        const spaces = indentMatch[1].length
        const indentLevel = Math.floor(spaces / (spaces >= 4 ? 4 : 2))
        
        // Only count if inside control structures
        if (/(?:if\s|for\s|while\s|try\s|with\s|switch\s)/.test(trimmedLine)) {
          currentNesting = indentLevel + 1
          maxNestingInFunction = Math.max(maxNestingInFunction, currentNesting)
        }
      }
    }
    
    // Check the last function
    if (maxNestingInFunction >= 4) {
      violations.push({
        rule: rule.name,
        category: rule.category,
        severity: rule.severity,
        line: functionStartLine,
        message: `Function "${currentFunction}" has deep nesting (${maxNestingInFunction} levels). This reduces readability and increases complexity.`,
        suggestion: 'Use guard clauses and early returns to reduce nesting. Check for error conditions first, then handle the main logic.',
        example: rule.examples
      })
    }

    return violations
  }

  /**
   * Generic rule application for dynamic GitHub rules
   */
  private applyGenericRule(code: string, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    for (const trigger of rule.triggers) {
      const triggerViolations = this.processTrigger(code, trigger, rule)
      violations.push(...triggerViolations)
    }

    return violations
  }

  /**
   * Process a single trigger pattern
   */
  private processTrigger(code: string, trigger: TriggerPattern, rule: Rule): Violation[] {
    const violations: Violation[] = []

    switch (trigger.type) {
      case 'regex':
        violations.push(...this.processRegexTrigger(code, trigger, rule))
        break
        
      case 'keyword':
        violations.push(...this.processKeywordTrigger(code, trigger, rule))
        break
        
      case 'ast':
        // Future: AST-based analysis
        console.warn('AST triggers not yet implemented')
        break
    }

    return violations
  }

  /**
   * Process regex-based triggers
   */
  private processRegexTrigger(code: string, trigger: TriggerPattern, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    try {
      const pattern = new RegExp(trigger.pattern, 'gm')
      const lines = code.split('\n')
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        
        if (pattern.test(line)) {
          violations.push({
            rule: rule.name,
            category: rule.category,
            severity: rule.severity,
            line: i + 1,
            message: rule.description,
            suggestion: rule.constraints[0]?.message || 'Consider refactoring this pattern.',
            example: rule.examples
          })
        }
      }
      
    } catch (error) {
      console.error(`Invalid regex pattern in rule ${rule.name}:`, trigger.pattern)
    }

    return violations
  }

  /**
   * Process keyword-based triggers
   */
  private processKeywordTrigger(code: string, trigger: TriggerPattern, rule: Rule): Violation[] {
    const violations: Violation[] = []
    
    const keywords = trigger.pattern.split('|').map(k => k.trim())
    const lines = code.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      
      for (const keyword of keywords) {
        if (line.includes(keyword.toLowerCase())) {
          violations.push({
            rule: rule.name,
            category: rule.category,
            severity: rule.severity,
            line: i + 1,
            message: rule.description,
            suggestion: rule.constraints[0]?.message || 'Consider refactoring this pattern.',
            example: rule.examples
          })
          break
        }
      }
    }

    return violations
  }

  /**
   * Count methods in a specific class (improved accuracy)
   */
  private countMethodsInClass(classCode: string): number {
    // More precise method counting
    const methodPatterns = [
      /def\s+\w+\s*\(/g,        // Python methods
      /\w+\s*\([^)]*\)\s*{/g,   // JavaScript/TypeScript methods
      /function\s+\w+\s*\(/g,   // JavaScript functions
      /(?:public|private|protected)?\s*\w+\s*\([^)]*\)\s*{/g // Java/C# methods
    ]
    
    let maxCount = 0
    
    for (const pattern of methodPatterns) {
      const matches = classCode.match(pattern)
      if (matches) {
        // Filter out constructor/special methods
        const filteredMatches = matches.filter(match => 
          !match.includes('__init__') && 
          !match.includes('constructor') &&
          !match.includes('__') // Python magic methods
        )
        maxCount = Math.max(maxCount, filteredMatches.length)
      }
    }
    
    return maxCount
  }
}

// Export to make this a proper module  
export {}