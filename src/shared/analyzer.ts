import { AnalysisOptions, AnalysisResult, CodeMetrics, Violation } from './schemas.js';
import { ValidationLayer, ValidationError } from './validation.js';
import { RuleEngine } from './rule-engine.js';
import {
  AnalysisError,
  RuleLoadError,
  ResourceExhaustionError,
  AILintError 
} from './errors.js';
import { GracefulDegradationManager, ServiceLevel } from './degradation.js';
import { RetryManager } from './retry.js';
import { CircuitBreakerManager } from './circuit-breaker.js';

export class CodeAnalyzer {
  private ruleEngine: RuleEngine;
  private degradationManager: GracefulDegradationManager;

  constructor() {
    this.ruleEngine = new RuleEngine();
    this.degradationManager = new GracefulDegradationManager();
  }

  async analyze(options: unknown): Promise<AnalysisResult> {
    const correlationId = `analyze_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // console.error(` Starting analysis [${correlationId}]`);

    // Validate input using Zod schemas
    const validatedOptions = ValidationLayer.validateAnalysisOptions(options);
    
    const startTime = Date.now();
    
    // Check current service status
        // console.error(` Service level: ${this.degradationManager.getCurrentStatus().level}`);

    try {
      // Load rules with error handling and fallbacks
      const rules = await this.loadRulesWithFallback(validatedOptions.rulesets, correlationId);
      
      // Perform analysis with error handling
      const result = await this.performAnalysisWithRecovery(
        validatedOptions,
        rules,
        startTime,
        correlationId
      );

            // console.error(`✅ Analysis completed [${correlationId}] in ${result.executionTime}ms`);
      return ValidationLayer.validateAnalysisResult(result);

    } catch (error) {
          // console.error(`❌ Analysis failed [${correlationId}]:`, error);
      // Re-throw ValidationErrors directly so they can be handled by MCP server
      if (error instanceof ValidationError) {
        throw error;
      }
      return this.handleAnalysisFailure(error as Error, correlationId);
    }
  }

  private async loadRulesWithFallback(rulesets: string[], correlationId: string): Promise<any[]> {
    try {
      // Attempt to load rules with circuit breaker protection
      return await CircuitBreakerManager.executeWithBreaker(
        'rule-loading',
        async () => {
          return await RetryManager.executeWithRetry(
            async () => {
              const rules = await this.ruleEngine.loadRules(rulesets);
              if (rules.length === 0 && rulesets.length > 0) {
                throw new RuleLoadError(
                  `No rules loaded for rulesets: ${rulesets.join(', ')}`,
                  rulesets.join(','),
                  'github'
                );
              }
              return rules;
            }
          ).then(result => {
            if (!result.success) {
              throw result.error;
            }
            return result.result!;
          });
        },
        {
          failureThreshold: 3,
          recoveryTimeout: 30000, // 30 seconds
          monitoringPeriod: 300000, // 5 minutes
          halfOpenMaxCalls: 3
        }
      );
    } catch (error) {
          // console.error(`⚠️ Rule loading failed [${correlationId}], using fallback`);
      
      // Apply degradation strategy
      await this.degradationManager.handleError(
        error instanceof AILintError ? error : new RuleLoadError(
          'Failed to load external rules',
          rulesets.join(','),
          'github'
        )
      );

      // Fallback to universal rules only
            // console.error(` Falling back to universal rules only [${correlationId}]`);
      return await this.ruleEngine.getUniversalRules();
    }
  }

  private async performAnalysisWithRecovery(
    options: AnalysisOptions,
    rules: any[],
    startTime: number,
    correlationId: string
  ): Promise<AnalysisResult> {
    try {
      // Check resource usage before intensive operations
      await this.checkResourceConstraints();

      // Validate syntax if language is provided
      if (options.language) {
        const isValidSyntax = await this.validateSyntaxWithTimeout(options.code, options.language);
        
        if (!isValidSyntax) {
                  // console.error(`❌ Syntax validation failed [${correlationId}]`);
          return this.createFailureResult(
            'Syntax error detected in provided code',
            startTime,
            correlationId,
            'Check code syntax and try again'
          );
        }
      }

      // Apply rules with timeout protection
      const violations = await this.applyRulesWithTimeout(options.code, rules, correlationId);
      
      // Calculate metrics with resource monitoring
      const metrics = await this.calculateMetricsWithMonitoring(options.code);
      
      return {
        violations,
        metrics,
        rulesApplied: rules.map(r => r.name),
        executionTime: Date.now() - startTime
      };

    } catch (error) {
          // console.error(`❌ Analysis execution failed [${correlationId}]:`, error);
      
      if (error instanceof ResourceExhaustionError) {
        // Apply resource-based degradation
        await this.degradationManager.handleError(error);
        
        // Try simplified analysis
        return this.performSimplifiedAnalysis(options, startTime, correlationId);
      }

      throw new AnalysisError(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        options.code,
        options.language,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async checkResourceConstraints(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Check if memory usage is too high (>100MB for heap)
    if (heapUsedMB > 100) {
      throw new ResourceExhaustionError(
        `High memory usage detected: ${heapUsedMB.toFixed(2)}MB`,
        'memory',
        heapUsedMB,
        100
      );
    }

    // Check if heap is near limit (>80% of max)
    const heapTotal = memoryUsage.heapTotal / 1024 / 1024;
    if (heapUsedMB / heapTotal > 0.8) {
          // console.error(`⚠️ Memory usage high: ${(heapUsedMB / heapTotal * 100).toFixed(1)}%`);
    }
  }

  private async validateSyntaxWithTimeout(code: string, language: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
              // console.error('⏱️ Syntax validation timeout');
        resolve(false);
      }, 5000); // 5 second timeout

      try {
        if (language === 'javascript' || language === 'typescript') {
          // Basic syntax check for JS/TS
          new Function(code);
        }
        clearTimeout(timeout);
        resolve(true);
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  private async applyRulesWithTimeout(
    code: string, 
    rules: any[], 
    correlationId: string
  ): Promise<Violation[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new AnalysisError(
          'Rule application timeout - code may be too complex',
          code.substring(0, 100)
        ));
      }, 30000); // 30 second timeout for rule application

      try {
        const violations = this.ruleEngine.applyRules(code, rules);
        clearTimeout(timeout);
        resolve(violations);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async calculateMetricsWithMonitoring(code: string): Promise<CodeMetrics> {
    const startTime = Date.now();
    
    try {
      const lines = code.split('\n');
      const linesOfCode = lines.filter(line => line.trim().length > 0).length;
      
      // Monitor calculation time
      const complexity = this.calculateComplexity(code);
      const maintainabilityIndex = this.calculateMaintainabilityIndex(linesOfCode, complexity);
      const qualityScore = Math.max(0, Math.min(100, maintainabilityIndex));

      const calculationTime = Date.now() - startTime;
      if (calculationTime > 1000) {
              // console.error(`⚠️ Metrics calculation slow: ${calculationTime}ms`);
      }

      return {
        linesOfCode,
        complexity,
        maintainabilityIndex,
        qualityScore
      };
    } catch (error) {
          // console.error('❌ Metrics calculation failed, using defaults');
      return {
        linesOfCode: code.split('\n').length,
        complexity: 1,
        maintainabilityIndex: 50,
        qualityScore: 50
      };
    }
  }

  private async performSimplifiedAnalysis(
    options: AnalysisOptions,
    startTime: number,
    correlationId: string
  ): Promise<AnalysisResult> {
        // console.error(` Performing simplified analysis [${correlationId}]`);
    
    try {
      // Very basic analysis with minimal resource usage
      const lines = options.code.split('\n');
      const linesOfCode = lines.filter(line => line.trim().length > 0).length;
      
      const violations: Violation[] = [];
      
      // Only check for very basic issues
      if (options.code.includes('eval(')) {
        violations.push({
          type: 'security',
          severity: 'error',
          line: 1,
          message: 'Use of eval() detected',
          suggestion: 'Avoid eval() for security reasons',
          explanation: 'eval() can execute arbitrary code and is a security risk'
        });
      }

      return {
        violations,
        metrics: {
          linesOfCode,
          complexity: 1,
          maintainabilityIndex: 75, // Give benefit of doubt in simplified mode
          qualityScore: 75
        },
        rulesApplied: ['simplified-analysis'],
        executionTime: Date.now() - startTime
      };
    } catch (error) {
          // console.error(`❌ Even simplified analysis failed [${correlationId}]`);
      return this.createEmergencyResult(startTime, correlationId);
    }
  }

  private createFailureResult(
    message: string,
    startTime: number,
    correlationId: string,
    suggestion?: string
  ): AnalysisResult {
    return {
      violations: [{
        type: 'quality',
        severity: 'error',
        line: 1,
        message,
        suggestion,
        explanation: 'Analysis could not be completed due to issues with the provided code'
      }],
      metrics: {
        linesOfCode: 0,
        complexity: 1,
        maintainabilityIndex: 0,
        qualityScore: 0
      },
      rulesApplied: [],
      executionTime: Date.now() - startTime
    };
  }

  private createEmergencyResult(startTime: number, correlationId: string): AnalysisResult {
        // console.error(` Creating emergency result [${correlationId}]`);
    
    return {
      violations: [{
        type: 'quality',
        severity: 'warning',
        line: 1,
        message: 'Analysis temporarily unavailable due to system constraints',
        suggestion: 'Try again in a few moments or with a smaller code sample',
        explanation: 'The system is experiencing high load and cannot complete full analysis'
      }],
      metrics: {
        linesOfCode: 1,
        complexity: 1,
        maintainabilityIndex: 50,
        qualityScore: 50
      },
      rulesApplied: ['emergency-mode'],
      executionTime: Date.now() - startTime
    };
  }

  private async handleAnalysisFailure(error: Error, correlationId: string): Promise<AnalysisResult> {
        // console.error(` Handling analysis failure [${correlationId}]:`, error.message);

    // Apply degradation based on error type
    if (error instanceof AILintError) {
      await this.degradationManager.handleError(error);
    }

    // Return a meaningful error result instead of throwing
    return {
      violations: [{
        type: 'quality',
        severity: 'error',
        line: 1,
        message: error instanceof AILintError 
          ? error.getUserFriendlyMessage()
          : 'Analysis failed due to an unexpected error',
        suggestion: error instanceof AILintError 
          ? error.getRecoveryActions().join('; ')
          : 'Please try again or contact support if the issue persists',
        explanation: 'The analysis could not be completed. The system will attempt to recover automatically.'
      }],
      metrics: {
        linesOfCode: 0,
        complexity: 1,
        maintainabilityIndex: 0,
        qualityScore: 0
      },
      rulesApplied: [],
      executionTime: 0
    };
  }

  // Existing methods with error handling enhancements
  private calculateComplexity(code: string): number {
    try {
      const complexityPatterns = [
        /\bif\b/g,
        /\bwhile\b/g,
        /\bfor\b/g,
        /\bswitch\b/g,
        /\bcatch\b/g,
        /\?\s*.*\s*:/g
      ];
      
      let complexity = 1;
      for (const pattern of complexityPatterns) {
        const matches = code.match(pattern);
        complexity += matches ? matches.length : 0;
      }
      
      return Math.min(complexity, 100); // Cap complexity at 100
    } catch (error) {
          // console.error('❌ Complexity calculation failed:', error);
      return 1; // Safe default
    }
  }

  private calculateMaintainabilityIndex(loc: number, complexity: number): number {
    try {
      return Math.max(0, Math.min(100, 100 - (complexity * 2) - (loc * 0.1)));
    } catch (error) {
          // console.error('❌ Maintainability calculation failed:', error);
      return 50; // Safe default
    }
  }
}