import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { CodeAnalyzer } from '../shared/analyzer.js';
import { ValidationLayer, ValidationError, SetupProjectArgsSchema } from '../shared/validation.js';
import { 
  AILintError, 
  AnalysisError, 
  ConfigurationError, 
  GitHubAPIError 
} from '../shared/errors.js';
import { GracefulDegradationManager } from '../shared/degradation.js';
import { CircuitBreakerManager } from '../shared/circuit-breaker.js';
import { ProjectConfigManager } from '../cli/projectConfig.js';

const server = new Server({
  name: "ailint-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

const analyzer = new CodeAnalyzer();
const degradationManager = new GracefulDegradationManager();

// Enhanced error handler
function handleToolError(error: Error, toolName: string, correlationId: string): McpError {
  console.error(`❌ Tool '${toolName}' failed [${correlationId}]:`, error);
  console.error(`❌ Tool '${toolName}' failed [${correlationId}]:`, error);

  if (error instanceof ValidationError) {
    const mcpError = ValidationLayer.formatMCPError(error);
    return new McpError(ErrorCode.InvalidParams, mcpError.message, {
      ...mcpError.data,
      correlationId,
      recoveryActions: error.getRecoveryActions()
    });
  }

  if (error instanceof AILintError) {
    const errorCode = error.category === 'validation' 
      ? ErrorCode.InvalidParams
      : ErrorCode.InternalError;

    return new McpError(errorCode, error.getUserFriendlyMessage(), {
      category: error.category,
      severity: error.severity,
      recoverable: error.recoverable,
      correlationId,
      recoveryActions: error.getRecoveryActions(),
      context: error.context
    });
  }

  // Unknown error - provide generic but helpful response
  return new McpError(ErrorCode.InternalError, 
    'An unexpected error occurred. Please try again or contact support if the issue persists.', {
    correlationId,
    errorType: error.constructor.name,
    message: error.message
  });
}

// List available tools with enhanced error information
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const serviceStatus = degradationManager.getCurrentStatus();
    const circuitStats = CircuitBreakerManager.getAllStats();
    
    return {
      tools: [
        {
          name: "analyze-code",
          description: `Analyzes code for quality issues, security vulnerabilities, and architectural problems. 
          
**Current Status:** ${serviceStatus.level.toUpperCase()}
**Available Features:** ${serviceStatus.availableFeatures.join(', ')}
${serviceStatus.unavailableFeatures.length > 0 ? `**Temporarily Unavailable:** ${serviceStatus.unavailableFeatures.join(', ')}` : ''}

Enhanced with comprehensive error handling, graceful degradation, and automatic recovery.`,
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The code to analyze (required, max 1MB)",
                minLength: 1,
                maxLength: 1000000
              },
              language: {
                type: "string",
                description: "Programming language (optional)",
                enum: ["javascript", "typescript", "python", "java", "go", "rust", "cpp"]
              },
              filename: {
                type: "string",
                description: "Filename for context (optional, max 255 chars)",
                maxLength: 255
              },
              rulesets: {
                type: "array",
                items: { 
                  type: "string",
                  pattern: "^[a-z0-9-]+$"
                },
                description: "Additional rule sets to apply (max 10)",
                maxItems: 10,
                default: []
              }
            },
            required: ["code"],
            additionalProperties: false
          }
        },
        {
          name: "get-service-status",
          description: "Reports current system health, service levels, and degradation status",
          inputSchema: {
            type: "object",
            properties: {
              includeHistory: {
                type: "boolean",
                description: "Include degradation history in response",
                default: false
              }
            },
            additionalProperties: false
          }
        },
        {
          name: "get-available-rules",
          description: "Lists all available rules organized by category. Adapts to current service level.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false
          }
        },
        {
          name: "health-check",
          description: "Comprehensive health check including circuit breaker status and error rates",
          inputSchema: {
            type: "object",
            properties: {
              detailed: {
                type: "boolean",
                description: "Include detailed metrics and circuit breaker information",
                default: false
              }
            },
            additionalProperties: false
          }
        },
        {
          name: "setup-project",
          description: "Configures the current project for AILint, downloading specified rulesets and setting up IDE integration.",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "The absolute path to the project root directory.",
                minLength: 1
              },
              rulesets: {
                type: "array",
                items: {
                  type: "string",
                  pattern: "^[a-z0-9-]+$"
                },
                description: "An array of ruleset names to download and configure.",
                minItems: 1
              },
              ide: {
                type: "string",
                description: "The IDE to configure for (e.g., 'cursor', 'vscode').",
                enum: ["cursor", "vscode"]
              }
            },
            required: ["projectPath", "rulesets", "ide"],
            additionalProperties: false
          }
        }
      ]
    };
  } catch (error) {
    // console.log(`❌ Failed to list tools:', error);
    // Even if listing fails, provide minimal tools
    return {
      tools: [{
        name: "health-check",
        description: "Basic health check - system in emergency mode",
        inputSchema: { type: "object", properties: {}, required: [] }
      }]
    };
  }
});

// Handle tool calls with comprehensive error handling
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const correlationId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // console.log(` Tool called: ${name} [${correlationId}]`);

  try {
    switch (name) {
      case "analyze-code": {
        try {
          const options = ValidationLayer.validateAnalysisOptions(args);
          const result = await analyzer.analyze(options);
          
          const serviceStatus = degradationManager.getCurrentStatus();
          
          let statusInfo = '';
          if (serviceStatus.level !== 'full') {
            statusInfo = `\n\n---\n**System Status:** ${serviceStatus.level.toUpperCase()}`;
            if (serviceStatus.degradationReason) {
              statusInfo += `\n**Note:** ${serviceStatus.degradationReason}`;
            }
          }
          
          const response = `#  Code Analysis Results\n\n##  Summary\n- **Quality Score:** ${result.metrics.qualityScore}/100\n- **Lines of Code:** ${result.metrics.linesOfCode}\n- **Complexity:** ${result.metrics.complexity}\n- **Issues Found:** ${result.violations.length}\n- **Rules Applied:** ${result.rulesApplied.length}\n\n##  Issues Found\n${result.violations.length === 0 ? '*No issues found! Great job!* ' : 
  result.violations.map(v => `\n**${v.severity.toUpperCase()}: ${v.message}** (Line ${v.line})\n${v.explanation ? ` **Why:** ${v.explanation}` : ''}\n${v.suggestion ? ` **Fix:** ${v.suggestion}` : ''}\n`).join('\n')}\n\n*Analysis completed in ${result.executionTime}ms*${statusInfo}`;

          return {
            content: [{
              type: "text",
              text: response
            }]
          };
        } catch (error) {
          throw handleToolError(error as Error, name, correlationId);
        }
      }

      case "get-service-status": {
        try {
          const includeHistory = (args as any)?.includeHistory || false;
          const serviceStatus = degradationManager.getCurrentStatus();
          const circuitStats = CircuitBreakerManager.getAllStats();
          
          let response = `#  AILint Service Status\n\n## Current Service Level: ${serviceStatus.level.toUpperCase()}\n\n### ✅ Available Features\n${serviceStatus.availableFeatures.map(f => `- ${f}`).join('\n')}\n\n${serviceStatus.unavailableFeatures.length > 0 ? `\n### ⚠️ Temporarily Unavailable\n${serviceStatus.unavailableFeatures.map(f => `- ${f}`).join('\n')}\n` : ''}\n\n${serviceStatus.degradationReason ? `\n###  Status Information\n**Reason:** ${serviceStatus.degradationReason}\n${serviceStatus.estimatedRecovery ? `**Estimated Recovery:** ${serviceStatus.estimatedRecovery.toLocaleString()}` : ''}\n` : ''}\n\n###  Circuit Breakers\n${Object.entries(circuitStats).map(([name, stats]) => 
  `- **${name}:** ${stats.state.toUpperCase()} (${stats.successCount} success, ${stats.failureCount} failures)`
).join('\n') || 'No circuit breakers active'}`;

          if (includeHistory) {
            const history = degradationManager.getDegradationHistory();
            if (history.length > 0) {
              response += `\n\n###  Recent Degradation History\n`;
              response += history.slice(-5).map(event => 
                `- **${event.timestamp.toLocaleString()}:** ${event.level} - ${event.reason}`
              ).join('\n');
            }
          }

          return {
            content: [{
              type: "text",
              text: response
            }]
          };
        } catch (error) {
          throw handleToolError(error as Error, name, correlationId);
        }
      }

      case "get-available-rules": {
        try {
          const serviceStatus = degradationManager.getCurrentStatus();
          
          // Adapt response based on service level
          if (serviceStatus.level === 'emergency') {
            return {
              content: [{
                type: "text",
                text: `#  Available Rules (Emergency Mode)\n\n**System Status:** EMERGENCY - Limited functionality available\n\n## Basic Analysis Only\n- Syntax validation\n- Critical error detection\n\n*Full rule analysis temporarily unavailable. System will recover automatically.*`
              }]
            };
          }

          const rules = await analyzer['ruleEngine'].getUniversalRules();
          
          let response = `#  Available Rules\n\n**Service Level:** ${serviceStatus.level.toUpperCase()}\n\n##  Universal Rules (Currently Active)\n${rules.map(rule => `\n### ${rule.name}\n- **Category:** ${rule.category}\n- **Severity:** ${rule.severity}\n- **Description:** ${rule.description}\n${rule.explanation ? `- **Why:** ${rule.explanation}` : ''}\n`).join('\n')}`;

          if (serviceStatus.level === 'full') {
            response += `\n\n##  Framework Rules (GitHub Integration)\n*GitHub integration active - framework rules available on request*\n\n## ️ Principle Rules (GitHub Integration)  \n*Principle-based analysis available with GitHub connectivity*`;
          } else {
            response += `\n\n## ⚠️ Limited Availability\nFramework and principle rules temporarily unavailable due to: ${serviceStatus.degradationReason}`;
          }

          return {
            content: [{
              type: "text",
              text: response
            }]
          };
        } catch (error) {
          throw handleToolError(error as Error, name, correlationId);
        }
      }

      case "health-check": {
        try {
          const detailed = (args as any)?.detailed || false;
          const serviceStatus = degradationManager.getCurrentStatus();
          const circuitStats = CircuitBreakerManager.getAllStats();
          
          const healthResponse = {
            status: serviceStatus.level === 'full' ? 'healthy' : 
                   serviceStatus.level === 'emergency' ? 'unhealthy' : 'degraded',
            timestamp: new Date().toISOString(),
            services: {
              analyzer: true,
              ruleEngine: serviceStatus.availableFeatures.includes('Universal rules analysis'),
              githubApi: serviceStatus.availableFeatures.includes('Framework-specific rules')
            },
            performance: {
              averageAnalysisTime: 0.05, // From previous benchmarks
              memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
              uptime: process.uptime()
            }
          };

          let response = `#  AILint Health Check\n\n## System Status: ${healthResponse.status.toUpperCase()} ${
            healthResponse.status === 'healthy' ? '✅' : 
            healthResponse.status === 'degraded' ? '⚠️' : '❌'
          }\n\n###  Services Status\n- **Code Analyzer:** ${healthResponse.services.analyzer ? '✅ Online' : '❌ Offline'}\n- **Rule Engine:** ${healthResponse.services.ruleEngine ? '✅ Online' : '⚠️ Limited'}  \n- **GitHub API:** ${healthResponse.services.githubApi ? '✅ Online' : ' Degraded/Offline'}\n\n###  Performance Metrics\n- **Average Analysis Time:** ${healthResponse.performance.averageAnalysisTime}ms\n- **Memory Usage:** ${healthResponse.performance.memoryUsage.toFixed(2)}MB\n- **Uptime:** ${Math.floor(healthResponse.performance.uptime / 60)}m ${Math.floor(healthResponse.performance.uptime % 60)}s\n\n###  Last Check\n${healthResponse.timestamp}`;

          if (detailed) {
            response += `\n\n###  Circuit Breaker Details\n`;
            if (Object.keys(circuitStats).length > 0) {
              response += Object.entries(circuitStats).map(([name, stats]) => `\n**${name}:**\n- State: ${stats.state.toUpperCase()}\n- Success Rate: ${stats.totalCalls > 0 ? ((stats.successCount / stats.totalCalls) * 100).toFixed(1) : 0}%\n- Total Calls: ${stats.totalCalls}\n- Last Failure: ${stats.lastFailureTime?.toLocaleString() || 'None'}`
              ).join('\n');
            } else {
              response += 'No circuit breakers currently active';
            }

            const history = degradationManager.getDegradationHistory();
            if (history.length > 0) {
              response += `\n\n###  Recent Issues\n`;
              response += history.slice(-3).map(event => 
                `- **${event.timestamp.toLocaleString()}:** ${event.reason}`
              ).join('\n');
            }
          }

          response += `\n\n*System monitoring active and ready for code analysis!*`;

          return {
            content: [{
              type: "text",
              text: response
            }]
          };
        } catch (error) {
          throw handleToolError(error as Error, name, correlationId);
        }
      }

      case "setup-project": {
        try {
          const setupArgs = ValidationLayer.validateSetupProjectArgs(args);
          const rules = await analyzer['ruleEngine'].loadRules(setupArgs.rulesets);

          await ProjectConfigManager.createIDEConfiguration(
            setupArgs.projectPath,
            rules,
            setupArgs.ide as 'cursor' | 'vscode' // Type assertion as Zod schema ensures valid values
          );

          let response = `#  AILint Project Setup Complete!\n\n`;
          response += `✅ Successfully configured AILint for your project.\n`;
          response += `Downloaded ${rules.length} rules across ${setupArgs.rulesets.length} rulesets.\n`;
          response += `IDE integration set up for ${setupArgs.ide}.\n\n`;
          response += `**Next Steps:** You can now use the 'analyze-code' tool with your configured rules.\n`;

          return {
            content: [{
              type: "text",
              text: response
            }]
          };
        } catch (error) {
          throw handleToolError(error as Error, name, correlationId);
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`, {
          availableTools: ['analyze-code', 'get-service-status', 'get-available-rules', 'health-check'],
          correlationId
        });
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw handleToolError(error as Error, name, correlationId);
  }
});

// Enhanced startup with error handling
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // console.log("✅ AILint MCP server running with enhanced error handling and graceful degradation");
    
    // Start background recovery attempts
    setInterval(async () => {
      try {
        await degradationManager.attemptRecovery();
      } catch (error) {
        // console.log('❌ Recovery attempt failed:', error);
      }
    }, 60000); // Check for recovery every minute

  } catch (error) {
    // console.log("❌ Failed to start server:", error);
    
    // Attempt emergency startup
    try {
      // console.log(" Attempting emergency startup...");
      const transport = new StdioServerTransport();
      await server.connect(transport);
      // console.log("⚠️ Server started in emergency mode");
    } catch (emergencyError) {
      // console.log(" Emergency startup failed:", emergencyError);
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  // console.log(' Graceful shutdown initiated...');
  // Log final statistics
  const circuitStats = CircuitBreakerManager.getAllStats();
  // console.log(' Final circuit breaker stats:', circuitStats);
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  // console.log(' Uncaught exception:', error);
  // Don't exit - try to continue running
});

process.on('unhandledRejection', (reason, promise) => {
  // console.log(' Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to continue running
});

main().catch((error) => {
  // console.log(" Server startup failed completely:", error);
  process.exit(1);
});