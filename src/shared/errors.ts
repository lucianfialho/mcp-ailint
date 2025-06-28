import { z } from 'zod';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  VALIDATION = 'validation',
  ANALYSIS = 'analysis', 
  EXTERNAL_SERVICE = 'external_service',
  RESOURCE = 'resource',
  CONFIGURATION = 'configuration',
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication'
}

export abstract class AILintError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly severity: ErrorSeverity;
  abstract readonly recoverable: boolean;
  abstract readonly retryable: boolean;
  
  public readonly timestamp: Date;
  public readonly correlationId: string;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.correlationId = this.generateCorrelationId();
    this.context = context;
    
    if (cause) {
      this.cause = cause;
    }
  }

  private generateCorrelationId(): string {
    return `ailint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      recoverable: this.recoverable,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      context: this.context,
      stack: this.stack
    };
  }

  public getUserFriendlyMessage(): string {
    return this.message; // Override in subclasses for user-friendly messages
  }

  public getRecoveryActions(): string[] {
    return []; // Override in subclasses to provide recovery actions
  }
}

// Specific Error Classes
export class ValidationError extends AILintError {
  readonly category = ErrorCategory.VALIDATION;
  readonly severity = ErrorSeverity.MEDIUM;
  readonly recoverable = true;
  readonly retryable = false;

  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly input?: unknown
  ) {
    super(message, { issues, input });
  }

  public getUserFriendlyMessage(): string {
    const fieldErrors = this.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return `Please check your input: ${fieldErrors}`;
  }

  public getRecoveryActions(): string[] {
    return [
      'Verify all required fields are provided',
      'Check that field values meet the specified requirements',
      'Ensure data types match the expected format'
    ];
  }
}

export class AnalysisError extends AILintError {
  readonly category = ErrorCategory.ANALYSIS;
  readonly severity = ErrorSeverity.HIGH;
  readonly recoverable = true;
  readonly retryable = true;

  constructor(
    message: string,
    public readonly code?: string,
    public readonly language?: string,
    cause?: Error
  ) {
    super(message, { code: code?.substring(0, 100), language }, cause);
  }

  public getUserFriendlyMessage(): string {
    return `Code analysis failed: ${this.message}. This might be due to complex code patterns or syntax issues.`;
  }

  public getRecoveryActions(): string[] {
    return [
      'Check that the code has valid syntax',
      'Try analyzing a smaller code snippet',
      'Verify the programming language is correctly specified',
      'Retry the analysis - this might be a temporary issue'
    ];
  }
}

export class GitHubAPIError extends AILintError {
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly severity = ErrorSeverity.MEDIUM;
  readonly recoverable = true;
  readonly retryable = true;

  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly rateLimited?: boolean,
    public readonly endpoint?: string
  ) {
    super(message, { statusCode, rateLimited, endpoint });
  }

  public getUserFriendlyMessage(): string {
    if (this.rateLimited) {
      return 'GitHub API rate limit reached. Using local rules for now.';
    }
    if (this.statusCode === 404) {
      return 'Requested rules not found. Using available local rules.';
    }
    return 'GitHub service temporarily unavailable. Using local rules for analysis.';
  }

  public getRecoveryActions(): string[] {
    const actions = ['Analysis will continue with universal rules'];
    
    if (this.rateLimited) {
      actions.push('Wait for rate limit to reset (usually within an hour)');
    } else {
      actions.push('Check internet connection');
      actions.push('Retry in a few moments');
    }
    
    return actions;
  }
}

export class RuleLoadError extends AILintError {
  readonly category = ErrorCategory.RESOURCE;
  readonly severity = ErrorSeverity.LOW;
  readonly recoverable = true;
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly ruleset: string,
    public readonly source: 'github' | 'local' | 'cache' = 'github',
    cause?: Error
  ) {
    super(message, { ruleset, source }, cause);
    // Determine retryability based on the cause
    if (cause instanceof GitHubAPIError && (cause.statusCode === 401 || cause.statusCode === 404)) {
      this.retryable = false; // Don't retry if the underlying GitHub error is a 401/404
    } else {
      this.retryable = true; // Otherwise, it might be a transient issue
    }
  }

  public getUserFriendlyMessage(): string {
    return `Unable to load "${this.ruleset}" rules. Continuing with available rules.`;
  }

  public getRecoveryActions(): string[] {
    return [
      'Analysis will proceed with universal rules',
      'Check internet connection for remote rules',
      'Verify ruleset name spelling'
    ];
  }
}

export class ConfigurationError extends AILintError {
  readonly category = ErrorCategory.CONFIGURATION;
  readonly severity = ErrorSeverity.HIGH;
  readonly recoverable = false;
  readonly retryable = false;

  constructor(
    message: string,
    public readonly configKey?: string,
    public readonly expectedType?: string
  ) {
    super(message, { configKey, expectedType });
  }

  public getUserFriendlyMessage(): string {
    return `Configuration issue: ${this.message}. Please check your setup.`;
  }

  public getRecoveryActions(): string[] {
    return [
      'Review your project configuration',
      'Check environment variables and settings',
      'Consult the documentation for proper setup'
    ];
  }
}

export class ResourceExhaustionError extends AILintError {
  readonly category = ErrorCategory.RESOURCE;
  readonly severity = ErrorSeverity.CRITICAL;
  readonly recoverable = true;
  readonly retryable = false;

  constructor(
    message: string,
    public readonly resourceType: 'memory' | 'cpu' | 'disk' | 'network',
    public readonly currentUsage?: number,
    public readonly limit?: number
  ) {
    super(message, { resourceType, currentUsage, limit });
  }

  public getUserFriendlyMessage(): string {
    return `System resources are running low (${this.resourceType}). Analysis may be slower or limited.`;
  }

  public getRecoveryActions(): string[] {
    return [
      'Try analyzing smaller code snippets',
      'Close other applications to free up resources',
      'Wait a moment and try again'
    ];
  }
}