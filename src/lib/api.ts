// src/lib/api.ts - Complete GitHub API Implementation
import * as yaml from 'js-yaml';

export interface GitHubRule {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  severity: 'error' | 'warning' | 'info';
  content: string;
  triggers: any[];
  examples: any[];
  metadata?: any;
}

export interface GitHubAPIResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content?: string;
  encoding?: string;
}

class GitHubRuleClient {
  private baseUrl = 'https://api.github.com/repos/lucianfialho/ailint/contents';
  private cache = new Map<string, any>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  /**
   * Get available rule categories from GitHub repository
   */
  async getAvailableRuleCategories(): Promise<string[]> {
    const cacheKey = 'categories';
    
    if (this.isValidCache(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      console.error('📡 Fetching available categories from GitHub...');
      const response = await fetch(`${this.baseUrl}/rules`);
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data: GitHubAPIResponse[] = await response.json();
      
      // Filter only directories
      const categories = data
        .filter(item => item.type === 'dir')
        .map(item => item.name)
        .sort();

      console.error(`✅ Found ${categories.length} categories: ${categories.join(', ')}`);
      
      this.setCache(cacheKey, categories);
      return categories;

    } catch (error) {
      console.error('❌ Failed to fetch categories from GitHub:', error);
      return [];
    }
  }

  /**
   * Get all rules from a specific category
   */
  async getRulesFromCategory(category: string): Promise<GitHubRule[]> {
    const cacheKey = `rules:${category}`;
    
    if (this.isValidCache(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      console.error(`📥 Downloading ${category} rules from GitHub...`);
      const response = await fetch(`${this.baseUrl}/rules/${category}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error(`⚠️ Category '${category}' not found in repository`);
          return [];
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const files: GitHubAPIResponse[] = await response.json();
      
      // Filter only .mdc files
      const mdcFiles = files.filter(file => 
        file.type === 'file' && 
        file.name.endsWith('.mdc')
      );

      if (mdcFiles.length === 0) {
        console.error(`⚠️ No .mdc rule files found in category '${category}'`);
        return [];
      }

      console.error(`📄 Found ${mdcFiles.length} rule files in ${category}`);

      // Download and parse each rule file
      const rules: GitHubRule[] = [];
      for (const file of mdcFiles) {
        try {
          const rule = await this.downloadAndParseRule(file, category);
          rules.push(rule);
        } catch (error) {
          console.error(`❌ Failed to parse rule ${file.name}:`, error);
        }
      }

      console.error(`✅ Successfully loaded ${rules.length}/${mdcFiles.length} rules from ${category}`);
      
      this.setCache(cacheKey, rules);
      return rules;

    } catch (error) {
      console.error(`❌ Failed to load rules from category '${category}':`, error);
      return [];
    }
  }

  /**
   * Get rules from multiple categories
   */
  async getRulesFromCategories(categories: string[]): Promise<GitHubRule[]> {
    const allRules: GitHubRule[] = [];
    
    for (const category of categories) {
      try {
        const rules = await this.getRulesFromCategory(category);
        allRules.push(...rules);
      } catch (error) {
        console.error(`❌ Failed to load category '${category}':`, error);
      }
    }
    
    return allRules;
  }

  /**
   * Get universal rules (always loaded)
   */
  async getUniversalRules(): Promise<GitHubRule[]> {
    return this.getRulesFromCategory('universal');
  }

  /**
   * Check if GitHub repository is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/rules`, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Download and parse a single rule file
   */
  private async downloadAndParseRule(file: GitHubAPIResponse, category: string): Promise<GitHubRule> {
    try {
      // Download file content
      const response = await fetch(file.download_url);
      if (!response.ok) {
        throw new Error(`Failed to download ${file.name}: ${response.status}`);
      }

      const content = await response.text();
      
      // Parse MDC format
      return this.parseMDCRule(content, file.name, category);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download/parse ${file.name}: ${errorMessage}`);
    }
  }

  /**
   * Parse MDC rule file (YAML frontmatter + Markdown content)
   */
  private parseMDCRule(content: string, filename: string, category: string): GitHubRule {
    try {
      // Match YAML frontmatter
      const frontmatterMatch = content.match(/^---\s*\n(.*?)\n---\s*\n(.*)$/s);
      
      if (!frontmatterMatch) {
        throw new Error(`Invalid MDC format: missing YAML frontmatter`);
      }

      const [, frontmatterStr, markdownContent] = frontmatterMatch;
      
      // Parse YAML frontmatter
      const frontmatter = yaml.load(frontmatterStr) as any;
      
      if (!frontmatter) {
        throw new Error(`Invalid YAML frontmatter`);
      }

      // Extract rule name from filename or frontmatter
      const ruleName = frontmatter.name || filename.replace('.mdc', '');
      
      // Validate required fields
      if (!frontmatter.description) {
        throw new Error(`Missing required field: description`);
      }

      return {
        name: ruleName,
        description: frontmatter.description,
        category: frontmatter.category || category,
        subcategory: frontmatter.subcategory,
        severity: frontmatter.severity || 'warning',
        content: markdownContent.trim(),
        triggers: frontmatter.triggers || [],
        examples: frontmatter.examples || [],
        metadata: {
          ...frontmatter,
          filename,
          downloadedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse MDC rule ${filename}: ${errorMessage}`);
    }
  }

  /**
   * Cache management
   */
  private isValidCache(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    const now = Date.now();
    return (now - cached.timestamp) < this.cacheExpiry;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    console.error('🗑️ GitHub API cache cleared');
  }
}

// Create singleton instance
const githubClient = new GitHubRuleClient();

// Export convenience functions for backward compatibility
export async function getAvailableRuleCategories(): Promise<string[]> {
  return githubClient.getAvailableRuleCategories();
}

export async function getRules(category: string): Promise<GitHubRule[]> {
  return githubClient.getRulesFromCategory(category);
}

export async function getUniversalRules(): Promise<GitHubRule[]> {
  return githubClient.getUniversalRules();
}

export async function getRulesFromCategories(categories: string[]): Promise<GitHubRule[]> {
  return githubClient.getRulesFromCategories(categories);
}

export async function isGitHubRepositoryAccessible(): Promise<boolean> {
  return githubClient.healthCheck();
}

// Export the client for advanced usage
export { githubClient };

// Additional utility functions
export function formatRuleForDisplay(rule: GitHubRule): string {
  const severityIcon = rule.severity === 'error' ? '🚨' : 
                      rule.severity === 'warning' ? '⚠️' : '💡';
  
  return `${severityIcon} **${rule.name}** (${rule.category})
${rule.description}`;
}

export function groupRulesByCategory(rules: GitHubRule[]): Record<string, GitHubRule[]> {
  return rules.reduce((acc, rule) => {
    const category = rule.category || 'universal';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(rule);
    return acc;
  }, {} as Record<string, GitHubRule[]>);
}

export function getRuleStats(rules: GitHubRule[]): {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  
  rules.forEach(rule => {
    // Count by category
    const category = rule.category || 'universal';
    byCategory[category] = (byCategory[category] || 0) + 1;
    
    // Count by severity
    bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
  });
  
  return {
    total: rules.length,
    byCategory,
    bySeverity
  };
}