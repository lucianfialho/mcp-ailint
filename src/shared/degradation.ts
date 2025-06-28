import { AILintError, ErrorSeverity, ErrorCategory } from './errors.js';

export enum ServiceLevel {
  FULL = 'full',           // All features available
  DEGRADED = 'degraded',   // Some features limited
  MINIMAL = 'minimal',     // Basic functionality only
  EMERGENCY = 'emergency'  // Critical features only
}

export interface ServiceStatus {
  level: ServiceLevel;
  availableFeatures: string[];
  unavailableFeatures: string[];
  degradationReason?: string;
  estimatedRecovery?: Date;
}

export interface DegradationStrategy {
  name: string;
  condition: (error: AILintError) => boolean;
  action: () => Promise<ServiceStatus>;
  description: string;
}

export class GracefulDegradationManager {
  private currentServiceLevel: ServiceLevel = ServiceLevel.FULL;
  private currentServiceStatus: ServiceStatus;
  private lastDegradation?: Date;

  constructor() {
    this.currentServiceStatus = this.getInitialFullServiceStatus();
  }

  private getInitialFullServiceStatus(): ServiceStatus {
    return {
      level: ServiceLevel.FULL,
      availableFeatures: [
        'Complete code analysis',
        'All rule sets (universal + GitHub)',
        'Advanced metrics calculation',
        'Educational explanations',
        'Detailed suggestions',
        'Framework-specific analysis'
      ],
      unavailableFeatures: []
    };
  }
  private degradationHistory: Array<{
    timestamp: Date;
    level: ServiceLevel;
    reason: string;
  }> = [];

  private strategies: DegradationStrategy[] = [
    {
      name: 'minimal-analysis',
      condition: (error) => error.severity === ErrorSeverity.CRITICAL,
      action: async () => this.enableMinimalAnalysis(),
      description: 'Provide basic analysis only when system is severely impacted'
    },
    {
      name: 'github-api-fallback',
      condition: (error) => error.category === ErrorCategory.EXTERNAL_SERVICE,
      action: async () => this.fallbackToLocalRules(),
      description: 'Use local rules when GitHub API is unavailable'
    },
    {
      name: 'analysis-simplification',
      condition: (error) => error.category === ErrorCategory.RESOURCE,
      action: async () => this.simplifyAnalysis(),
      description: 'Reduce analysis complexity to save resources'
    },
    {
      name: 'cache-only-mode',
      condition: (error) => error.category === ErrorCategory.NETWORK,
      action: async () => this.enableCacheOnlyMode(),
      description: 'Use only cached data when network is unavailable'
    }
  ];

  public async handleError(error: AILintError): Promise<ServiceStatus> {
    // Find applicable degradation strategy
    const strategy = this.strategies.find(s => s.condition(error));
    
    if (strategy) {
          // console.error(` Applying degradation strategy: ${strategy.name}`);
      this.recordDegradation(strategy.name, error.message);
      this.currentServiceStatus = await strategy.action();
      this.currentServiceLevel = this.currentServiceStatus.level;
      return this.currentServiceStatus;
    }

    // Default: maintain current service level
    return this.getCurrentStatus();
  }

  private async fallbackToLocalRules(): Promise<ServiceStatus> {
    this.currentServiceLevel = ServiceLevel.DEGRADED;
    
    return {
      level: ServiceLevel.DEGRADED,
      availableFeatures: [
        'Universal rules analysis',
        'Basic code metrics',
        'Syntax validation',
        'Local rule application'
      ],
      unavailableFeatures: [
        'Framework-specific rules (React, Vue, etc.)',
        'Principle-based rules (SOLID, DDD)',
        'Community-contributed rules',
        'Rule updates from GitHub'
      ],
      degradationReason: 'GitHub API unavailable - using local rules only',
      estimatedRecovery: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };
  }

  private async simplifyAnalysis(): Promise<ServiceStatus> {
    this.currentServiceLevel = ServiceLevel.DEGRADED;
    
    return {
      level: ServiceLevel.DEGRADED,
      availableFeatures: [
        'Basic syntax validation',
        'Core security rules',
        'Simple metrics calculation',
        'Essential quality checks'
      ],
      unavailableFeatures: [
        'Complex pattern analysis',
        'Advanced metrics calculation',
        'Comprehensive rule evaluation',
        'Deep code structure analysis'
      ],
      degradationReason: 'Resource constraints - simplified analysis mode',
      estimatedRecovery: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };
  }

  private async enableCacheOnlyMode(): Promise<ServiceStatus> {
    this.currentServiceLevel = ServiceLevel.MINIMAL;
    
    return {
      level: ServiceLevel.MINIMAL,
      availableFeatures: [
        'Cached rule analysis',
        'Previously downloaded rules',
        'Local rule validation',
        'Basic error reporting'
      ],
      unavailableFeatures: [
        'Real-time rule updates',
        'GitHub rule fetching',
        'Dynamic rule loading',
        'External service integration'
      ],
      degradationReason: 'Network connectivity issues - cache-only mode',
      estimatedRecovery: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    };
  }

  private async enableMinimalAnalysis(): Promise<ServiceStatus> {
    this.currentServiceLevel = ServiceLevel.EMERGENCY;
    
    return {
      level: ServiceLevel.EMERGENCY,
      availableFeatures: [
        'Syntax validation only',
        'Critical error detection',
        'Basic response generation'
      ],
      unavailableFeatures: [
        'Rule-based analysis',
        'Code metrics calculation',
        'Quality scoring',
        'Detailed suggestions',
        'Educational explanations'
      ],
      degradationReason: 'Critical system issues - emergency mode only',
      estimatedRecovery: undefined // Manual intervention required
    };
  }

  public getCurrentStatus(): ServiceStatus {
    return this.currentServiceStatus;
  }

  private recordDegradation(strategy: string, reason: string): void {
    this.lastDegradation = new Date();
    this.degradationHistory.push({
      timestamp: new Date(),
      level: this.currentServiceLevel,
      reason: `${strategy}: ${reason}`
    });

    // Keep only last 50 degradation events
    if (this.degradationHistory.length > 50) {
      this.degradationHistory = this.degradationHistory.slice(-50);
    }
  }

  public async attemptRecovery(): Promise<boolean> {
    if (this.currentServiceLevel === ServiceLevel.FULL) {
      return true; // Already at full service
    }

    // Simple recovery logic - in production this would be more sophisticated
    const timeSinceLastDegradation = this.lastDegradation 
      ? Date.now() - this.lastDegradation.getTime()
      : Infinity;

    // Auto-recover after 30 minutes of stability
    if (timeSinceLastDegradation > 30 * 60 * 1000) {
            // console.log(' Attempting service level recovery...');
      this.currentServiceLevel = ServiceLevel.FULL;
      return true;
    }

    return false;
  }

  public getDegradationHistory(): Array<{
    timestamp: Date;
    level: ServiceLevel;
    reason: string;
  }> {
    return [...this.degradationHistory];
  }
}