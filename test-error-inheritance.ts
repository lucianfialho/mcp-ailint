import { AILintError, ValidationError, AnalysisError } from './src/shared/errors.js';

async function testErrorInheritance() {
  console.log(' Testing error inheritance...');

  const errors: AILintError[] = [
    new ValidationError('Test validation', []),
    new AnalysisError('Test analysis', 'code', 'js')
  ];

  for (const [index, error] of errors.entries()) {
    console.log(`✅ Error ${index + 1} inheritance:`, {
      isAILintError: error instanceof AILintError,
      hasCategory: typeof error.category === 'string',
      hasSeverity: typeof error.severity === 'string',
      hasRecoverable: typeof error.recoverable === 'boolean',
      hasRetryable: typeof error.retryable === 'boolean',
      hasUserFriendlyMessage: typeof error.getUserFriendlyMessage === 'function',
      hasRecoveryActions: Array.isArray(error.getRecoveryActions()),
      hasToJSON: typeof error.toJSON === 'function'
    });
  }
}

testErrorInheritance().catch(console.error);