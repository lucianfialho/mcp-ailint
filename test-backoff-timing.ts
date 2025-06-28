import { RetryManager } from './src/shared/retry.js';
import { AnalysisError } from './src/shared/errors.js';

async function testBackoffTiming() {
  console.log(' Testing exponential backoff and jitter...');

  let attemptTimes: number[] = [];
  let attemptCount = 0;

  const startTime = Date.now();
  
  const result = await RetryManager.executeWithRetry(async () => {
    attemptCount++;
    attemptTimes.push(Date.now() - startTime);
    throw new AnalysisError('Always fails for timing test', 'code', 'js');
  }, {
    maxAttempts: 4,
    baseDelay: 100, // 100ms base
    maxDelay: 1000, // 1 second max
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => error instanceof AnalysisError
  });

  // Calculate delays between attempts
  const delays = [];
  for (let i = 1; i < attemptTimes.length; i++) {
    delays.push(attemptTimes[i] - attemptTimes[i-1]);
  }

  console.log('✅ Backoff timing test:', {
    maxAttemptsReached: result.attempts === 4,
    hasDelays: delays.length === 3, // 3 delays for 4 attempts
    delaysIncrease: delays.length > 1 ? delays[1] > delays[0] : true, // Should increase
    delaysWithinRange: delays.every(delay => delay >= 50 && delay <= 1500), // With jitter
    totalDuration: result.totalDuration,
    individualDelays: delays
  });
}

testBackoffTiming().catch(console.error);