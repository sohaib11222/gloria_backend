import axios from 'axios';

interface LoadTestConfig {
  baseUrl: string;
  token: string;
  agentId: string;
  agreementRefs: string[];
  concurrentRequests: number;
  requestsPerSecond: number;
  durationSeconds: number;
}

async function makeAvailabilityRequest(config: LoadTestConfig): Promise<{ success: boolean; duration: number }> {
  const startTime = Date.now();
  try {
    const submitResponse = await axios.post(
      `${config.baseUrl}/availability/submit`,
      {
        pickup_unlocode: 'GBMAN',
        dropoff_unlocode: 'GBGLA',
        pickup_iso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        dropoff_iso: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        driver_age: 30,
        residency_country: 'US',
        agreement_refs: config.agreementRefs,
      },
      {
        headers: {
          Authorization: config.token,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    const requestId = submitResponse.data.request_id;
    if (!requestId) {
      return { success: false, duration: Date.now() - startTime };
    }

    // Poll once
    await axios.get(`${config.baseUrl}/availability/poll`, {
      params: {
        request_id: requestId,
        since_seq: 0,
        wait_ms: 1000,
      },
      headers: {
        Authorization: config.token,
      },
      timeout: 6000,
    });

    return { success: true, duration: Date.now() - startTime };
  } catch (error) {
    return { success: false, duration: Date.now() - startTime };
  }
}

async function runLoadTest(config: LoadTestConfig) {
  console.log('🚀 Starting load test...');
  console.log(`Configuration:`);
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Concurrent Requests: ${config.concurrentRequests}`);
  console.log(`  Requests Per Second: ${config.requestsPerSecond}`);
  console.log(`  Duration: ${config.durationSeconds}s\n`);

  const results: Array<{ success: boolean; duration: number }> = [];
  const startTime = Date.now();
  const endTime = startTime + config.durationSeconds * 1000;
  let requestCount = 0;

  const interval = 1000 / config.requestsPerSecond;
  const promises: Promise<void>[] = [];

  while (Date.now() < endTime) {
    const batchStart = Date.now();
    const batch: Promise<void>[] = [];

    for (let i = 0; i < config.concurrentRequests; i++) {
      const promise = makeAvailabilityRequest(config).then((result) => {
        results.push(result);
        requestCount++;
      });
      batch.push(promise);
    }

    promises.push(...batch);
    await Promise.all(batch);

    const batchDuration = Date.now() - batchStart;
    const sleepTime = Math.max(0, interval - batchDuration);
    if (sleepTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  await Promise.all(promises);

  const totalDuration = (Date.now() - startTime) / 1000;
  const successful = results.filter((r) => r.success).length;
  const failed = results.length - successful;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const p95Duration = results
    .map((r) => r.duration)
    .sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

  console.log('\n📊 Load Test Results:');
  console.log(`  Total Requests: ${results.length}`);
  console.log(`  Successful: ${successful} (${((successful / results.length) * 100).toFixed(2)}%)`);
  console.log(`  Failed: ${failed} (${((failed / results.length) * 100).toFixed(2)}%)`);
  console.log(`  Average Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`  P95 Duration: ${p95Duration.toFixed(2)}ms`);
  console.log(`  Requests Per Second: ${(results.length / totalDuration).toFixed(2)}`);
  console.log(`  Total Duration: ${totalDuration.toFixed(2)}s`);
}

// Example usage
const config: LoadTestConfig = {
  baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  token: process.env.TOKEN || 'Bearer <token>',
  agentId: process.env.AGENT_ID || 'test-agent',
  agreementRefs: process.env.AGREEMENT_REFS?.split(',') || ['TEST-AGR-001'],
  concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || '10'),
  requestsPerSecond: parseInt(process.env.REQUESTS_PER_SECOND || '5'),
  durationSeconds: parseInt(process.env.DURATION_SECONDS || '60'),
};

if (require.main === module) {
  runLoadTest(config).catch((error) => {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  });
}

export { runLoadTest, LoadTestConfig };

