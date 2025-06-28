import { GracefulDegradationManager, ServiceLevel } from './src/shared/degradation.js';
import { GitHubAPIError, ResourceExhaustionError, AnalysisError, ErrorSeverity } from './src/shared/errors.js';

async function testGracefulDegradation() {
  console.log(' Testing graceful degradation system...');

  const degradationManager = new GracefulDegradationManager();

  // Test 2.1.1: Initial state (should be FULL)
  const initialStatus = degradationManager.getCurrentStatus();
  console.log('✅ Initial service state:', {
    level: initialStatus.level === ServiceLevel.FULL,
    hasAvailableFeatures: initialStatus.availableFeatures.length > 0,
    noUnavailableFeatures: initialStatus.unavailableFeatures.length === 0
  });

  // Test 2.1.2: GitHub API failure → DEGRADED
  const githubError = new GitHubAPIError('API unavailable', 503, false, '/api/rules');
  const githubStatus = await degradationManager.handleError(githubError);
  
  console.log('✅ GitHub failure degradation:', {
    level: githubStatus.level === ServiceLevel.DEGRADED,
    hasReason: !!githubStatus.degradationReason,
    hasEstimatedRecovery: !!githubStatus.estimatedRecovery,
    availableFeatures: githubStatus.availableFeatures.length > 0,
    unavailableFeatures: githubStatus.unavailableFeatures.length > 0,
    reasonMentionsGitHub: githubStatus.degradationReason?.includes('GitHub') || false
  });

  // Test 2.1.3: Resource exhaustion → further degradation
  const resourceError = new ResourceExhaustionError(
    'High memory usage detected',
    'memory',
    150,
    100
  );
  // Temporarily override severity to test analysis-simplification
  (resourceError as any).severity = ErrorSeverity.MEDIUM;
  const resourceStatus = await degradationManager.handleError(resourceError);
  
  console.log('✅ Resource exhaustion degradation:', {
    level: resourceStatus.level === ServiceLevel.DEGRADED,
    hasResourceReason: resourceStatus.degradationReason?.includes('Resource') || false,
    reducedFeatures: resourceStatus.availableFeatures.length === 4 // simplifyAnalysis provides 4 features
  });

  // Test 2.1.4: Critical error → EMERGENCY
  const criticalError = new ResourceExhaustionError('Critical system failure', 'memory', 500, 100);
  const emergencyStatus = await degradationManager.handleError(criticalError);
  
  console.log('✅ Emergency degradation:', {
    level: emergencyStatus.level === ServiceLevel.EMERGENCY,
    minimalFeatures: emergencyStatus.availableFeatures.length === 3,
    noEstimatedRecovery: !emergencyStatus.estimatedRecovery,
    maxUnavailableFeatures: emergencyStatus.unavailableFeatures.length > 0
  });

  // Test 2.1.5: Degradation history tracking
  const history = degradationManager.getDegradationHistory();
  console.log('✅ Degradation history:', {
    hasEntries: history.length > 0,
    entriesHaveTimestamp: history.every(h => h.timestamp instanceof Date),
    entriesHaveLevel: history.every(h => typeof h.level === 'string'),
    entriesHaveReason: history.every(h => typeof h.reason === 'string')
  });

  // Test 2.1.6: Recovery attempt (should fail due to recent degradation)
  const recoveryResult = await degradationManager.attemptRecovery();
  console.log('✅ Recovery attempt (should fail):', {
    recoveryFailed: recoveryResult === false // Should be false due to recent degradation
  });
}

testGracefulDegradation().catch(console.error);