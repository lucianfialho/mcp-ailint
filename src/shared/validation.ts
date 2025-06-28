import { z } from 'zod';
import { 
  AnalysisOptionsSchema, 
  AnalysisResultSchema, 
  SetupProjectArgsSchema,
  HealthCheckResponseSchema,
  AnalysisOptions, AnalysisResult, SetupProjectArgs, HealthCheckResponse
} from './schemas.js';

import { AILintError, ErrorCategory, ErrorSeverity } from './errors.js';

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

  public getFormattedErrors(): string {
    return this.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      issues: this.issues,
      formattedErrors: this.getFormattedErrors()
    };
  }
}

export class ValidationLayer {
  /**
   * Validates analysis options with detailed error reporting
   */
  static validateAnalysisOptions(input: unknown): AnalysisOptions {
    const result = AnalysisOptionsSchema.safeParse(input);
    
    if (!result.success) {
      throw new ValidationError(
        'Invalid analysis options provided',
        result.error.issues,
        input
      );
    }
    
    return result.data;
  }

  /**
   * Validates analysis result before returning to user
   */
  static validateAnalysisResult(result: unknown): AnalysisResult {
    const validationResult = AnalysisResultSchema.safeParse(result);
    
    if (!validationResult.success) {
      throw new ValidationError(
        'Internal error: Invalid analysis result generated',
        validationResult.error.issues,
        result
      );
    }
    
    return validationResult.data;
  }

  /**
   * Validates setup project arguments
   */
  static validateSetupProjectArgs(input: unknown): SetupProjectArgs {
    const result = SetupProjectArgsSchema.safeParse(input);
    
    if (!result.success) {
      throw new ValidationError(
        'Invalid project setup arguments',
        result.error.issues,
        input
      );
    }
    
    return result.data;
  }

  /**
   * Validates health check response
   */
  static validateHealthCheckResponse(response: unknown): HealthCheckResponse {
    const result = HealthCheckResponseSchema.safeParse(response);
    
    if (!result.success) {
      throw new ValidationError(
        'Invalid health check response',
        result.error.issues,
        response
      );
    }
    
    return result.data;
  }

  /**
   * Generic safe validation with success/error result
   */
  static safeValidate<T>(
    schema: z.ZodSchema<T>, 
    input: unknown
  ): { success: true; data: T } | { success: false; error: ValidationError } {
    const result = schema.safeParse(input);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return {
        success: false,
        error: new ValidationError(
          'Validation failed',
          result.error.issues,
          input
        )
      };
    }
  }

  /**
   * Batch validation for multiple inputs
   */
  static validateBatch<T>(
    schema: z.ZodSchema<T>,
    inputs: unknown[]
  ): { valid: T[]; errors: { index: number; error: ValidationError }[] } {
    const valid: T[] = [];
    const errors: { index: number; error: ValidationError }[] = [];

    inputs.forEach((input, index) => {
      const result = this.safeValidate(schema, input);
      if (result.success) {
        valid.push(result.data);
      } else {
        errors.push({ index, error: result.error });
      }
    });

    return { valid, errors };
  }

  /**
   * Transform validation errors into user-friendly MCP error format
   */
  static formatMCPError(error: ValidationError): {
    code: string;
    message: string;
    data?: any;
  } {
    return {
      code: 'VALIDATION_ERROR',
      message: `Input validation failed: ${error.getFormattedErrors()}`,
      data: {
        issues: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }
    };
  }
}

// Export commonly used schemas for external use
export {
  AnalysisOptionsSchema,
  AnalysisResultSchema,
  SetupProjectArgsSchema,
  HealthCheckResponseSchema
} from './schemas.js';
