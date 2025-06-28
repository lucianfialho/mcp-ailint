export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalCalls: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private totalCalls = 0;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      halfOpenMaxCalls: 3
    }
  ) {}

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
              // console.error(` Circuit breaker ${this.name} entering HALF_OPEN state`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - service unavailable`);
      }
    }

    if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
      throw new Error(`Circuit breaker ${this.name} is in HALF_OPEN with max calls reached`);
    }

    this.totalCalls++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // If we've had enough successful calls, close the circuit
      if (this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
            // console.error(`✅ Circuit breaker ${this.name} recovered - returning to CLOSED state`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open means the service is still down
      this.state = CircuitState.OPEN;
          // console.error(`❌ Circuit breaker ${this.name} failed in HALF_OPEN - returning to OPEN state`);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.failureCount >= this.options.failureThreshold) {
        this.state = CircuitState.OPEN;
            // console.error(` Circuit breaker ${this.name} opened due to ${this.failureCount} failures`);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.options.recoveryTimeout;
  }

  public getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls
    };
  }

  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
        // console.error(` Circuit breaker ${this.name} manually reset`);
  }
}

// Global circuit breakers for different services
export class CircuitBreakerManager {
  private static breakers = new Map<string, CircuitBreaker>();

  public static getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  public static async executeWithBreaker<T>(
    breakerName: string,
    operation: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.getBreaker(breakerName, options);
    return breaker.execute(operation);
  }

  public static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  public static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}