#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Command } from "commander";
import { CodeAnalyzer } from "./lib/analyzer.js";
import { UNIVERSAL_RULES } from "./lib/hardcodedRules.js";
import { ProjectConfigManager } from "./lib/projectConfig.js";
import { getAvailableRuleCategories } from "./lib/api.js";

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
      language: z.string().optional().describe("Programming language (javascript, python, typescript, etc). If not provided, will be auto-detected"),
      filename: z.string().optional().describe("Filename to help with language detection"),
      rulesets: z.array(z.string()).optional().describe("Additional rulesets to apply (e.g., ['react', 'solid'])")
    },
    async ({ code, language, filename, rulesets = [] }) => {
      try {
        // Detect language if not provided
        const detectedLanguage = language || CodeAnalyzer.detectLanguage(code, filename);
        
        // Analyze the code with optional additional rulesets
        const result = await analyzer.analyzeCode(code, detectedLanguage, rulesets);

        // Format the response for the LLM
        let response = `🔍 **AILint Code Analysis Results**\n\n`;
        response += `**Language:** ${detectedLanguage}\n`;
        response += `**Applied Rules:** ${result.appliedRules.join(', ') || 'Universal rules'}\n\n`;
        
        // Add summary
        response += `${result.summary}\n\n`;
        
        // Add violations if any
        if (result.violations.length > 0) {
          response += `## 🚨 Issues Found\n\n`;
          
          for (const violation of result.violations) {
            const severityIcon = violation.severity === 'error' ? '🚨' : 
                                violation.severity === 'warning' ? '⚠️' : '💡';
            
            response += `${severityIcon} **${violation.rule.toUpperCase().replace('-', ' ')}**`;
            if (violation.line) {
              response += ` (Line ${violation.line})`;
            }
            response += `\n`;
            response += `${violation.message}\n\n`;
            
            if (violation.suggestion) {
              response += `💡 **Fix:** ${violation.suggestion}\n\n`;
            }
            
            if (violation.example) {
              response += `📚 **Example:**\n`;
              response += `❌ **Avoid:**\n\`\`\`${detectedLanguage}\n${violation.example.bad}\n\`\`\`\n\n`;
              response += `✅ **Prefer:**\n\`\`\`${detectedLanguage}\n${violation.example.good}\n\`\`\`\n\n`;
              if (violation.example.explanation) {
                response += `**Why:** ${violation.example.explanation}\n\n`;
              }
            }
            
            response += `---\n\n`;
          }
        }
        
        // Add suggestions
        if (result.suggestions.length > 0) {
          response += `## 💡 Recommendations\n\n`;
          
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
        
        // Configuration message
        response += `---\n\n`;
        
        if (rulesets.length > 0) {
          response += `**Configuration:** Universal rules + ${rulesets.join(', ')} rules applied\n`;
          response += `**GitHub Integration:** Successfully loaded additional rules\n`;
        } else {
          response += `**Configuration:** Using Universal rules (security, architecture, best practices)\n`;
          response += `**Next:** Run \`"analyze this code with react, solid rules. use ailint"\` to add framework-specific rules\n`;
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
        return {
          content: [
            {
              type: "text",
              text: `❌ **Analysis Error:** ${error instanceof Error ? error.message : 'Unknown error occurred during code analysis'}`,
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
        // Get available categories from GitHub
        const availableCategories = await getAvailableRuleCategories();
        
        const universalRules = UNIVERSAL_RULES.map(rule => ({
          name: rule.name,
          description: rule.description,
          category: rule.category,
          severity: rule.severity
        }));

        let response = `📋 **Available AILint Rules**\n\n`;
        
        response += `## 🌍 Universal Rules (Always Active)\n\n`;
        for (const rule of universalRules) {
          const severityIcon = rule.severity === 'error' ? '🚨' : 
                              rule.severity === 'warning' ? '⚠️' : '💡';
          response += `${severityIcon} **${rule.name}** - ${rule.description}\n`;
        }
        
        response += `\n## 🚀 Framework Rules (GitHub API)\n\n`;
        if (availableCategories.includes('frameworks')) {
          response += `✅ **Available via GitHub API:**\n`;
          response += `- **react** - React hooks, components, performance patterns\n`;
          response += `- **vue** - Composition API, reactivity patterns\n`;
          response += `- **angular** - Dependency injection, lifecycle, best practices\n`;
          response += `- **nodejs** - Async patterns, security, performance\n`;
        } else {
          response += `⏳ **Coming Soon** - Framework rules will be available when GitHub repository is ready\n`;
        }
        
        response += `\n## 🏗️ Principle Rules (GitHub API)\n\n`;
        if (availableCategories.includes('principles')) {
          response += `✅ **Available via GitHub API:**\n`;
          response += `- **solid** - Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion\n`;
          response += `- **ddd** - Domain-Driven Design patterns\n`;
          response += `- **clean-architecture** - Dependency rules, clean code principles\n`;
          response += `- **calisthenics** - Object calisthenics rules for clean code\n`;
        } else {
          response += `⏳ **Coming Soon** - Principle rules will be available when GitHub repository is ready\n`;
        }
        
        response += `\n## 🔒 Security Rules\n\n`;
        response += `✅ **Built-in Security (Universal):**\n`;
        response += `- SQL injection prevention (Enhanced in Phase 2)\n`;
        response += `- XSS protection patterns\n`;
        response += `- Secure authentication patterns\n`;
        response += `- Input validation enforcement\n`;
        
        if (availableCategories.includes('security')) {
          response += `\n✅ **Additional Security Rules (GitHub API):**\n`;
          response += `- Advanced cryptography patterns\n`;
          response += `- OWASP Top 10 compliance\n`;
          response += `- Framework-specific security rules\n`;
        }
        
        response += `\n---\n\n`;
        response += `**Current Status:** Phase 2 with GitHub API integration\n`;
        response += `**Usage Examples:**\n`;
        response += `- \`"analyze this code. use ailint"\` - Universal rules only\n`;
        response += `- \`"analyze this code with react, solid rules. use ailint"\` - Universal + GitHub rules\n`;
        response += `- \`"setup project with react, solid for cursor. use ailint"\` - Project configuration\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error:** ${error instanceof Error ? error.message : 'Failed to retrieve available rules'}`,
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
        // Perform actual project setup
        const result = await projectManager.setupProject(projectPath, rulesets, ide);
        
        let response = `⚙️ **AILint Project Setup**\n\n`;
        response += `**Project:** ${projectPath}\n`;
        response += `**Requested Rules:** ${rulesets.join(', ')}\n`;
        response += `**Target IDE:** ${ide}\n\n`;
        
        if (result.success) {
          response += `## ✅ Setup Completed Successfully\n\n`;
          response += `**Downloaded Rules:** ${result.rulesDownloaded.join(', ')}\n`;
          response += `**Config Created:** ${result.configCreated}\n`;
          response += `**Auto-attach:** ${result.autoAttachEnabled ? 'Enabled' : 'Disabled'}\n\n`;
          
          response += `## 🚀 What's Available Now\n\n`;
          response += `Use \`"analyze this code. use ailint"\` to get:\n`;
          response += `- Universal rules (security, architecture, code quality)\n`;
          response += `- ${rulesets.join(' + ')} rules (automatically loaded)\n`;
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
          response += `3. **Check GitHub:** Ensure ailint/rules repository is accessible\n\n`;
          
          response += `**Troubleshooting:**\n`;
          response += `- Verify project path exists and is writable\n`;
          response += `- Check internet connection for GitHub API\n`;
          response += `- Try with fewer rulesets first\n`;
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
        return {
          content: [
            {
              type: "text",
              text: `❌ **Setup Error:** ${error instanceof Error ? error.message : 'Failed to setup project'}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

// Main function to start the server
async function main() {
  if (TRANSPORT_TYPE === "stdio") {
    // Stdio transport (usado pelo Cursor, Windsurf, Claude Desktop)
    const server = createServerInstance();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("AILint MCP Server Phase 2 running on stdio");
  } else {
    console.error(`Transport ${TRANSPORT_TYPE} not implemented in Phase 2. Use --transport stdio`);
    console.error("Supported transports: stdio (recommended for IDEs)");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in AILint MCP Server:", error);
  process.exit(1);
});