import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: "analyze-code",
    description: "Analyzes code for quality issues, security vulnerabilities, and architectural problems",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code to analyze"
        },
        language: {
          type: "string",
          description: "Programming language (optional)"
        },
        filename: {
          type: "string", 
          description: "Filename for context (optional)"
        },
        rulesets: {
          type: "array",
          items: { type: "string" },
          description: "Additional rule sets to apply"
        }
      },
      required: ["code"]
    }
  },
  {
    name: "get-available-rules",
    description: "Lists all available rules organized by category",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];
