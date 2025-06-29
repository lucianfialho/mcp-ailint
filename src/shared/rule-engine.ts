import { Rule, Violation } from './types.js';
import { GitHubApiClient } from '../lib/github-api.js';
import { RuleParser } from './rule-parser.js';
import { GitHubAPIError, RuleLoadError } from './errors.js';

export class RuleEngine {
  private universalRules: Rule[] = [
    {
      id: 'avoid-god-classes',
      name: 'avoid-god-classes',
      description: 'Classes should not have too many methods (SRP)',
      category: 'architecture',
      severity: 'warning',
      pattern: /class\s+\w+\s*{[^}]*(?:function|method|\w+\s*\([^)]*\)\s*{)[^}]*}/g,
      explanation: 'Large classes violate Single Responsibility Principle',
      suggestion: 'Split class into smaller, focused classes'
    },
    {
      id: 'no-sql-injection',
      name: 'no-sql-injection',
      description: 'Prevent SQL injection vulnerabilities',
      category: 'security',
      severity: 'error',
      pattern: /(query|sql)\s*=\s*["'`][^"'`]*\$\{[^}]+\}[^"'`]*["'`]/gi,
      explanation: 'String interpolation in SQL queries allows injection attacks',
      suggestion: 'Use parameterized queries instead'
    },
    {
      id: 'prefer-early-returns',
      name: 'prefer-early-returns',
      description: 'Reduce nesting with guard clauses',
      category: 'quality',
      severity: 'info',
      pattern: /if\s*\([^)]+\)\s*{\s*if\s*\([^)]+\)\s*{\s*if\s*\([^)]+\)/g,
      explanation: 'Deep nesting reduces readability',
      suggestion: 'Use early returns and guard clauses'
    }
  ];

  private githubApiClient: GitHubApiClient;

  constructor() {
    this.githubApiClient = new GitHubApiClient();
  }

  public getUniversalRules(): Rule[] {
    return [...this.universalRules];
  }

  async loadRules(rulesets: string[]): Promise<Rule[]> {
    // Start with universal rules
    let rules = [...this.universalRules];
    
    // Load additional rulesets (GitHub API integration would go here)
    for (const ruleset of rulesets) {
            // console.error(`Processing ruleset: ${ruleset}`);
      if (ruleset === 'universal') {
        try {
          // Always try to fetch updated rules from GitHub first
          const additionalRules = await this.loadRulesetFromGitHub(ruleset);
          rules = [...rules, ...additionalRules];
          console.error(`✅ Loaded ${additionalRules.length} rules from GitHub for ${ruleset}`);
        } catch (error) {
          // Only fallback to local rules if GitHub fails
          console.error(`⚠️ GitHub unavailable for ${ruleset}, using local rules as fallback`);
          // TEMPORARY: Simulate GitHub rules for testing
          const simulatedGitHubRules = this.getSimulatedGitHubRules();
          rules = [...rules, ...simulatedGitHubRules];
          console.error(`✅ Using ${simulatedGitHubRules.length} simulated GitHub rules for testing`);
          // Local universal rules are already included at the beginning
        }
        continue;
      }
      try {
        const additionalRules = await this.loadRulesetFromGitHub(ruleset);
        rules = [...rules, ...additionalRules];
      } catch (error) {
                // console.error(`Failed to load ruleset ${ruleset}:`, error);
        // Depending on strategy, might re-throw or continue with partial rules
        if (error instanceof GitHubAPIError || error instanceof RuleLoadError) {
          throw error; // Re-throw specific errors for degradation manager
        } else {
          throw new RuleLoadError(`Unknown error loading ruleset ${ruleset}`, ruleset, 'github', error as Error);
        }
      }
    }
    
    // Resolve conflicts and return
    return this.resolveConflicts(rules);
  }

  applyRules(code: string, rules: Rule[]): Violation[] {
    const violations: Violation[] = [];
    
    for (const rule of rules) {
      const matches = this.findMatches(code, rule.pattern);
      
      for (const match of matches) {
        violations.push({
          type: rule.category as any,
          severity: rule.severity,
          line: this.getLineNumber(code, match.index),
          message: rule.description,
          suggestion: rule.suggestion,
          explanation: rule.explanation
        });
      }
    }
    
    return violations;
  }

  resolveConflicts(rules: Rule[]): Rule[] {
    // Remove duplicate rules by name
    const ruleMap = new Map<string, Rule>();
    
    for (const rule of rules) {
      if (!ruleMap.has(rule.name) || rule.severity === 'error') {
        ruleMap.set(rule.name, rule);
      }
    }
    
    return Array.from(ruleMap.values());
  }

  private async loadRulesetFromGitHub(ruleset: string): Promise<Rule[]> {
    const owner = 'lucianfialho';
    const repo = 'ailint'; 
    const path = `rules/${ruleset}`;

    try {
      console.error(` Loading ruleset: ${ruleset} from path: ${path}`); // DEBUG
      
      const contents = await this.githubApiClient.getRepoDirContents(owner, repo, path);
      console.error(` Directory contents:`, contents.length, 'items'); // DEBUG
      
      const ruleFiles = contents.filter(item => item.type === 'file' && item.name.endsWith('.mdc'));
      console.error(` Rule files found:`, ruleFiles.length); // DEBUG
      console.error(` Rule files names:`, ruleFiles.map(f => f.name)); // DEBUG

      if (ruleFiles.length === 0) {
        console.error(`⚠️ No .mdc files found in ${path}`);
        return [];
      }

      const fetchedFiles = await Promise.all(ruleFiles.map(async (file: any) => {
        console.error(` Fetching file: ${file.name}`); // DEBUG
        const fileContent = await this.githubApiClient.getRepoFileContent(owner, repo, file.path);
        console.error(` File ${file.name} size: ${fileContent.length} chars`); // DEBUG
        return { filename: file.name, content: fileContent };
      }));

      console.error(` Total files fetched: ${fetchedFiles.length}`); // DEBUG
      
      const parsedRules = RuleParser.parseBatch(fetchedFiles);
      console.error(`⚙️ Parsed rules: ${parsedRules.length}`); // DEBUG
      
      return parsedRules;
    } catch (error) {
      console.error(`❌ loadRulesetFromGitHub error:`, error); // DEBUG
      throw new RuleLoadError(
        `Failed to fetch or parse ruleset ${ruleset} from GitHub`,
        ruleset,
        'github',
        error as Error
      );
    }
  }

  private findMatches(code: string, pattern: string | RegExp): Array<{ index: number; match: string }> {
    const matches: Array<{ index: number; match: string }> = [];
    
    if (typeof pattern === 'string') {
      let index = code.indexOf(pattern);
      while (index !== -1) {
        matches.push({ index, match: pattern });
        index = code.indexOf(pattern, index + 1);
      }
    } else {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(code)) !== null) {
        matches.push({ index: match.index, match: match[0] });
        if (!regex.global) break;
      }
    }
    
    return matches;
  }

  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

  private getSimulatedGitHubRules(): Rule[] {
    return [
      {
        id: 'meaningful-variable-names',
        name: 'meaningful-variable-names',
        description: 'Variables should have descriptive names',
        category: 'quality',
        severity: 'info',
        pattern: /\b(data|result|response|info|temp|obj|val|item)\s*=/g,
        explanation: 'Generic variable names reduce code readability',
        suggestion: 'Use descriptive names that explain the variable purpose'
      },
      {
        id: 'descriptive-function-names',
        name: 'descriptive-function-names', 
        description: 'Functions should have intention-revealing names',
        category: 'quality',
        severity: 'info',
        pattern: /function\s+(process|handle|update|get|set|manage|do)\s*\(/g,
        explanation: 'Generic function names make code unclear',
        suggestion: 'Use names that describe what the function actually does'
      }
    ];
  }
}