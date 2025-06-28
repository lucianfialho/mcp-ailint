export interface PerformanceMetrics {
  averageAnalysisTime: number;
  memoryUsage: number;
  uptime: number;
}

export class MetricsCollector {
  private static totalAnalyses = 0;
  private static totalExecutionTime = 0;
  private static errorCount = 0;

  public static recordAnalysis(executionTime: number, hadError: boolean): void {
    this.totalAnalyses++;
    this.totalExecutionTime += executionTime;
    if (hadError) {
      this.errorCount++;
    }
  }

  public static getMetrics() {
    const averageExecutionTime = this.totalAnalyses > 0 
      ? this.totalExecutionTime / this.totalAnalyses 
      : 0;
    const errorRate = this.totalAnalyses > 0 
      ? this.errorCount / this.totalAnalyses 
      : 0;

    return {
      totalAnalyses: this.totalAnalyses,
      totalExecutionTime: this.totalExecutionTime,
      errorCount: this.errorCount,
      averageExecutionTime,
      errorRate,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      uptime: process.uptime()
    };
  }

  public static reset(): void {
    this.totalAnalyses = 0;
    this.totalExecutionTime = 0;
    this.errorCount = 0;
  }
}