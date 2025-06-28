export interface AnalysisOptions {
  code: string;
  language?: string;
  filename?: string;
  rulesets?: string[];
}

export interface Violation {
  type: 'security' | 'quality' | 'architecture';
  severity: 'info' | 'warning' | 'error';
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
  explanation?: string;
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  qualityScore: number;
}

export interface AnalysisResult {
  violations: Violation[];
  metrics: CodeMetrics;
  rulesApplied: string[];
  executionTime: number;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  pattern: string | RegExp;
  explanation?: string;
  suggestion?: string;
}

export interface ProjectConfig {
  projectPath: string;
  rulesets: string[];
  ide: string;
  rulesPath?: string;
}
