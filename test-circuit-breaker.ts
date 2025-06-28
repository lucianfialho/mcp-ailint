import { CircuitBreakerManager, CircuitState } from './src/shared/circuit-breaker.js';

async function testCircuitBreaker() {
  console.log(' Testing circuit breaker pattern...');

  let failureCount = 0;
  const breakerName = 'test-service';

  // Test 4.1.1: Normal operation (CLOSED state)
  try {
    const result1 = await CircuitBreakerManager.executeWithBreaker(breakerName, async () => {
      return 'success';
    }, {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      halfOpenMaxCalls: 1
    });
    
    console.log('✅ Normal operation:', {
      success: result1 === 'success'
    });
  } catch (error) {
    console.log('❌ Normal operation failed:', error.message);
  }

  // Test 4.1.2: Force failures to open circuit
  for (let i = 0; i < 5; i++) {
    try {
      await CircuitBreakerManager.executeWithBreaker(breakerName, async () => {
        failureCount++;
        throw new Error(`Failure ${failureCount}`);
      });
    } catch (error) {
      // Expected failures
    }
  }

  let stats = CircuitBreakerManager.getAllStats()[breakerName];
  console.log('✅ Circuit opening test:', {
    circuitOpened: stats.state === CircuitState.OPEN,
    hasFailures: stats.failureCount >= 3,
    totalCalls: stats.totalCalls > 0
  });

  // Test 4.1.3: Circuit OPEN - should reject immediately
  try {
    await CircuitBreakerManager.executeWithBreaker(breakerName, async () => {
      return 'should not execute';
    });
    console.log('❌ Circuit should be open and reject calls');
  } catch (error) {
    console.log('✅ Circuit OPEN rejection:', {
      rejected: error.message.includes('OPEN'),
      serviceUnavailable: error.message.includes('unavailable')
    });
  }

  // Test 4.1.4: Wait for recovery timeout and test HALF_OPEN
  console.log('⏳ Waiting for recovery timeout...');
  await new Promise(resolve => setTimeout(resolve, 1200)); // Wait longer than recovery timeout

  // First call after timeout should transition to HALF_OPEN
  try {
    const result = await CircuitBreakerManager.executeWithBreaker(breakerName, async () => {
      return 'recovery test';
    });
    console.log('✅ Recovery test:', {
      recovered: result === 'recovery test'
    });
  } catch (error) {
    console.log('❌ Recovery failed:', error.message);
  }

  // Test 4.1.5: Final stats check
  stats = CircuitBreakerManager.getAllStats()[breakerName];
  console.log('✅ Final circuit breaker stats:', {
    state: stats.state,
    hasSuccesses: stats.successCount > 0,
    hasFailures: stats.failureCount > 0,
    hasLastFailureTime: !!stats.lastFailureTime,
    hasLastSuccessTime: !!stats.lastSuccessTime,
    totalCalls: stats.totalCalls
  });

  // Test 4.1.6: Manual reset
  CircuitBreakerManager.resetAll();
  const resetStats = CircuitBreakerManager.getAllStats()[breakerName];
  console.log('✅ Manual reset test:', {
    circuitClosed: resetStats.state === CircuitState.CLOSED,
    countersReset: resetStats.failureCount === 0 && resetStats.successCount === 0
  });
}

testCircuitBreaker().catch(console.error);