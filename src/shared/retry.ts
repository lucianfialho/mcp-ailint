import { AILintError, GitHubAPIError, RuleLoadError } from './errors.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

export class RetryManager {
  private static defaultOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      if (error instanceof AILintError) {
        return error.retryable;
      }
      return false; // Don't retry unknown errors by default
    }
  };

  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let lastError: Error;
    let finalAttempt = 0;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      finalAttempt = attempt;
      try {
                // console.error(` Attempt ${attempt}/${config.maxAttempts}`);
        
        const result = await operation();
        
        return {
          success: true,
          result,
          attempts: attempt,
          totalDuration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;
        
                // console.error(`❌ Attempt ${attempt} failed:`, lastError.message);
                // console.error(`  Retry condition for attempt ${attempt}: ${config.retryCondition!(lastError)}`);

        // Check if we should retry
        if (attempt === config.maxAttempts || !config.retryCondition!(lastError)) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, config);
                // console.error(`⏳ Waiting ${delay}ms before retry...`);
        
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError!,
      attempts: finalAttempt,
      totalDuration: Date.now() - startTime
    };
  }

  private static calculateDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = Math.min(
      options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1),
      options.maxDelay
    );

    if (options.jitter) {
      // Add random jitter (±25% of the delay)
      const jitterRange = exponentialDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, exponentialDelay + jitter);
    }

    return exponentialDelay;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Specialized retry for GitHub API calls
  public static async retryGitHubOperation<T>(
    operation: () => Promise<T>
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(operation, {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryCondition: (error) => {
                // console.error(`  Retry condition evaluation for error: ${error.name}`);
        if (error instanceof AILintError) {
                    // console.error(`  Error is AILintError. Category: ${error.category}, Retryable: ${error.retryable}`);

          // If the error itself is a GitHubAPIError, check its status code
          if (error instanceof GitHubAPIError) {
                      // console.error(`  Error is GitHubAPIError. Status Code: ${error.statusCode}`);
            if (error.statusCode === 401 || error.statusCode === 404) {
                          // console.error(`  Returning false for GitHubAPIError 401/404.`);
              return false; // Don't retry on authentication errors or 404s
            }
          }

          // If the error is a RuleLoadError, check its cause
          if (error instanceof RuleLoadError && error.cause) {
                      // console.error(`  Error is RuleLoadError. Checking cause: ${error.cause.constructor.name}`);
            if (error.cause instanceof GitHubAPIError) {
              const causeError = error.cause as GitHubAPIError;
                            // console.error(`  Cause is GitHubAPIError. Status Code: ${causeError.statusCode}`);
              if (causeError.statusCode === 401 || causeError.statusCode === 404) {
                                // console.error(`  Returning false for GitHubAPIError in cause (401/404).`);
                return false; // Don't retry on authentication errors or 404s
              }
            }
          }

          // Otherwise, rely on the error's retryable property
                    // console.error(`  Returning error.retryable: ${error.retryable}`);
          return error.retryable;
        }
                // console.error(`  Error is not AILintError. Returning false.`);
        return false; // Don't retry unknown errors by default
      }
    });
  }

  // Specialized retry for analysis operations
  public static async retryAnalysisOperation<T>(
    operation: () => Promise<T>
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(operation, {
      maxAttempts: 2, // Don't retry analysis too many times
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2,
      retryCondition: (error) => {
        if (error instanceof AILintError && error.category === 'analysis') {
          // Only retry if it's not a validation or configuration error
          return error.retryable;
        }
        return false;
      }
    });
  }
}