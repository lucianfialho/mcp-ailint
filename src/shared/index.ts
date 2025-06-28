// Re-export all shared functionality with error handling
export * from './schemas.js';
export * from './validation.js';
export * from './analyzer.js';
export * from './rule-engine.js';
export * from './errors.js';
export * from './degradation.js';
export * from './retry.js';
export * from './circuit-breaker.js';
export * from './metrics.js';

// Re-export commonly used types for convenience
export type {
  AnalysisOptions,
  AnalysisResult,
  Violation,
  CodeMetrics,
  Rule,
  ProjectConfig
} from './schemas.js';

export type {
  AILintError,
  ValidationError,
  AnalysisError,
  GitHubAPIError,
  RuleLoadError,
  ConfigurationError,
  ResourceExhaustionError,
  ErrorSeverity,
  ErrorCategory
} from './errors.js';

export type {
  ServiceLevel,
  ServiceStatus,
  DegradationStrategy
} from './degradation.js';

export type {
  RetryOptions,
  RetryResult
} from './retry.js';

export type {
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerStats
} from './circuit-breaker.js';

export type {
  PerformanceMetrics
} from './metrics.js';
export { MetricsCollector } from './metrics.js';
export { RuleParser } from './rule-parser.js';
export { IntelligentCache, RuleCache, IndexCache } from './cache.js';
export { ProjectConfigManager } from '../cli/projectConfig.js';

export type {
  CacheConfig,
  CacheStats,
  RulesetIndexEntry
} from './cache.js';
