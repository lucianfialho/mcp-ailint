import { CircuitBreakerManager } from './src/shared/circuit-breaker.js';

async function testMultipleBreakers() {
  console.log(' Testing multiple circuit breakers...');

  const services = ['github-api', 'rule-engine', 'analyzer'];
  
  // Create different failure patterns for each service
  const promises = [];
  for (const [index, service] of services.entries()) {
    const shouldFail = index === 1; // Only rule-engine fails
    
    promises.push(CircuitBreakerManager.executeWithBreaker(service, async () => {
      if (shouldFail) {
        throw new Error(`${service} failure`);
      }
      return `${service} success`;
    }, {
      failureThreshold: 1 // Quick failure for testing
    }).catch(error => { /* Expected for rule-engine */ }));
  }
  await Promise.all(promises);

  const allStats = CircuitBreakerManager.getAllStats();
  
  console.log('✅ Multiple breakers test:', {
    hasMultipleBreakers: Object.keys(allStats).length === services.length,
    githubWorking: allStats['github-api']?.successCount > 0,
    ruleEngineFailing: allStats['rule-engine']?.failureCount > 0,
    analyzerWorking: allStats['analyzer']?.successCount > 0,
    independentStates: Object.values(allStats).some(stats => stats.state !== allStats['github-api'].state)
  });
}

testMultipleBreakers().catch(console.error);