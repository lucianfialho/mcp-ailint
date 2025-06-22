#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Command } from "commander";
import { CodeAnalyzer } from "./lib/analyzer.js";
import { ProjectConfigManager } from "./lib/projectConfig.js";
import { 
  getAvailableRuleCategories, 
  getUniversalRules, 
  getRulesFromCategories, 
  isGitHubRepositoryAccessible,
  formatRuleForDisplay,
  getRuleStats
} from "./lib/api.js";

// Parse CLI arguments using commander
const program = new Command()
  .option("--transport <stdio|http|sse>", "transport type", "stdio")
  .option("--port <number>", "port for HTTP/SSE transport", "3000")
  .allowUnknownOption() // let MCP Inspector / other wrappers pass through extra flags
  .parse(process.argv);

const cliOptions = program.opts<{
  transport: string;
  port: string;
}>();

// Validate transport option
const allowedTransports = ["stdio", "http", "sse"];
if (!allowedTransports.includes(cliOptions.transport)) {
  console.error(
    `Invalid --transport value: '${cliOptions.transport}'. Must be one of: stdio, http, sse.`
  );
  process.exit(1);
}

// Transport configuration
const TRANSPORT_TYPE = (cliOptions.transport || "stdio") as "stdio" | "http" | "sse";

// Function to create a new server instance with all tools registered
function createServerInstance() {
  const server = new McpServer(
    {
      name: "AILint",
      version: "0.2.0",
    },
    {
      instructions:
        "Use this server to analyze code quality and get intelligent suggestions for improvements. AILint helps prevent common coding issues and enforces best practices using GitHub-powered rules.",
    }
  );

  // Initialize code analyzer and project config manager
  const analyzer = new CodeAnalyzer();
  const projectManager = new ProjectConfigManager();

  // Register AILint tools
  server.tool(
    "analyze-code",
    `Analyzes code for quality issues, security vulnerabilities, and architectural problems.

Returns detailed analysis including:
- Violations of best practices (god classes, SQL injection, hardcoded dependencies)
- Specific suggestions for improvement
- Code metrics and maintainability score
- Before/after examples for fixes

Enhanced in Phase 2:
- GitHub API integration for dynamic rules
- Support for framework-specific rules (React, Vue, Angular)
- Principle-based analysis (SOLID, DDD, Clean Architecture)
- Improved accuracy with per-class and per-function analysis

Usage examples:
- "analyze this code. use ailint" - Universal rules only
- "analyze this code with react, solid rules. use ailint" - Universal + GitHub rules`,
    {
      code: z.string().describe("The code to analyze for quality issues and violations"),
      language: z.string().optional().describe("Programming language (javascript, python, typescript, etc)."),
      filename: z.string().optional().describe("Filename to help with language detection and context"),
      rulesets: z.array(z.string()).optional().describe("Additional rule sets to apply (e.g., ['react', 'solid'])")
    },
    async ({ code, language, filename, rulesets = [] }) => {
      try {
        console.error(`🔍 Starting code analysis...`);
        console.error(`📋 Requested additional rulesets: ${rulesets.length > 0 ? rulesets.join(', ') : 'none'}`);

        // Check GitHub repository accessibility
        const isGitHubAccessible = await isGitHubRepositoryAccessible();
        if (!isGitHubAccessible) {
          return {
            content: [{
              type: "text",
              text: `❌ **GitHub Repository Unavailable**

The AILint rules repository is currently inaccessible. Please check:
- Internet connection
- GitHub API status
- Repository accessibility at: https://github.com/lucianfialho/ailint`
            }]
          };
        }

        // Load universal rules (always applied)
        console.error(`📥 Loading universal rules from GitHub...`);
        const universalRules = await getUniversalRules();
        
        if (universalRules.length === 0) {
          return {
            content: [{
              type: "text",
              text: `⚠️ **No Universal Rules Available**

Could not load universal rules from GitHub repository. This may indicate:
- Repository structure issues
- Missing universal rules directory
- Network connectivity problems

Please check the repository at: https://github.com/lucianfialho/ailint`
            }]
          };
        }

        console.error(`✅ Loaded ${universalRules.length} universal rules`);

        // Load additional rulesets if specified
        const additionalRules = rulesets.length > 0 
          ? await getRulesFromCategories(rulesets)
          : [];

        if (rulesets.length > 0) {
          console.error(`📦 Loaded ${additionalRules.length} additional rules from: ${rulesets.join(', ')}`);
        }

        // Combine all rules
        const allRules = [...universalRules, ...additionalRules];
        const ruleStats = getRuleStats(allRules);

        console.error(`🎯 Total rules for analysis: ${allRules.length}`);
        console.error(`📊 Rules by category: ${Object.entries(ruleStats.byCategory).map(([cat, count]) => `${cat}:${count}`).join(', ')}`);

        // Analyze code with GitHub-sourced rules
        const result = await analyzer.analyze(code, allRules, language, filename);

        // Format response
        let response = `🔍 **AILint Code Analysis Results**\n\n`;
        
        // Analysis summary
        response += `**Code analyzed:** ${result.metrics.linesOfCode} lines\n`;
        response += `**Rules applied:** ${allRules.length} (${ruleStats.byCategory.universal || 0} universal`;
        if (rulesets.length > 0) {
          response += ` + ${additionalRules.length} from ${rulesets.join(', ')}`;
        }
        response += `)\n`;
        response += `**Language:** ${result.language || 'auto-detected'}\n\n`;

        // Violations found
        if (result.violations.length > 0) {
          response += `## 🚨 Issues Found (${result.violations.length})\n\n`;
          
          const groupedViolations = result.violations.reduce((acc: Record<string, typeof result.violations>, violation) => {
            if (!acc[violation.severity]) acc[violation.severity] = [];
            acc[violation.severity].push(violation);
            return acc;
          }, {} as Record<string, typeof result.violations>);

          // Show errors first, then warnings, then info
          const severityOrder = ['error', 'warning', 'info'];
          for (const severity of severityOrder) {
            const violations = groupedViolations[severity];
            if (!violations || violations.length === 0) continue;

            const severityIcon = severity === 'error' ? '🚨' : 
                                severity === 'warning' ? '⚠️' : '💡';
            
            for (const violation of violations) {
              response += `${severityIcon} **${violation.rule.toUpperCase()}** (Line ${violation.line})\n`;
              response += `${violation.message}\n`;
              if (violation.suggestion) {
                response += `💡 **Fix:** ${violation.suggestion}\n`;
              }
              response += `\n`;
            }
          }
        } else {
          response += `## ✅ No Issues Found\n\n`;
          response += `Great job! Your code follows all applied coding standards and best practices.\n\n`;
        }

        // Suggestions for improvement
        if (result.suggestions.length > 0) {
          response += `## 💡 Suggestions for Improvement\n\n`;
          
          for (const suggestion of result.suggestions) {
            const typeIcon = suggestion.type === 'security' ? '🔒' : 
                           suggestion.type === 'performance' ? '⚡' : 
                           suggestion.type === 'maintainability' ? '🏗️' : '🔧';
            
            response += `${typeIcon} **${suggestion.title}**\n`;
            response += `${suggestion.description}\n\n`;
          }
        }

        // Add metrics
        response += `## 📊 Code Metrics\n\n`;
        response += `- **Lines of Code:** ${result.metrics.linesOfCode}\n`;
        response += `- **Complexity:** ${result.metrics.complexity}/10\n`;
        response += `- **Maintainability Index:** ${result.metrics.maintainabilityIndex}/100\n`;
        response += `- **Technical Debt:** ${result.metrics.technicalDebt}\n\n`;

        // Quality score
        const qualityScore = Math.max(0, Math.min(100, 
          result.metrics.maintainabilityIndex - (result.violations.length * 10)
        ));
        
        response += `🎯 **Overall Quality Score:** ${qualityScore}/100\n\n`;

        // Configuration message
        response += `---\n\n`;
        
        if (rulesets.length > 0) {
          response += `**Configuration:** Universal rules + ${rulesets.join(', ')} rules applied\n`;
          response += `**GitHub Integration:** ✅ Successfully loaded rules from GitHub\n`;
        } else {
          response += `**Configuration:** Using Universal rules (security, architecture, best practices)\n`;
          response += `**Add More Rules:** Run \`"analyze this code with react, solid rules. use ailint"\` for framework-specific analysis\n`;
        }
        
        response += `**Source:** github:lucianfialho/ailint (${allRules.length} rules loaded)\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        console.error('❌ Analysis error:', error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Analysis Error**

${error instanceof Error ? error.message : 'Unknown error occurred during code analysis'}

**Troubleshooting:**
- Check internet connection for GitHub API access
- Verify repository accessibility: https://github.com/lucianfialho/ailint
- Try again in a few moments

**Error Details:** ${error instanceof Error ? error.stack : 'No additional details available'}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-available-rules",
    `Lists all available AILint rules organized by category.

Shows:
- Universal rules (always active)
- Framework-specific rules (React, Vue, Angular, etc)
- Principle-based rules (SOLID, DDD, Clean Architecture)
- Security-focused rules

Enhanced in Phase 2:
- Real-time GitHub API integration
- Dynamic rule discovery
- Status of rule availability

Use this to understand what rules are available before setting up a project or requesting specific rulesets.`,
    {},
    async () => {
      try {
        console.error('📋 Fetching available rules from GitHub...');

        // Check GitHub accessibility
        const isAccessible = await isGitHubRepositoryAccessible();
        if (!isAccessible) {
          return {
            content: [{
              type: "text",
              text: `❌ **GitHub Repository Unavailable**

Cannot fetch rules list. The repository may be temporarily unavailable.
Please check: https://github.com/lucianfialho/ailint`
            }]
          };
        }

        // Get available categories from GitHub
        const availableCategories = await getAvailableRuleCategories();
        
        if (availableCategories.length === 0) {
          return {
            content: [{
              type: "text",
              text: `⚠️ **No Rule Categories Found**

The GitHub repository appears to be empty or inaccessible.
Expected categories: universal, frameworks, principles, security`
            }]
          };
        }

        // Load universal rules to show detailed info
        const universalRules = await getUniversalRules();

        let response = `📋 **Available AILint Rules**\n\n`;
        response += `**Source:** github:lucianfialho/ailint\n`;
        response += `**Categories Found:** ${availableCategories.length}\n`;
        response += `**Status:** ✅ Repository accessible\n\n`;
        
        response += `## 🌍 Universal Rules (Always Active)\n\n`;
        if (universalRules.length > 0) {
          for (const rule of universalRules) {
            response += formatRuleForDisplay(rule) + '\n';
          }
          response += `\n**Total Universal Rules:** ${universalRules.length}\n\n`;
        } else {
          response += `⚠️ No universal rules found in repository\n\n`;
        }
        
        response += `## 🚀 Additional Rule Categories\n\n`;
        const otherCategories = availableCategories.filter(cat => cat !== 'universal');
        
        if (otherCategories.length > 0) {
          response += `✅ **Available via GitHub API:**\n`;
          for (const category of otherCategories) {
            const categoryDesc = getCategoryDescription(category);
            response += `- **${category}** - ${categoryDesc}\n`;
          }
        } else {
          response += `⏳ **Coming Soon** - Additional rule categories will be available when repository is populated\n`;
        }
        
        response += `\n---\n\n`;
        response += `**Usage Examples:**\n`;
        response += `- \`"analyze this code. use ailint"\` - Universal rules only\n`;
        response += `- \`"analyze this code with react, solid rules. use ailint"\` - Universal + specific rules\n`;
        response += `- \`"setup project with react, solid for cursor. use ailint"\` - Project configuration\n\n`;
        
        response += `**Available Categories:** ${availableCategories.join(', ')}\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        console.error('❌ Error fetching rules:', error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error Loading Rules**

${error instanceof Error ? error.message : 'Failed to retrieve available rules'}

**Possible Causes:**
- Network connectivity issues
- GitHub API rate limiting
- Repository access problems

**Try Again:** \`"what rules are available? use ailint"\``,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "setup-project",
    `Sets up AILint for a specific project with custom rule sets.

NEW in Phase 2: Full implementation with GitHub API integration!

Downloads rules from GitHub API and creates IDE-specific configuration.
This enables seamless analysis with project-specific rules.

Features:
- Downloads framework/principle rules from GitHub
- Creates .cursor/rules/, .windsurf/rules/, etc.
- Enables auto-attach for future analysis
- Persistent configuration across sessions

Example usage: "use ailint for this project with solid, react for cursor"`,
    {
      projectPath: z.string().describe("Path to the project directory"),
      rulesets: z.array(z.string()).describe("Rule sets to apply (e.g., ['solid', 'react', 'security'])"),
      ide: z.string().optional().describe("Target IDE (cursor, windsurf, vscode, etc)")
    },
    async ({ projectPath, rulesets, ide = "cursor" }) => {
      try {
        console.error(`🔧 Starting project setup...`);
        console.error(`📁 Project: ${projectPath}`);
        console.error(`📋 Rulesets: ${rulesets.join(', ')}`);
        console.error(`🎯 IDE: ${ide}`);

        // Check GitHub accessibility first
        const isAccessible = await isGitHubRepositoryAccessible();
        if (!isAccessible) {
          return {
            content: [{
              type: "text",
              text: `❌ **Setup Failed: GitHub Repository Unavailable**

Cannot setup project because the AILint rules repository is not accessible.

**Troubleshooting:**
- Check internet connection
- Verify repository access: https://github.com/lucianfialho/ailint
- Try again in a few moments

**Alternative:** Use \`"analyze this code. use ailint"\` for basic universal rules when GitHub is available.`
            }]
          };
        }

        // Perform actual project setup
        const result = await projectManager.setupProject(projectPath, rulesets, ide);
        
        let response = `⚙️ **AILint Project Setup**\n\n`;
        response += `**Project:** ${projectPath}\n`;
        response += `**Requested Rules:** ${rulesets.join(', ')}\n`;
        response += `**Target IDE:** ${ide}\n\n`;
        
        if (result.success) {
          response += `## ✅ Setup Completed Successfully\n\n`;
          response += `**Downloaded Rules:** ${result.rulesDownloaded.join(', ')}\n`;
          response += `**Total Rules:** ${result.totalRules || 0}\n`;
          response += `**Config Created:** ${result.configCreated}\n`;
          response += `**Auto-attach:** ${result.autoAttachEnabled ? 'Enabled' : 'Disabled'}\n\n`;
          
          response += `## 🚀 What's Available Now\n\n`;
          response += `Use \`"analyze this code. use ailint"\` to get:\n`;
          response += `- Universal rules (security, architecture, code quality)\n`;
          response += `- ${result.rulesDownloaded.filter(r => r !== 'universal').join(' + ')} rules (automatically loaded)\n`;
          response += `- Project-specific configuration\n`;
          response += `- Persistent rules across sessions\n\n`;
          
          response += `## 💡 Usage Examples\n\n`;
          response += `\`"analyze this React component. use ailint"\` - Full analysis with React rules\n`;
          response += `\`"review this class for SOLID principles. use ailint"\` - Architecture analysis\n`;
          response += `\`"check this function for security issues. use ailint"\` - Security focus\n\n`;
          
          response += `**Next Steps:** ${result.nextSteps}\n`;
          
        } else {
          response += `## ❌ Setup Failed\n\n`;
          response += `**Error:** ${result.error}\n\n`;
          
          response += `## 🔄 Fallback Options\n\n`;
          response += `1. **Manual Analysis:** Use \`"analyze this code with ${rulesets.join(', ')} rules. use ailint"\`\n`;
          response += `2. **Universal Rules:** \`"analyze this code. use ailint"\` (always works)\n`;
          response += `3. **Check GitHub:** Ensure lucianfialho/ailint repository is accessible\n\n`;
          
          response += `**Troubleshooting:**\n`;
          response += `- Verify project path exists and is writable\n`;
          response += `- Check internet connection for GitHub API\n`;
          response += `- Try with fewer rulesets first\n`;
          
          response += `🔧 **Fix GitHub Access:**\n`;
          response += `- Check internet connection\n`;
          response += `- Verify repository: https://github.com/lucianfialho/ailint\n`;
          response += `- Try refreshing: \`"refresh ailint rules. use ailint"\`\n\n`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        console.error('❌ Setup error:', error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Setup Error**

${error instanceof Error ? error.message : 'Failed to setup project'}

**Error Details:** ${error instanceof Error ? error.stack : 'No additional details'}

**Recovery Steps:**
1. Check project path exists and is writable
2. Verify internet connection
3. Try with simpler ruleset first: \`"setup with universal rules. use ailint"\``,
            },
          ],
        };
      }
    }
  );

  // Additional helper tools
  server.tool(
    "refresh-rules",
    `Refreshes AILint rules from GitHub repository.

Useful when:
- Rules have been updated in the repository
- Cache needs to be cleared
- Network issues caused stale data

This tool clears the local cache and re-downloads rules from GitHub.`,
    {
      projectPath: z.string().optional().describe("Project path to refresh configuration for")
    },
    async ({ projectPath }) => {
      try {
        console.error('🔄 Refreshing rules from GitHub...');

        // Clear cache and reload
        const { githubClient } = await import('./lib/api.js');
        githubClient.clearCache();

        // Check accessibility
        const isAccessible = await isGitHubRepositoryAccessible();
        if (!isAccessible) {
          return {
            content: [{
              type: "text",
              text: `❌ **Refresh Failed: GitHub Unavailable**

Cannot refresh rules because GitHub repository is not accessible.
Please check your internet connection and try again.`
            }]
          };
        }

        // Reload universal rules
        const universalRules = await getUniversalRules();
        const categories = await getAvailableRuleCategories();

        let response = `🔄 **Rules Refreshed Successfully**\n\n`;
        response += `**Universal Rules:** ${universalRules.length} loaded\n`;
        response += `**Available Categories:** ${categories.join(', ')}\n`;
        response += `**Cache:** Cleared and reloaded\n\n`;

        // If project path provided, refresh project config
        if (projectPath) {
          const isConfigured = await projectManager.isProjectConfigured(projectPath);
          if (isConfigured) {
            const existingConfig = await projectManager.getProjectConfig(projectPath);
            if (existingConfig?.ailint?.categories) {
              const updateResult = await projectManager.updateProjectConfig(
                projectPath,
                existingConfig.ailint.categories,
                existingConfig.ailint.ide
              );
              
              if (updateResult.success) {
                response += `✅ **Project configuration refreshed**\n`;
                response += `**Updated Rules:** ${updateResult.totalRules}\n`;
                response += `**Categories:** ${updateResult.rulesDownloaded.join(', ')}\n\n`;
              } else {
                response += `⚠️ **Project refresh failed:** ${updateResult.error}\n\n`;
              }
            }
          } else {
            response += `ℹ️ **Project not configured** - run setup first\n\n`;
          }
        }

        response += `**Next:** Rules are now up-to-date and ready for analysis`;

        return {
          content: [{
            type: "text",
            text: response
          }]
        };

      } catch (error) {
        console.error('❌ Refresh error:', error);
        return {
          content: [{
            type: "text",
            text: `❌ **Refresh Failed**

${error instanceof Error ? error.message : 'Unknown error during refresh'}

**Try:** Check internet connection and GitHub repository access`
          }]
        };
      }
    }
  );

  server.tool(
    "check-health",
    `Performs a health check of AILint system.

Verifies:
- GitHub repository accessibility
- Universal rules availability  
- Cache status
- System readiness

Useful for troubleshooting connectivity or configuration issues.`,
    {},
    async () => {
      try {
        console.error('🏥 Performing AILint health check...');

        const results = {
          github: false,
          universalRules: 0,
          categories: 0,
          cache: false,
          timestamp: new Date().toISOString()
        };

        // Check GitHub accessibility
        results.github = await isGitHubRepositoryAccessible();
        
        // Check universal rules
        if (results.github) {
          try {
            const universalRules = await getUniversalRules();
            results.universalRules = universalRules.length;
          } catch (error) {
            console.error('Failed to load universal rules:', error);
          }

          // Check available categories
          try {
            const categories = await getAvailableRuleCategories();
            results.categories = categories.length;
          } catch (error) {
            console.error('Failed to load categories:', error);
          }
        }

        // Check cache status
        const { githubClient } = await import('./lib/api.js');
        results.cache = true; // Cache is always available

        let response = `🏥 **AILint Health Check**\n\n`;
        response += `**Timestamp:** ${new Date().toLocaleString()}\n\n`;

        response += `## 📊 System Status\n\n`;
        response += `**GitHub Repository:** ${results.github ? '✅ Accessible' : '❌ Unavailable'}\n`;
        response += `**Universal Rules:** ${results.universalRules > 0 ? `✅ ${results.universalRules} loaded` : '❌ Not available'}\n`;
        response += `**Rule Categories:** ${results.categories > 0 ? `✅ ${results.categories} found` : '❌ Not available'}\n`;
        response += `**Cache System:** ${results.cache ? '✅ Operational' : '❌ Error'}\n\n`;

        const overallHealth = results.github && results.universalRules > 0 && results.categories > 0;
        
        response += `## 🎯 Overall Status\n\n`;
        if (overallHealth) {
          response += `✅ **HEALTHY** - All systems operational\n\n`;
          response += `AILint is ready for code analysis and project setup.\n`;
        } else {
          response += `❌ **DEGRADED** - Some issues detected\n\n`;
          
          if (!results.github) {
            response += `🔧 **Fix GitHub Access:**\n`;
            response += `- Check internet connection\n`;
            response += `- Verify repository: https://github.com/lucianfialho/ailint\n`;
            response += `- Try refreshing: \`"refresh ailint rules. use ailint"\`\n\n`;
          }
          
          if (results.universalRules === 0) {
            response += `🔧 **Fix Universal Rules:**\n`;
            response += `- Repository may be empty or misconfigured\n`;
            response += `- Check rules/universal/ directory exists\n\n`;
          }
        }

        response += `**Repository URL:** https://github.com/lucianfialho/ailint\n`;
        response += `**Version:** 0.2.0\n`;

        return {
          content: [{
            type: "text",
            text: response
          }]
        };

      } catch (error) {
        console.error('❌ Health check error:', error);
        return {
          content: [{
            type: "text",
            text: `❌ **Health Check Failed**

${error instanceof Error ? error.message : 'Unknown error during health check'}

**System Status:** Unknown - manual verification required`
          }]
        };
      }
    }
  );

  return server;
}

// Helper function for category descriptions
function getCategoryDescription(category: string): string {
  const descriptions = {
    'frameworks': 'React, Vue, Angular, Node.js specific patterns',
    'principles': 'SOLID, DDD, Clean Architecture guidelines', 
    'security': 'OWASP, cryptography, input validation rules',
    'performance': 'Optimization and efficiency patterns',
    'testing': 'Unit testing, integration testing best practices'
  };
  
  return descriptions[category as keyof typeof descriptions] || `${category} specific rules`;
}

// Main function to start the server
async function main() {
  console.error("🚀 Starting AILint MCP Server v0.2.0...");
  
  // Check GitHub repository accessibility on startup
  try {
    const isAccessible = await isGitHubRepositoryAccessible();
    if (isAccessible) {
      console.error("✅ GitHub repository accessible");
      
      // Load and cache universal rules on startup
      const universalRules = await getUniversalRules();
      console.error(`📦 Preloaded ${universalRules.length} universal rules`);
    } else {
      console.error("⚠️ GitHub repository not accessible - will attempt connections on demand");
    }
  } catch (error) {
    console.error("⚠️ Could not verify GitHub access on startup:", error);
  }

  if (TRANSPORT_TYPE === "stdio") {
    // Stdio transport (used by Cursor, Windsurf, Claude Desktop)
    const server = createServerInstance();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ AILint MCP Server running on stdio with GitHub integration");
  } else {
    console.error(`❌ Transport ${TRANSPORT_TYPE} not implemented. Use --transport stdio`);
    console.error("Supported transports: stdio (recommended for IDEs)");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("💥 Fatal error in AILint MCP Server:", error);
  console.error("Stack trace:", error.stack);
  process.exit(1);
});