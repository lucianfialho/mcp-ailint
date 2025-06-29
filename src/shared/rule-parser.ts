import { Rule } from './types.js';

export class RuleParser {
  /**
   * Parse multiple rule files in batch
   */
  static parseBatch(files: { filename: string; content: string }[]): Rule[] {
    console.error(`🔧 RuleParser.parseBatch called with ${files.length} files`);
    
    const rules: Rule[] = [];
    
    for (const file of files) {
      try {
        console.error(`🔧 Parsing file: ${file.filename}`);
        const rule = this.parseRule(file.filename, file.content);
        if (rule) {
          rules.push(rule);
          console.error(`✅ Successfully parsed: ${file.filename} -> ${rule.name}`);
        } else {
          console.error(`⚠️ Failed to parse: ${file.filename} (returned null)`);
        }
      } catch (error) {
        console.error(`❌ Failed to parse ${file.filename}:`, error);
      }
    }
    
    console.error(`🔧 RuleParser.parseBatch returning ${rules.length} rules`);
    return rules;
  }

  /**
   * Parse a single rule file with MDC format (Markdown + YAML frontmatter)
   */
  static parseRule(filename: string, content: string): Rule | null {
    try {
      // Extract YAML frontmatter
      const lines = content.split('\n');
      if (lines[0] !== '---') {
        console.error(`❌ ${filename}: No YAML frontmatter found`);
        return null;
      }
      
      const endIndex = lines.findIndex((line, index) => index > 0 && line === '---');
      if (endIndex === -1) {
        console.error(`❌ ${filename}: YAML frontmatter not closed`);
        return null;
      }
      
      const yamlContent = lines.slice(1, endIndex).join('\n');
      const markdownContent = lines.slice(endIndex + 1).join('\n');
      
      // Parse YAML fields with multiple fallback strategies
      const nameMatch = yamlContent.match(/^name:\s*["']?([^"'\n\r]+?)["']?\s*$/m);
      
      // Try multiple description field formats
      let descMatch = yamlContent.match(/^description:\s*["']?([^"'\n\r]+?)["']?\s*$/m);
      if (!descMatch) {
        // Try quoted description
        descMatch = yamlContent.match(/^description:\s*["']([^"']+)["']/m);
      }
      if (!descMatch) {
        // Try multiline description
        const multilineDesc = yamlContent.match(/^description:\s*(.+?)(?=^\w+:|$)/ms);
        if (multilineDesc) {
          const cleanDesc = multilineDesc[1].replace(/\n\s*/g, ' ').trim();
          descMatch = ['', cleanDesc] as RegExpMatchArray;
        }
      }
      if (!descMatch) {
        // Extract from H1 in markdown if no YAML description
        const h1Match = markdownContent.match(/^#\s+(.+)$/m);
        if (h1Match) {
          descMatch = ['', h1Match[1]] as RegExpMatchArray;
          console.error(`📝 ${filename}: Using H1 as description: "${h1Match[1]}"`);
        }
      }
      if (!descMatch) {
        // Use filename as ultimate fallback
        const baseName = filename.replace('.mdc', '').replace(/-/g, ' ');
        descMatch = ['', `Rule for ${baseName}`] as RegExpMatchArray;
        console.error(`📝 ${filename}: Using filename as description fallback`);
      }
      
      const categoryMatch = yamlContent.match(/^category:\s*["']?([^"'\n\r]+?)["']?\s*$/m);
      const severityMatch = yamlContent.match(/^severity:\s*["']?([^"'\n\r]+?)["']?\s*$/m);
      
      if (!nameMatch) {
        console.error(`❌ ${filename}: No name field found in YAML`);
        return null;
      }
      
      // Clean extracted values
      const cleanName = nameMatch[1].trim();
      const cleanDesc = (descMatch?.[1] || 'No description available').trim();
      const cleanCategory = categoryMatch?.[1]?.trim() || 'universal';
      const cleanSeverity = severityMatch?.[1]?.trim() || 'info';
      
      // Map category to valid violation type
      const violationType = this.mapCategoryToType(cleanCategory);
      
      // Validate name
      if (!cleanName || cleanName.includes('\n') || cleanName.includes('"')) {
        console.error(`❌ ${filename}: Invalid name "${cleanName}"`);
        return null;
      }
      
      console.error(`✅ ${filename}: Parsed name="${cleanName}", desc="${cleanDesc.substring(0, 50)}..."`);
      
      // Extract pattern with safe fallbacks
      const pattern = this.extractPattern(yamlContent, cleanName);
      const explanation = this.extractExplanation(yamlContent, markdownContent, cleanName);
      const suggestion = this.extractSuggestion(yamlContent, markdownContent, cleanName);
      
      return {
        id: cleanName,
        name: cleanName,
        description: cleanDesc,
        category: violationType, // Use mapped type instead of original category
        severity: cleanSeverity as any,
        pattern: pattern,
        explanation: explanation,
        suggestion: suggestion
      };
      
    } catch (error) {
      console.error(`❌ ${filename}: Parse error:`, error);
      return null;
    }
  }

  /**
   * Map category to valid violation type
   */
  private static mapCategoryToType(category: string): 'security' | 'quality' | 'architecture' {
    const categoryMap: { [key: string]: 'security' | 'quality' | 'architecture' } = {
      'universal': 'quality',
      'security': 'security', 
      'architecture': 'architecture',
      'quality': 'quality',
      'performance': 'quality',
      'maintainability': 'quality',
      'readability': 'quality'
    };
    
    return categoryMap[category] || 'quality';
  }

  /**
   * Extract regex pattern with safe fallbacks
   */
  private static extractPattern(yamlContent: string, ruleName: string): RegExp {
    // Predefined patterns for known rules
    const knownPatterns: { [key: string]: RegExp } = {
      'meaningful-variable-names': /\b(data|result|response|info|temp|obj|val|item)\s*=/g,
      'descriptive-function-names': /function\s+(process|handle|update|get|set|manage|do)\s*\(/g,
      'explicit-error-messages': /throw\s+new\s+Error\s*\(\s*["'](Error|Invalid|Failed|Bad)["']\s*\)/g,
      'avoid-god-classes': /class\s+\w+\s*{[^}]*(?:function|method|\w+\s*\([^)]*\)\s*{)[^}]*}/g,
      'prefer-early-returns': /if\s*\([^)]+\)\s*{\s*if\s*\([^)]+\)\s*{\s*if\s*\([^)]+\)/g,
      'composition-over-inheritance': /class\s+\w+\s*(?:extends|:)\s*\w+/g,
      'secure-by-default': /(query|sql)\s*=\s*["'`][^"'`]*\$\{[^}]+\}[^"'`]*["'`]/gi,
      'conventional-commits': /git\s+commit\s+-m\s*["'](fix|update|change|misc)/gi,
      'promise-patterns': /(sleep\(|time\.sleep|Thread\.sleep)/g,
      'dependency-injection': /new\s+\w+\s*\(\s*["'][^"']*["']\s*\)/g
    };
    
    // Use predefined pattern if available
    const predefinedPattern = knownPatterns[ruleName];
    if (predefinedPattern) {
      console.error(`🔧 ${ruleName}: Using predefined pattern`);
      return predefinedPattern;
    }
    
    // Try to extract pattern from YAML
    try {
      const patternMatch = yamlContent.match(/pattern:\s*["']([^"']+)["']/);
      if (patternMatch) {
        const regexPattern = new RegExp(patternMatch[1], 'g');
        console.error(`🔧 ${ruleName}: Using YAML pattern`);
        return regexPattern;
      }
    } catch (e) {
      console.error(`⚠️ ${ruleName}: Invalid regex in YAML, using fallback`);
    }
    
    // Try to extract from triggers section
    try {
      const triggersMatch = yamlContent.match(/triggers:\s*\n([\s\S]*?)(?=\n\w+:|$)/);
      if (triggersMatch) {
        const triggers = triggersMatch[1];
        const regexTrigger = triggers.match(/pattern:\s*["']([^"']+)["']/);
        if (regexTrigger) {
          const regexPattern = new RegExp(regexTrigger[1], 'g');
          console.error(`🔧 ${ruleName}: Using triggers pattern`);
          return regexPattern;
        }
      }
    } catch (e) {
      console.error(`⚠️ ${ruleName}: Invalid triggers pattern, using fallback`);
    }
    
    // Safe fallback pattern
    console.error(`🔧 ${ruleName}: Using safe fallback pattern`);
    return /\b(todo|fixme|hack)\b/gi;
  }

  /**
   * Extract explanation from YAML or markdown content
   */
  private static extractExplanation(yamlContent: string, markdownContent: string, ruleName: string): string {
    // Try YAML explanation field
    const yamlExplanation = yamlContent.match(/explanation:\s*["']?([^"'\n]+)["']?/);
    if (yamlExplanation) {
      return yamlExplanation[1];
    }
    
    // Try AI limitation section
    const limitationMatch = markdownContent.match(/## 🚫 AI Limitation Resolved\s*\n\s*\*\*Problem\*\*:\s*([^*]+)/);
    if (limitationMatch) {
      return limitationMatch[1].trim();
    }
    
    // Try general rule purpose
    const purposeMatch = markdownContent.match(/## 🎯 Rule Purpose\s*\n\s*\*\*([^*]+)\*\*/);
    if (purposeMatch) {
      return purposeMatch[1].trim();
    }
    
    // Default explanation
    return `This rule helps improve code quality by enforcing ${ruleName.replace(/-/g, ' ')} patterns.`;
  }

  /**
   * Extract suggestion from YAML or markdown content
   */
  private static extractSuggestion(yamlContent: string, markdownContent: string, ruleName: string): string {
    // Try YAML suggestion field
    const yamlSuggestion = yamlContent.match(/suggestion:\s*["']?([^"'\n]+)["']?/);
    if (yamlSuggestion) {
      return yamlSuggestion[1];
    }
    
    // Try to find fix/solution in markdown
    const fixMatch = markdownContent.match(/\*\*Fix:\*\*\s*([^\n]+)/);
    if (fixMatch) {
      return fixMatch[1].trim();
    }
    
    // Try expected results section
    const resultsMatch = markdownContent.match(/After applying this rule[^:]*:\s*\n\s*- ✅ ([^\n]+)/);
    if (resultsMatch) {
      return resultsMatch[1].trim();
    }
    
    // Default suggestion based on rule name
    const suggestions: { [key: string]: string } = {
      'meaningful-variable-names': 'Use descriptive variable names that explain their purpose',
      'descriptive-function-names': 'Use function names that clearly describe what they do',
      'explicit-error-messages': 'Provide specific error messages with context and solutions',
      'avoid-god-classes': 'Break large classes into smaller, focused classes with single responsibilities',
      'prefer-early-returns': 'Use guard clauses and early returns to reduce nesting',
      'composition-over-inheritance': 'Prefer composition and dependency injection over inheritance',
      'secure-by-default': 'Use parameterized queries and secure coding practices',
      'conventional-commits': 'Follow conventional commit format: type(scope): description',
      'promise-patterns': 'Use async/await patterns and concurrent execution for better performance',
      'dependency-injection': 'Inject dependencies through constructors or parameters'
    };
    
    return suggestions[ruleName] || `Follow ${ruleName.replace(/-/g, ' ')} best practices`;
  }

  /**
   * Validate that a rule object is properly formed
   */
  static validateRule(rule: Rule): boolean {
    if (!rule.id || !rule.name || !rule.description) {
      return false;
    }
    
    if (!rule.pattern || !(rule.pattern instanceof RegExp)) {
      return false;
    }
    
    const validSeverities = ['error', 'warning', 'info'];
    if (!validSeverities.includes(rule.severity)) {
      return false;
    }
    
    return true;
  }
}