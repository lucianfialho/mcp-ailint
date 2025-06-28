import { RetryManager } from './src/shared/retry.js';
import { GitHubAPIError, AnalysisError, ConfigurationError } from './src/shared/errors.js';

async function testRetryManager() {
  console.log(' Testing retry manager...');

  let attemptCount = 0;

  // Test 3.1.1: Successful retry after failures
  const result1 = await RetryManager.executeWithRetry(async () => {
    attemptCount++;
    if (attemptCount < 3) {
      throw new GitHubAPIError('Temporary failure', 500, false, '/api/test');
    }
    return 'Success after retries';
  }, {
    maxAttempts: 5,
    baseDelay: 10, // Fast for testing
    retryCondition: (error) => error instanceof GitHubAPIError
  });

  console.log('✅ Successful retry test:', {
    success: result1.success === true,
    attempts: result1.attempts === 3,
    hasResult: result1.result === 'Success after retries',
    noError: !result1.error,
    reasonableDuration: result1.totalDuration < 1000 // Should be fast with 10ms delays
  });

  // Test 3.1.2: Non-retryable error
  attemptCount = 0;
  const result2 = await RetryManager.executeWithRetry(async () => {
    attemptCount++;
    throw new ConfigurationError('Invalid config', 'test.key', 'string');
  }, {
    maxAttempts: 3,
    baseDelay: 10,
    retryCondition: (error) => error instanceof GitHubAPIError // Won't match ConfigurationError
  });

  console.log('✅ Non-retryable error test:', {
    failed: result2.success === false,
    singleAttempt: result2.attempts === 1, // Should not retry
    hasError: !!result2.error,
    correctErrorType: result2.error instanceof ConfigurationError
  });

  // Test 3.1.3: Max attempts reached
  attemptCount = 0;
  const result3 = await RetryManager.executeWithRetry(async () => {
    attemptCount++;
    throw new AnalysisError('Always fails', 'code', 'js');
  }, {
    maxAttempts: 3,
    baseDelay: 10,
    retryCondition: (error) => error instanceof AnalysisError
  });

  console.log('✅ Max attempts test:', {
    failed: result3.success === false,
    maxAttempts: result3.attempts === 3,
    hasError: !!result3.error,
    correctErrorType: result3.error instanceof AnalysisError
  });

  // Test 3.1.4: GitHub-specific retry
  attemptCount = 0;
  const result4 = await RetryManager.retryGitHubOperation(async () => {
    attemptCount++;
    if (attemptCount < 2) {
      throw new GitHubAPIError('Rate limited', 429, true, '/api/rules');
    }
    return 'GitHub operation success';
  });

  console.log('✅ GitHub retry test:', {
    success: result4.success === true,
    attempts: result4.attempts === 2,
    hasResult: result4.result === 'GitHub operation success'
  });

  // Test 3.1.5: Analysis-specific retry (should have fewer attempts)
  attemptCount = 0;
  const result5 = await RetryManager.retryAnalysisOperation(async () => {
    attemptCount++;
    throw new AnalysisError('Analysis fails', 'code', 'js');
  });

  console.log('✅ Analysis retry test:', {
    failed: result5.success === false,
    limitedAttempts: result5.attempts <= 2, // Analysis should have max 2 attempts
    hasError: !!result5.error
  });
}

testRetryManager().catch(console.error);