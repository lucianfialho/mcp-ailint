// src/lib/analyzer.ts - Fixed CodeAnalyzer
import { GitHubRule } from './api.js';

export interface RuleViolation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  suggestion?: string;
}

export interface Suggestion {
  title: string;
  description: string;
  type: 'security' | 'performance' | 'maintainability' | 'style';
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  technicalDebt: 'low' | 'medium' | 'high';
}

export interface AnalysisResult {
  violations: RuleViolation[];
  suggestions: Suggestion[];
  metrics: CodeMetrics;
  rulesApplied: number;
  language: string;
}

export class CodeAnalyzer {
  /**
   * Analyze code using GitHub-sourced rules
   */
  async analyze(
    code: string, 
    rules: GitHubRule[], 
    language?: string, 
    filename?: string
  ): Promise<AnalysisResult> {
    
    // Detect language if not provided
    const detectedLanguage = language || this.detectLanguage(code, filename);
    
    // Apply rules
    const violations: RuleViolation[] = [];
    const suggestions: Suggestion[] = [];
    
    for (const rule of rules) {
      try {
        const ruleViolations = await this.applyRule(code, rule, detectedLanguage);
        violations.push(...ruleViolations);
        
        if (ruleViolations.length > 0) {
          const ruleSuggestions = this.generateSuggestions(code, rule, ruleViolations);
          suggestions.push(...ruleSuggestions);
        }
      } catch (error) {
        console.error(`Failed to apply rule '${rule.name}':`, error);
      }
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(code, violations);
    
    return {
      violations,
      suggestions,
      metrics,
      rulesApplied: rules.length,
      language: detectedLanguage
    };
  }

  /**
   * Apply a single rule to code
   */
  private async applyRule(code: string, rule: GitHubRule, language: string): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];
    
    try {
      // Apply triggers from rule metadata
      for (const trigger of rule.triggers) {
        if (trigger.type === 'regex') {
          const regex = new RegExp(trigger.pattern, 'gm');
          let match;
          
          while ((match = regex.exec(code)) !== null) {
            const line = this.getLineNumber(code, match.index);
            const column = this.getColumnNumber(code, match.index);
            
            violations.push({
              rule: rule.name,
              severity: rule.severity,
              message: rule.description,
              line,
              column,
              suggestion: trigger.suggestion || this.getDefaultSuggestion(rule)
            });
          }
        } else if (trigger.type === 'function-length') {
          const functionViolations = this.checkFunctionLength(code, rule, trigger);
          violations.push(...functionViolations);
        } else if (trigger.type === 'class-methods') {
          const classViolations = this.checkClassMethods(code, rule, trigger);
          violations.push(...classViolations);
        } else if (trigger.type === 'sql-injection') {
          const sqlViolations = this.checkSQLInjection(code, rule);
          violations.push(...sqlViolations);
        }
      }
    } catch (error) {
      console.error(`Error applying rule ${rule.name}:`, error);
    }
    
    return violations;
  }

  /**
   * Check for SQL injection patterns
   */
  private checkSQLInjection(code: string, rule: GitHubRule): RuleViolation[] {
    const violations: RuleViolation[] = [];
    
    // Common SQL injection patterns
    const patterns = [
      /.*query.*=.*f["'].*\{.*\}.*["']/g, // Python f-strings in SQL
      /.*\+.*["'].*SELECT.*FROM.*["']/gi, // String concatenation with SQL
      /.*\$\{.*\}.*SELECT.*FROM/gi, // Template literals with SQL
      /.*query.*=.*["'].*\+.*["']/g // Query concatenation
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const line = this.getLineNumber(code, match.index);
        const column = this.getColumnNumber(code, match.index);
        
        violations.push({
          rule: rule.name,
          severity: 'error',
          message: 'Potential SQL injection vulnerability detected',
          line,
          column,
          suggestion: 'Use parameterized queries instead of string concatenation'
        });
      }
    }
    
    return violations;
  }

  /**
   * Check function length violations
   */
  private checkFunctionLength(code: string, rule: GitHubRule, trigger: any): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxLines = trigger.maxLines || 20;
    
    // Simple function detection patterns for different languages
    const functionPatterns = [
      /function\s+\w+\s*\([^)]*\)\s*\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, // JavaScript
      /def\s+\w+\s*\([^)]*\):\s*\n((?:\s{4,}.*\n)*)/g, // Python
      /(public|private|protected)?\s*\w+\s+\w+\s*\([^)]*\)\s*\{([^{}]*\{[^{}]*\})*[^{}]*\}/g // Java/C#
    ];
    
    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const functionCode = match[0];
        const lineCount = functionCode.split('\n').length;
        
        if (lineCount > maxLines) {
          const line = this.getLineNumber(code, match.index);
          const column = this.getColumnNumber(code, match.index);
          
          violations.push({
            rule: rule.name,
            severity: rule.severity,
            message: `Function is ${lineCount} lines long, exceeds maximum of ${maxLines} lines`,
            line,
            column,
            suggestion: `Consider breaking this function into smaller, more focused functions`
          });
        }
      }
    }
    
    return violations;
  }

  /**
   * Check class method count (God Class detection)
   */
  private checkClassMethods(code: string, rule: GitHubRule, trigger: any): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxMethods = trigger.maxMethods || 10;
    
    // Class detection patterns
    const classPatterns = [
      /class\s+\w+[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g, // JavaScript/TypeScript
      /class\s+\w+[^:]*:[\s\S]*?(?=\n\S|\n$)/g, // Python
      /(public\s+)?class\s+\w+[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g // Java/C#
    ];
    
    for (const pattern of classPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const classBody = match[1] || match[0];
        
        // Count methods in class
        const methodPatterns = [
          /\b\w+\s*\([^)]*\)\s*\{/g, // General method pattern
          /def\s+\w+\s*\(/g, // Python methods
          /(public|private|protected)\s+\w+\s+\w+\s*\(/g // Java/C# methods
        ];
        
        let methodCount = 0;
        for (const methodPattern of methodPatterns) {
          const methods = classBody.match(methodPattern);
          if (methods) methodCount += methods.length;
        }
        
        if (methodCount > maxMethods) {
          const line = this.getLineNumber(code, match.index);
          const column = this.getColumnNumber(code, match.index);
          
          violations.push({
            rule: rule.name,
            severity: rule.severity,
            message: `Class has ${methodCount} methods, exceeds maximum of ${maxMethods} (God Class)`,
            line,
            column,
            suggestion: `Consider splitting this class into smaller, more focused classes following Single Responsibility Principle`
          });
        }
      }
    }
    
    return violations;
  }

  /**
   * Generate suggestions based on rule and violations
   */
  private generateSuggestions(code: string, rule: GitHubRule, violations: RuleViolation[]): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    if (violations.length === 0) return suggestions;
    
    // Generate contextual suggestions based on rule type
    if (rule.name.includes('sql')) {
      suggestions.push({
        title: 'Use Parameterized Queries',
        description: 'Replace string concatenation with parameterized queries to prevent SQL injection',
        type: 'security'
      });
    }
    
    if (rule.name.includes('god-class')) {
      suggestions.push({
        title: 'Apply Single Responsibility Principle',
        description: 'Split large classes into smaller, focused classes with single responsibilities',
        type: 'maintainability'
      });
    }
    
    if (rule.name.includes('function-length')) {
      suggestions.push({
        title: 'Extract Smaller Functions',
        description: 'Break large functions into smaller, testable units',
        type: 'maintainability'
      });
    }
    
    return suggestions;
  }

  /**
   * Calculate code metrics
   */
  private calculateMetrics(code: string, violations: RuleViolation[]): CodeMetrics {
    const lines = code.split('\n');
    const linesOfCode = lines.filter(line => line.trim().length > 0).length;
    
    // Simple complexity calculation
    const complexityPatterns = [
      /if\s*\(/g, /else/g, /while\s*\(/g, /for\s*\(/g, 
      /catch\s*\(/g, /case\s+/g, /&&/g, /\|\|/g
    ];
    
    let complexity = 1; // Base complexity
    for (const pattern of complexityPatterns) {
      const matches = code.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    // Normalize complexity (0-10 scale)
    const normalizedComplexity = Math.min(10, Math.max(1, Math.round(complexity / linesOfCode * 100)));
    
    // Calculate maintainability index
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    
    const maintainabilityIndex = Math.max(0, Math.min(100, 
      100 - (errorCount * 15) - (warningCount * 5) - (normalizedComplexity * 2)
    ));
    
    // Determine technical debt
    const technicalDebt: 'low' | 'medium' | 'high' = 
      maintainabilityIndex > 70 ? 'low' :
      maintainabilityIndex > 40 ? 'medium' : 'high';
    
    return {
      linesOfCode,
      complexity: normalizedComplexity,
      maintainabilityIndex,
      technicalDebt
    };
  }

  /**
   * Detect programming language from code content and filename
   */
  private detectLanguage(code: string, filename?: string): string {
    // Try filename extension first
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      const extensionMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript', 
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'cs': 'csharp',
        'cpp': 'cpp',
        'c': 'c',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust'
      };
      
      if (ext && extensionMap[ext]) {
        return extensionMap[ext];
      }
    }
    
    // Analyze code patterns
    if (/import\s+.*from|export\s+.*\{|const\s+.*=/i.test(code)) {
      return code.includes('interface ') || code.includes(': string') ? 'typescript' : 'javascript';
    }
    if (/def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import/i.test(code)) {
      return 'python';
    }
    if (/public\s+class|private\s+\w+|System\.out\.println/i.test(code)) {
      return 'java';
    }
    if (/using\s+System|namespace\s+\w+|Console\.WriteLine/i.test(code)) {
      return 'csharp';
    }
    
    return 'unknown';
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

  /**
   * Get column number from character index
   */
  private getColumnNumber(code: string, index: number): number {
    const lines = code.substring(0, index).split('\n');
    return lines[lines.length - 1].length + 1;
  }

  /**
   * Get default suggestion for a rule
   */
  private getDefaultSuggestion(rule: GitHubRule): string {
    const defaultSuggestions: Record<string, string> = {
      'avoid-god-classes': 'Consider splitting this class into smaller, focused classes',
      'secure-by-default': 'Follow security best practices for this code pattern',
      'dependency-injection': 'Use dependency injection instead of hardcoded dependencies',
      'prefer-early-returns': 'Use guard clauses and early returns to reduce nesting'
    };
    
    return defaultSuggestions[rule.name] || 'Consider refactoring this code for better quality';
  }
}