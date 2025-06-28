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
        // Universal rules are embedded, no need to fetch from GitHub
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
    const owner = 'lucianfialho'; // Correct owner
    const repo = 'ailint'; // Correct repository
    const path = `rules/${ruleset}`;

    try {
      const contents = await this.githubApiClient.getRepoDirContents(owner, repo, path);
      const ruleFiles = contents.filter(item => item.type === 'file' && item.name.endsWith('.mdc'));

      const fetchedFiles = await Promise.all(ruleFiles.map(async (file: any) => {
        const fileContent = await this.githubApiClient.getRepoFileContent(owner, repo, file.path);
        return { filename: file.name, content: fileContent };
      }));

      return RuleParser.parseBatch(fetchedFiles);
    } catch (error) {
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
}
