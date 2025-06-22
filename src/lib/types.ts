// Core analysis types
export interface CodeAnalysisResult {
  violations: Violation[]
  suggestions: Suggestion[]
  metrics: CodeMetrics
  appliedRules: string[]
  summary: string
}

export interface Violation {
  rule: string
  category: RuleCategory
  line?: number
  column?: number
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
  example?: BeforeAfter
}

export interface Suggestion {
  type: 'refactor' | 'security' | 'performance' | 'maintainability'
  title: string
  description: string
  codeExample?: BeforeAfter
}

export interface CodeMetrics {
  linesOfCode: number
  complexity: number
  maintainabilityIndex: number
  technicalDebt: 'low' | 'medium' | 'high'
}

// Rule system types
export interface Rule {
  name: string
  category: RuleCategory
  description: string
  version: string
  triggers: TriggerPattern[]
  constraints: Constraint[]
  examples: BeforeAfter
  severity: 'error' | 'warning' | 'info'
}

export type RuleCategory = 'universal' | 'framework' | 'principle' | 'security' | 'performance'

export interface TriggerPattern {
  type: 'regex' | 'ast' | 'keyword'
  pattern: string
  context?: string
}

export interface Constraint {
  type: 'forbidden' | 'required' | 'limit'
  pattern: string
  message: string
  suggestion?: string
}

export interface BeforeAfter {
  bad: string
  good: string
  explanation?: string
}

// Project configuration types
export interface ProjectConfig {
  projectPath: string
  rulesets: string[]
  ide: string
  customRules?: string[]
}

export interface ProjectSetupResult {
  success: boolean
  rulesDownloaded: string[]
  configCreated: string
  autoAttachEnabled: boolean
  nextSteps: string
  error?: string
}

// API response types
export interface GitHubRuleResponse {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string
  type: 'file' | 'dir'
  content?: string
  encoding?: string
}

export interface AvailableRules {
  universal: string[]
  frameworks: string[]
  principles: string[]
  security: string[]
}