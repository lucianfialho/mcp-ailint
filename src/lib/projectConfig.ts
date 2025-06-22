// src/lib/projectConfig.ts - Complete Project Configuration Manager
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { GitHubRule, getRulesFromCategories, getUniversalRules, groupRulesByCategory } from './api.js';

export interface SetupResult {
  success: boolean;
  rulesDownloaded: string[];
  configCreated: string;
  autoAttachEnabled: boolean;
  nextSteps: string;
  error?: string;
  totalRules?: number;
}

export interface ProjectConfig {
  ailint: {
    version: string;
    source: string;
    categories: string[];
    totalRules: number;
    lastSync: string;
    ide: string;
    projectPath: string;
  };
}

export interface CategoryIndex {
  category: string;
  rules: string[];
  count: number;
  lastUpdated: string;
  source: string;
}

export class ProjectConfigManager {
  private readonly supportedIDEs = {
    'cursor': '.cursor/rules',
    'windsurf': '.windsurf/rules',
    'vscode': '.vscode/rules',
    'claude': '.claude/rules',
    'default': '.ailint'
  };

  /**
   * Set up AILint for a project with specified rulesets
   */
  async setupProject(
    projectPath: string,
    rulesets: string[],
    ide: string = 'cursor'
  ): Promise<SetupResult> {
    try {
      console.error(`🔧 Setting up AILint project at: ${projectPath}`);
      console.error(`📋 Requested rulesets: ${rulesets.join(', ')}`);
      console.error(`🎯 Target IDE: ${ide}`);

      // Validate project path
      await this.validateProjectPath(projectPath);

      // Always include universal rules
      const allRulesets = this.ensureUniversalRules(rulesets);
      console.error(`📦 Final rulesets: ${allRulesets.join(', ')}`);

      // Download rules from GitHub
      const downloadResult = await this.downloadRules(allRulesets);
      
      if (downloadResult.rules.length === 0) {
        throw new Error('No rules could be downloaded from GitHub repository');
      }

      // Create IDE-specific configuration
      const configPath = await this.createIDEConfiguration(
        projectPath, 
        downloadResult.rules, 
        allRulesets,
        ide
      );

      // Create project configuration file
      await this.createProjectConfig(projectPath, {
        categories: downloadResult.successful,
        totalRules: downloadResult.rules.length,
        ide,
        configPath
      });

      console.error(`✅ Project setup completed successfully!`);
      console.error(`📁 Configuration created at: ${configPath}`);
      console.error(`📊 Total rules downloaded: ${downloadResult.rules.length}`);

      return {
        success: true,
        rulesDownloaded: downloadResult.successful,
        configCreated: configPath,
        autoAttachEnabled: true,
        totalRules: downloadResult.rules.length,
        nextSteps: `Project configured with ${downloadResult.rules.length} rules. Run "analyze this code. use ailint" to start using AILint.`
      };

    } catch (error) {
      console.error('❌ Project setup failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        rulesDownloaded: [],
        configCreated: '',
        autoAttachEnabled: false,
        nextSteps: 'Fix the error and try setup again'
      };
    }
  }

  /**
   * Download rules from multiple categories
   */
  private async downloadRules(rulesets: string[]): Promise<{
    rules: GitHubRule[];
    successful: string[];
    failed: string[];
  }> {
    const successful: string[] = [];
    const failed: string[] = [];
    const allRules: GitHubRule[] = [];

    for (const ruleset of rulesets) {
      try {
        console.error(`📥 Downloading rules for category: ${ruleset}`);
        
        let rules: GitHubRule[];
        if (ruleset === 'universal') {
          rules = await getUniversalRules();
        } else {
          rules = await getRulesFromCategories([ruleset]);
        }

        if (rules.length > 0) {
          allRules.push(...rules);
          successful.push(ruleset);
          console.error(`✅ Downloaded ${rules.length} rules for ${ruleset}`);
        } else {
          failed.push(ruleset);
          console.error(`⚠️ No rules found for category: ${ruleset}`);
        }

      } catch (error) {
        failed.push(ruleset);
        console.error(`❌ Failed to download ${ruleset}:`, error);
      }
    }

    console.error(`📊 Download summary: ${successful.length} successful, ${failed.length} failed`);
    
    return { rules: allRules, successful, failed };
  }

  /**
   * Create IDE-specific configuration structure
   */
  private async createIDEConfiguration(
    projectPath: string,
    rules: GitHubRule[],
    rulesets: string[],
    ide: string
  ): Promise<string> {
    // Determine configuration directory
    const ideConfigDir = this.supportedIDEs[ide as keyof typeof this.supportedIDEs] || this.supportedIDEs.default;
    const configPath = path.join(projectPath, ideConfigDir);

    console.error(`📁 Creating IDE configuration at: ${configPath}`);

    // Ensure base directory exists
    await this.ensureDirectoryExists(configPath);

    // Group rules by category
    const rulesByCategory = groupRulesByCategory(rules);

    // Create category directories and rule files
    for (const [category, categoryRules] of Object.entries(rulesByCategory)) {
      await this.createCategoryConfiguration(configPath, category, categoryRules);
    }

    // Create main configuration file
    await this.createMainConfigFile(configPath, {
      categories: Object.keys(rulesByCategory),
      totalRules: rules.length,
      rulesets,
      ide
    });

    // Create README for the configuration
    await this.createConfigurationReadme(configPath, {
      categories: Object.keys(rulesByCategory),
      totalRules: rules.length,
      ide
    });

    return configPath;
  }

  /**
   * Create configuration for a specific category
   */
  private async createCategoryConfiguration(
    configPath: string,
    category: string,
    rules: GitHubRule[]
  ): Promise<void> {
    const categoryPath = path.join(configPath, category);
    await this.ensureDirectoryExists(categoryPath);

    console.error(`📝 Creating ${rules.length} rule files for category: ${category}`);

    // Create individual rule files
    for (const rule of rules) {
      const ruleFilePath = path.join(categoryPath, `${rule.name}.mdc`);
      const ruleContent = this.reconstructMDCContent(rule);
      await this.writeFile(ruleFilePath, ruleContent);
    }

    // Create category index file
    const categoryIndex: CategoryIndex = {
      category,
      rules: rules.map(r => r.name).sort(),
      count: rules.length,
      lastUpdated: new Date().toISOString(),
      source: 'github:lucianfialho/ailint'
    };

    const indexPath = path.join(categoryPath, 'index.json');
    await this.writeFile(indexPath, JSON.stringify(categoryIndex, null, 2));

    console.error(`✅ Created category configuration for ${category}: ${rules.length} rules`);
  }

  /**
   * Create main configuration file
   */
  private async createMainConfigFile(
    configPath: string,
    options: {
      categories: string[];
      totalRules: number;
      rulesets: string[];
      ide: string;
    }
  ): Promise<void> {
    const config: ProjectConfig = {
      ailint: {
        version: "0.2.0",
        source: "github:lucianfialho/ailint",
        categories: options.categories.sort(),
        totalRules: options.totalRules,
        lastSync: new Date().toISOString(),
        ide: options.ide,
        projectPath: configPath
      }
    };

    const configFilePath = path.join(configPath, 'ailint-config.json');
    await this.writeFile(configFilePath, JSON.stringify(config, null, 2));

    console.error(`📄 Created main configuration file: ailint-config.json`);
  }

  /**
   * Create project-level configuration
   */
  private async createProjectConfig(
    projectPath: string,
    options: {
      categories: string[];
      totalRules: number;
      ide: string;
      configPath: string;
    }
  ): Promise<void> {
    const projectConfig = {
      ailint: {
        enabled: true,
        version: "0.2.0",
        configPath: options.configPath,
        categories: options.categories,
        totalRules: options.totalRules,
        ide: options.ide,
        setupDate: new Date().toISOString(),
        lastSync: new Date().toISOString()
      }
    };

    const projectConfigPath = path.join(projectPath, '.ailint-project.json');
    await this.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2));

    console.error(`📋 Created project configuration: .ailint-project.json`);
  }

  /**
   * Create README for configuration directory
   */
  private async createConfigurationReadme(
    configPath: string,
    options: {
      categories: string[];
      totalRules: number;
      ide: string;
    }
  ): Promise<void> {
    const readme = `# AILint Configuration

This directory contains AILint rules downloaded from GitHub.

## Configuration Details

- **IDE**: ${options.ide}
- **Total Rules**: ${options.totalRules}
- **Categories**: ${options.categories.join(', ')}
- **Source**: github:lucianfialho/ailint
- **Last Updated**: ${new Date().toLocaleString()}

## Categories

${options.categories.map(cat => `- **${cat}**/: Rules for ${cat} analysis`).join('\n')}

## Usage

All rules in this directory are automatically applied when you run:

\`\`\`
"analyze this code. use ailint"
\`\`\`

## Updating Rules

To refresh rules from GitHub:

\`\`\`
"refresh ailint rules for this project. use ailint"
\`\`\`

---

Generated by AILint v0.2.0
`;

    const readmePath = path.join(configPath, 'README.md');
    await this.writeFile(readmePath, readme);
  }

  /**
   * Reconstruct MDC content from GitHubRule object
   */
  private reconstructMDCContent(rule: GitHubRule): string {
    const frontmatter = {
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      ...(rule.subcategory && { subcategory: rule.subcategory }),
      ...(rule.triggers.length > 0 && { triggers: rule.triggers }),
      ...(rule.examples.length > 0 && { examples: rule.examples })
    };

    // Convert frontmatter to YAML
    const yamlFrontmatter = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });

    return `---
${yamlFrontmatter.trim()}
---

${rule.content}`;
  }

  /**
   * Utility functions
   */
  private async validateProjectPath(projectPath: string): Promise<void> {
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${projectPath}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Project directory does not exist: ${projectPath}`);
      }
      throw error;
    }
  }

  private ensureUniversalRules(rulesets: string[]): string[] {
    const allRulesets = [...rulesets];
    if (!allRulesets.includes('universal')) {
      allRulesets.unshift('universal');
    }
    return [...new Set(allRulesets)]; // Remove duplicates
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to create directory ${dirPath}: ${errorMessage}`);
      }
    }
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write file ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if project is already configured
   */
  async isProjectConfigured(projectPath: string): Promise<boolean> {
    try {
      const configPath = path.join(projectPath, '.ailint-project.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get existing project configuration
   */
  async getProjectConfig(projectPath: string): Promise<any | null> {
    try {
      const configPath = path.join(projectPath, '.ailint-project.json');
      const content = await fs.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Update existing project configuration
   */
  async updateProjectConfig(
    projectPath: string,
    rulesets: string[],
    ide?: string
  ): Promise<SetupResult> {
    console.error(`🔄 Updating existing AILint configuration`);
    
    const existingConfig = await this.getProjectConfig(projectPath);
    const targetIDE = ide || existingConfig?.ailint?.ide || 'cursor';
    
    return this.setupProject(projectPath, rulesets, targetIDE);
  }

  /**
   * Remove project configuration
   */
  async removeProjectConfig(projectPath: string): Promise<void> {
    try {
      // Remove project config file
      const projectConfigPath = path.join(projectPath, '.ailint-project.json');
      await fs.unlink(projectConfigPath).catch(() => {}); // Ignore if doesn't exist

      // Remove IDE configuration directories
      for (const ideDir of Object.values(this.supportedIDEs)) {
        const configDir = path.join(projectPath, ideDir);
        await fs.rm(configDir, { recursive: true, force: true }).catch(() => {});
      }

      console.error(`🗑️ Removed AILint configuration from project`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to remove project configuration: ${errorMessage}`);
    }
  }
}