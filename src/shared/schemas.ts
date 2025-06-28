import { z } from 'zod';

// Core Analysis Schemas
export const AnalysisOptionsSchema = z.object({
  code: z.string()
    .min(1, "Code cannot be empty")
    .max(1000000, "Code too large (max 1MB)"),
  language: z.string()
    .optional()
    .refine(lang => !lang || ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp'].includes(lang), {
      message: "Unsupported language. Supported: javascript, typescript, python, java, go, rust, cpp"
    }),
  filename: z.string()
    .optional()
    .refine(name => !name || name.length <= 255, {
      message: "Filename too long (max 255 characters)"
    }),
  rulesets: z.array(z.string())
    .default([])
    .refine(sets => sets.length <= 10, {
      message: "Too many rulesets (max 10)"
    })
    .refine(sets => sets.every(set => /^[a-z0-9-]+$/.test(set)), {
      message: "Ruleset names must contain only lowercase letters, numbers, and hyphens"
    })
});

export const ViolationSchema = z.object({
  type: z.enum(['security', 'quality', 'architecture'], {
    errorMap: () => ({ message: "Type must be 'security', 'quality', or 'architecture'" })
  }),
  severity: z.enum(['info', 'warning', 'error'], {
    errorMap: () => ({ message: "Severity must be 'info', 'warning', or 'error'" })
  }),
  line: z.number()
    .int("Line must be an integer")
    .min(1, "Line number must be positive"),
  column: z.number()
    .int("Column must be an integer")
    .min(1, "Column number must be positive")
    .optional(),
  message: z.string()
    .min(1, "Violation message cannot be empty")
    .max(500, "Violation message too long (max 500 chars)"),
  suggestion: z.string()
    .max(1000, "Suggestion too long (max 1000 chars)")
    .optional(),
  explanation: z.string()
    .max(2000, "Explanation too long (max 2000 chars)")
    .optional()
});

export const CodeMetricsSchema = z.object({
  linesOfCode: z.number()
    .int("Lines of code must be an integer")
    .min(0, "Lines of code cannot be negative"),
  complexity: z.number()
    .int("Complexity must be an integer") 
    .min(1, "Complexity must be at least 1"),
  maintainabilityIndex: z.number()
    .min(0, "Maintainability index cannot be negative")
    .max(100, "Maintainability index cannot exceed 100"),
  qualityScore: z.number()
    .min(0, "Quality score cannot be negative")
    .max(100, "Quality score cannot exceed 100")
});

export const AnalysisResultSchema = z.object({
  violations: z.array(ViolationSchema),
  metrics: CodeMetricsSchema,
  rulesApplied: z.array(z.string()),
  executionTime: z.number()
    .min(0, "Execution time cannot be negative")
});

export const RuleSchema = z.object({
  id: z.string()
    .min(1, "Rule ID cannot be empty")
    .max(100, "Rule ID too long")
    .regex(/^[a-z0-9-]+$/, "Rule ID must contain only lowercase letters, numbers, and hyphens"),
  name: z.string()
    .min(1, "Rule name cannot be empty")
    .max(100, "Rule name too long")
    .regex(/^[a-z0-9-]+$/, "Rule name must contain only lowercase letters, numbers, and hyphens"),
  description: z.string()
    .min(1, "Rule description cannot be empty")
    .max(500, "Rule description too long"),
  category: z.string()
    .min(1, "Rule category cannot be empty"),
  severity: z.enum(['info', 'warning', 'error']),
  pattern: z.union([
    z.string().min(1, "Pattern cannot be empty"),
    z.instanceof(RegExp)
  ]),
  explanation: z.string()
    .max(2000, "Rule explanation too long")
    .optional(),
  suggestion: z.string()
    .max(1000, "Rule suggestion too long")
    .optional()
});

export const ProjectConfigSchema = z.object({
  projectPath: z.string()
    .min(1, "Project path cannot be empty"),
  rulesets: z.array(z.string())
    .min(1, "At least one ruleset must be specified"),
  ide: z.enum(['cursor', 'windsurf', 'vscode', 'claude'], {
    errorMap: () => ({ message: "IDE must be 'cursor', 'windsurf', 'vscode', or 'claude'" })
  }),
  rulesPath: z.string().optional()
});

// Setup Project Schema (MCP Tool)
export const SetupProjectArgsSchema = z.object({
  projectPath: z.string()
    .min(1, "Project path is required")
    .refine(path => !path.includes('..'), {
      message: "Project path cannot contain '..' for security"
    }),
  rulesets: z.array(z.string())
    .min(1, "At least one ruleset is required")
    .max(10, "Maximum 10 rulesets allowed"),
  ide: z.string()
    .default('cursor')
    .refine(ide => ['cursor', 'windsurf', 'vscode', 'claude'].includes(ide), {
      message: "Invalid IDE specified"
    })
});

// Health Check Schema
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  services: z.object({
    analyzer: z.boolean(),
    ruleEngine: z.boolean(),
    githubApi: z.boolean()
  }),
  performance: z.object({
    averageAnalysisTime: z.number(),
    memoryUsage: z.number(),
    uptime: z.number()
  }).optional(),
  issues: z.array(z.string()).optional()
});

// Export type inference for TypeScript integration
export type AnalysisOptions = z.infer<typeof AnalysisOptionsSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type CodeMetrics = z.infer<typeof CodeMetricsSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type SetupProjectArgs = z.infer<typeof SetupProjectArgsSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
