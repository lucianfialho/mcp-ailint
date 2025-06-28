import { GracefulDegradationManager, ServiceLevel } from './src/shared/degradation.js';
import { GitHubAPIError } from './src/shared/errors.js';

async function testFeatureAvailability() {
  console.log(' Testing feature availability mapping...');

  const degradationManager = new GracefulDegradationManager();

  // Test different service levels and their feature sets
  const testScenarios = [
    {
      name: 'Full Service',
      error: null,
      expectedLevel: ServiceLevel.FULL,
      shouldHaveFeatures: ['Complete code analysis', 'Framework-specific analysis'],
      shouldNotHaveUnavailable: true
    },
    {
      name: 'GitHub Degradation',
      error: new GitHubAPIError('GitHub down', 503),
      expectedLevel: ServiceLevel.DEGRADED,
      shouldHaveFeatures: ['Universal rules analysis', 'Basic code metrics'],
      shouldHaveUnavailable: ['Framework-specific rules']
    }
  ];

  for (const scenario of testScenarios) {
    let status;
    if (scenario.error) {
      status = await degradationManager.handleError(scenario.error);
    } else {
      status = degradationManager.getCurrentStatus();
    }

    const hasExpectedFeatures = scenario.shouldHaveFeatures.every(feature =>
      status.availableFeatures.some(available => available.includes(feature))
    );

    const hasExpectedUnavailable = scenario.shouldHaveUnavailable ? 
      scenario.shouldHaveUnavailable.every(feature =>
        status.unavailableFeatures.some(unavailable => unavailable.includes(feature))
      ) : status.unavailableFeatures.length === 0;

    console.log(`✅ ${scenario.name}:`, {
      correctLevel: status.level === scenario.expectedLevel,
      hasExpectedFeatures,
      hasExpectedUnavailable,
      featureCount: status.availableFeatures.length,
      unavailableCount: status.unavailableFeatures.length
    });
  }
}

testFeatureAvailability().catch(console.error);