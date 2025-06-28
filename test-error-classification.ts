import {
  ValidationError,
  AnalysisError,
  GitHubAPIError,
  RuleLoadError,
  ResourceExhaustionError,
  ConfigurationError,
  ErrorSeverity,
  ErrorCategory
} from './src/shared/errors.js';

async function testErrorClassification() {
  console.log(' Testing error classification system...');

  // Test 1.1.1: ValidationError
  const validationError = new ValidationError(
    'Invalid input provided',
    [
      { path: ['code'], message: 'Required', code: 'invalid_type' },
      { path: ['language'], message: 'Invalid language', code: 'invalid_enum_value' }
    ],
    { invalidField: true }
  );

  console.log('✅ ValidationError test:', {
    category: validationError.category === ErrorCategory.VALIDATION,
    severity: validationError.severity === ErrorSeverity.MEDIUM,
    recoverable: validationError.recoverable === true,
    retryable: validationError.retryable === false,
    hasCorrelationId: !!validationError.correlationId,
    hasTimestamp: validationError.timestamp instanceof Date,
    userMessage: validationError.getUserFriendlyMessage(),
    recoveryActions: validationError.getRecoveryActions().length > 0
  });

  // Test 1.1.2: AnalysisError
  const analysisError = new AnalysisError(
    'Complex code analysis failed',
    'function test() { /* very complex code */ }',
    'javascript'
  );

  console.log('✅ AnalysisError test:', {
    category: analysisError.category === ErrorCategory.ANALYSIS,
    severity: analysisError.severity === ErrorSeverity.HIGH,
    recoverable: analysisError.recoverable === true,
    retryable: analysisError.retryable === true,
    hasCode: !!analysisError.code,
    hasLanguage: !!analysisError.language,
    userMessage: analysisError.getUserFriendlyMessage().includes('analysis failed')
  });

  // Test 1.1.3: GitHubAPIError
  const githubError = new GitHubAPIError(
    'Rate limit exceeded',
    429,
    true,
    '/repos/user/repo/contents/rules'
  );

  console.log('✅ GitHubAPIError test:', {
    category: githubError.category === ErrorCategory.EXTERNAL_SERVICE,
    severity: githubError.severity === ErrorSeverity.MEDIUM,
    rateLimited: githubError.rateLimited === true,
    statusCode: githubError.statusCode === 429,
    userMessage: githubError.getUserFriendlyMessage().includes('rate limit'),
    recoveryActions: githubError.getRecoveryActions().length > 0
  });

  // Test 1.1.4: ResourceExhaustionError
  const resourceError = new ResourceExhaustionError(
    'High memory usage detected',
    'memory',
    150,
    100
  );

  console.log('✅ ResourceExhaustionError test:', {
    category: resourceError.category === ErrorCategory.RESOURCE,
    severity: resourceError.severity === ErrorSeverity.CRITICAL,
    resourceType: resourceError.resourceType === 'memory',
    hasUsageData: resourceError.currentUsage === 150 && resourceError.limit === 100,
    userMessage: resourceError.getUserFriendlyMessage().includes('resources are running low')
  });

  // Test 1.1.5: ConfigurationError
  const configError = new ConfigurationError(
    'Invalid configuration key',
    'database.url',
    'string'
  );

  console.log('✅ ConfigurationError test:', {
    category: configError.category === ErrorCategory.CONFIGURATION,
    severity: configError.severity === ErrorSeverity.HIGH,
    recoverable: configError.recoverable === false,
    retryable: configError.retryable === false,
    hasConfigKey: configError.configKey === 'database.url'
  });

  // Test 1.1.6: Error JSON serialization
  const serialized = validationError.toJSON();
  console.log('✅ Error serialization test:', {
    hasName: !!serialized.name,
    hasMessage: !!serialized.message,
    hasCategory: !!serialized.category,
    hasSeverity: !!serialized.severity,
    hasTimestamp: !!serialized.timestamp,
    hasCorrelationId: !!serialized.correlationId,
    hasContext: !!serialized.context
  });
}

testErrorClassification().catch(console.error);