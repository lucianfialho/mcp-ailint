#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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

// HTTP/SSE port configuration
const CLI_PORT = (() => {
  const parsed = parseInt(cliOptions.port, 10);
  return isNaN(parsed) ? undefined : parsed;
})();

// Store SSE transports by session ID
const sseTransports: Record<string, SSEServerTransport> = {};

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
      language: z.string().optional().describe("Programming language (javascript, python, typescript, etc). If not provided, AILint will attempt to auto-detect based on code patterns"),
      filename: z.string().optional().describe("Filename to help with language detection and context-specific analysis"),
      rulesets: z.array(z.string()).optional().describe("Additional rule sets to apply from GitHub (e.g., ['react', 'solid', 'security']). Universal rules are always applied")
    },
    async ({ code, language, filename, rulesets = [] }) => {
      try {
        console.error(`🔍 Starting code analysis...`);
        console.error(`📝 Code length: ${code.length} characters`);
        console.error(`🏷️ Language: ${language || 'auto-detect'}`);
        console.error(`📄 Filename: ${filename || 'not provided'}`);
        console.error(`📋 Additional rulesets: ${rulesets.length > 0 ? rulesets.join(', ') : 'none'}`);

        // Carregar regras universais e adicionais
        const universalRules = await getUniversalRules();
        const additionalRules = rulesets.length > 0 ? await getRulesFromCategories(rulesets) : [];
        const allRules = [...universalRules, ...additionalRules];

        // Analisar o código
        const results = await analyzer.analyze(code, allRules, language, filename);

        // Montar resposta simples
        let response = `🔍 **AILint Code Analysis Results**\n\n`;
        response += `**Violations:** ${results.violations.length}\n`;
        response += `**Suggestions:** ${results.suggestions.length}\n`;
        response += `**Lines of Code:** ${results.metrics.linesOfCode}\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error) {
        console.error('❌ Code analysis error:', error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Analysis Failed**

${error instanceof Error ? error.message : 'Unknown error during code analysis'}

**Possible Causes:**
- Code parsing errors
- Network issues accessing GitHub rules
- Internal analysis engine problems

**Try:** Simplify the code or use \`"analyze this code. use ailint"\` for basic analysis`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-available-rules",
    `Lists all available rules organized by category.

Shows:
- Universal rules (always active, embedded in server)
- Framework rules (React, Vue, Angular, Node.js - from GitHub)
- Principle rules (SOLID, DDD, Clean Architecture - from GitHub)
- Security rules (OWASP, cryptography - from GitHub)
- Status of each category (available/loading/error)

Example usage: "what rules does ailint check for? use ailint"`,
    {},
    async () => {
      try {
        console.error('📋 Fetching available rules...');

        // Get universal rules (always available)
        const universalRules = await getUniversalRules();
        
        // Get rule categories from GitHub
        const availableCategories = await getAvailableRuleCategories();
        
        // Get stats for each category
        const categoryStats = await Promise.allSettled(
          availableCategories.map(async (category) => {
            try {
              const rules = await getRulesFromCategories([category]);
              return { category, count: rules.length, status: 'available' };
            } catch (error) {
              return { category, count: 0, status: 'error' };
            }
          })
        );

        let response = `📋 **AILint Available Rules**\n\n`;
        
        // Universal Rules Section
        response += `## 🌍 Universal Rules (Always Active)\n\n`;
        response += `**Count:** ${universalRules.length} rules\n`;
        response += `**Status:** ✅ Embedded in server\n`;
        response += `**Applied:** Automatically to all code analysis\n\n`;
        
        if (universalRules.length > 0) {
          response += `**Sample Rules:**\n`;
          for (const rule of universalRules.slice(0, 5)) {
            response += `- **${rule.name}**: ${rule.description}\n`;
          }
          if (universalRules.length > 5) {
            response += `- ... and ${universalRules.length - 5} more\n`;
          }
          response += `\n`;
        }

        // GitHub Rules Section
        response += `## 🚀 GitHub-Powered Rules\n\n`;
        
        if (availableCategories.length > 0) {
          response += `**Repository:** https://github.com/lucianfialho/ailint\n`;
          response += `**Access:** Public API (no authentication required)\n\n`;
          
          for (const result of categoryStats) {
            if (result.status === 'fulfilled') {
              const { category, count, status } = result.value;
              const statusIcon = status === 'available' ? '✅' : '❌';
              const description = getCategoryDescription(category);
              
              response += `### ${statusIcon} ${category.charAt(0).toUpperCase()}${category.slice(1)}\n`;
              response += `**Rules:** ${count}\n`;
              response += `**Description:** ${description}\n`;
              response += `**Usage:** Include "${category}" in rulesets parameter\n\n`;
            }
          }
        } else {
          response += `⚠️ **GitHub rules temporarily unavailable**\n`;
          response += `- Network connectivity issues\n`;
          response += `- Repository access problems\n`;
          response += `- Try again in a few moments\n\n`;
        }
        
        // Usage Examples
        response += `## 💡 Usage Examples\n\n`;
        response += `\`"analyze this code. use ailint"\` - Universal rules only\n`;
        response += `\`"analyze this React component with react, solid rules. use ailint"\` - Universal + GitHub rules\n`;
        response += `\`"use ailint for this project with solid, react for cursor"\` - Project configuration\n\n`;
        
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
          response += `3. **Retry Setup:** Fix the error and try setup again\n`;
        }

        return {
          content: [{
            type: "text",
            text: response
          }]
        };

      } catch (error) {
        console.error('❌ Project setup error:', error);
        return {
          content: [{
            type: "text",
            text: `❌ **Project Setup Failed**

${error instanceof Error ? error.message : 'Unknown error during project setup'}

**Possible Causes:**
- Invalid project path
- Permission errors
- GitHub API issues
- File system errors

**Try:** Verify project path and permissions, then retry setup`
          }]
        };
      }
    }
  );

  // Health check tool for monitoring
  server.tool(
    "health-check",
    `Performs a health check of AILint services and GitHub integration.

Checks:
- GitHub repository accessibility
- Universal rules loading
- API response times
- System status

Internal tool for monitoring and debugging.`,
    {},
    async () => {
      try {
        console.error('🏥 Performing health check...');
        
        const startTime = Date.now();
        
        // Check GitHub accessibility
        const isAccessible = await isGitHubRepositoryAccessible();
        const githubTime = Date.now() - startTime;
        
        // Check universal rules loading
        const universalStart = Date.now();
        const universalRules = await getUniversalRules();
        const universalTime = Date.now() - universalStart;
        
        // Check rule categories
        const categoriesStart = Date.now();
        const categories = await getAvailableRuleCategories();
        const categoriesTime = Date.now() - categoriesStart;
        
        // Get rule stats
        const allRules = [...universalRules, ...categories.map(c => ({ name: c, description: getCategoryDescription(c) } as any))];
        const stats = getRuleStats(allRules);
        
        const totalTime = Date.now() - startTime;
        
        let response = `🏥 **AILint Health Check**\n\n`;
        response += `**Timestamp:** ${new Date().toISOString()}\n`;
        response += `**Version:** 0.2.0\n`;
        response += `**Total Check Time:** ${totalTime}ms\n\n`;
        
        // GitHub Status
        response += `## 🌐 GitHub Integration\n\n`;
        response += `**Repository Access:** ${isAccessible ? '✅ Available' : '❌ Unavailable'}\n`;
        response += `**Response Time:** ${githubTime}ms\n`;
        response += `**Repository:** https://github.com/lucianfialho/ailint\n\n`;
        
        // Universal Rules Status
        response += `## 📦 Universal Rules\n\n`;
        response += `**Status:** ${universalRules.length > 0 ? '✅ Loaded' : '❌ Failed'}\n`;
        response += `**Count:** ${universalRules.length} rules\n`;
        response += `**Load Time:** ${universalTime}ms\n\n`;
        
        // Categories Status
        response += `## 📋 Rule Categories\n\n`;
        response += `**Status:** ${categories.length > 0 ? '✅ Available' : '❌ Failed'}\n`;
        response += `**Count:** ${categories.length} categories\n`;
        response += `**Load Time:** ${categoriesTime}ms\n`;
        response += `**Categories:** ${categories.join(', ')}\n\n`;
        
        // Cache Status
        response += `## 💾 Cache Status\n\n`;
        response += `**Universal Rules:** ${stats.byCategory.universal || 0} cached\n`;
        response += `**Total Rules:** ${stats.total} cached\n`;
        response += `**Categories:** ${Object.keys(stats.byCategory).length} cached\n\n`;
        
        // Recommendations
        response += `## 🎯 Status Summary\n\n`;
        
        const results = {
          github: isAccessible,
          universalRules: universalRules.length > 0,
          categories: categories.length > 0,
          performance: totalTime < 5000 // 5 seconds threshold
        };
        
        const healthyCount = Object.values(results).filter(Boolean).length;
        const totalChecks = Object.keys(results).length;
        
        if (healthyCount === totalChecks) {
          response += `✅ **All Systems Operational** (${healthyCount}/${totalChecks})\n`;
          response += `AILint is running optimally. All features available.\n\n`;
        } else {
          response += `⚠️ **Partial System Issues** (${healthyCount}/${totalChecks})\n`;
          
          if (!results.github) {
            response += `🔧 **Fix GitHub Access:**\n`;
            response += `- Check internet connection\n`;
            response += `- Verify repository access\n`;
            response += `- GitHub may be experiencing issues\n\n`;
          }
          
          if (!results.universalRules) {
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

  const transportType = TRANSPORT_TYPE;

  if (transportType === "http" || transportType === "sse") {
    // HTTP/SSE transport for Smithery and web deployment
    const initialPort = CLI_PORT ?? 8080;
    let actualPort = initialPort;
    
    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

      // Set CORS headers for all responses
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id, mcp-session-id");

      // Handle preflight OPTIONS requests
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        // Create new server instance for each request
        const requestServer = createServerInstance();

        if (url === "/mcp") {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await requestServer.connect(transport);
          await transport.handleRequest(req, res);
        } else if (url === "/sse" && req.method === "GET") {
          // Create new SSE transport for GET request
          const sseTransport = new SSEServerTransport("/messages", res);
          // Store the transport by session ID
          sseTransports[sseTransport.sessionId] = sseTransport;
          // Clean up transport when connection closes
          res.on("close", () => {
            delete sseTransports[sseTransport.sessionId];
          });
          await requestServer.connect(sseTransport);
        } else if (url === "/messages" && req.method === "POST") {
          // Get session ID from query parameters
          const sessionId =
            new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("sessionId") ?? "";

          if (!sessionId) {
            res.writeHead(400);
            res.end("Missing sessionId parameter");
            return;
          }

          // Get existing transport for this session
          const sseTransport = sseTransports[sessionId];
          if (!sseTransport) {
            res.writeHead(400);
            res.end(`No transport found for sessionId: ${sessionId}`);
            return;
          }

          // Handle the POST message with the existing transport
          await sseTransport.handlePostMessage(req, res);
        } else if (url === "/ping") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("pong");
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } catch (error) {
        console.error("Error handling request:", error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      }
    });

    // Function to attempt server listen with port fallback
    const startServer = (port: number, maxAttempts = 10) => {
      httpServer.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < initialPort + maxAttempts) {
          console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
          startServer(port + 1, maxAttempts);
        } else {
          console.error(`Failed to start server: ${err.message}`);
          process.exit(1);
        }
      });

      httpServer.listen(port, () => {
        actualPort = port;
        console.error(
          `✅ AILint MCP Server running on ${transportType.toUpperCase()} at http://localhost:${actualPort}/mcp`
        );
        if (transportType === "sse") {
          console.error(`SSE endpoint available at http://localhost:${actualPort}/sse`);
        }
        console.error(`Health check available at http://localhost:${actualPort}/ping`);
      });
    };

    // Start the server with initial port
    startServer(initialPort);
    
  } else if (TRANSPORT_TYPE === "stdio") {
    // Stdio transport (used by Cursor, Windsurf, Claude Desktop)
    const server = createServerInstance();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ AILint MCP Server running on stdio with GitHub integration");
  } else {
    console.error(`❌ Transport ${TRANSPORT_TYPE} not supported`);
    console.error("Supported transports: stdio (IDEs), http (Smithery), sse (web)");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("💥 Fatal error in AILint MCP Server:", error);
  console.error("Stack trace:", error.stack);
  process.exit(1);
});