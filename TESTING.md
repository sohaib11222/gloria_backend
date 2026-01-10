# Testing Guide

## Overview

This guide covers testing procedures for the Car Hire Middleware, including functional tests, integration tests, and scaling tests.

## Test Data Setup

### Seed Test Data

```bash
npm run tsx scripts/seed-test-data.ts
```

This creates:
- Test admin user (admin@test.com / admin123)
- Test agents (agent1@test.com, agent2@test.com / agent123)
- Test sources (source1@test.com, source2@test.com / source123)
- Test agreements (TEST-AGR-001, TEST-AGR-002)
- Test locations (GBMAN, GBGLA, USNYC, USLAX, FRPAR)

## Functional Tests

### Manual Testing

1. **Start Backend**:
   ```bash
   npm run dev
   ```

2. **Start Agent Frontend**:
   ```bash
   cd ../gloriaconnect_agent
   npm run dev
   ```

3. **Test Availability Flow**:
   - Login as agent1@test.com
   - Navigate to Availability Test page
   - Submit availability request
   - Verify polling works
   - Check results display

4. **Test Booking Flow**:
   - Create booking from availability result
   - Check booking status
   - Modify booking
   - Cancel booking

### Integration Tests

Run integration tests:

```bash
cd tests/integration
npm install
npm test
```

Tests cover:
- Availability submit/poll flow
- Booking create/modify/cancel/check
- Agreement listing
- Error handling

## Load Testing

### Run Load Test

```bash
npm run tsx scripts/load-test.ts
```

### Configure Load Test

Set environment variables:

```bash
export BASE_URL=http://localhost:8080
export TOKEN="Bearer <your-token>"
export AGENT_ID=test-agent
export AGREEMENT_REFS=TEST-AGR-001,TEST-AGR-002
export CONCURRENT_REQUESTS=10
export REQUESTS_PER_SECOND=5
export DURATION_SECONDS=60

npm run tsx scripts/load-test.ts
```

### Load Test Scenarios

1. **Light Load**:
   - Concurrent: 5
   - RPS: 2
   - Duration: 30s

2. **Medium Load**:
   - Concurrent: 10
   - RPS: 5
   - Duration: 60s

3. **Heavy Load**:
   - Concurrent: 50
   - RPS: 20
   - Duration: 120s

## Scaling Tests

### Test Objectives

1. **Response Time**: Average < 500ms for availability submit
2. **Throughput**: Handle 100+ requests/second
3. **Concurrent Connections**: Support 1000+ concurrent connections
4. **Memory Usage**: Stable under load
5. **Database Performance**: Query times < 100ms

### Test Procedure

1. **Baseline Test**:
   ```bash
   # Single instance
   npm run tsx scripts/load-test.ts
   ```

2. **Scaled Test**:
   ```bash
   # Multiple instances behind load balancer
   # Run load test against load balancer
   ```

3. **Monitor Metrics**:
   - Prometheus: `http://localhost:8080/metrics`
   - Application logs
   - Database slow query log
   - System resources (CPU, memory, network)

### Key Metrics to Monitor

- Request latency (p50, p95, p99)
- Error rate
- Throughput (requests/second)
- Database connection pool usage
- Memory usage
- CPU usage
- gRPC connection count

## Performance Benchmarks

### Expected Performance

- **Availability Submit**: < 200ms
- **Availability Poll**: < 100ms (when results ready)
- **Booking Create**: < 300ms
- **Booking Check**: < 150ms

### Bottleneck Identification

1. **Database**: Monitor slow queries
2. **Network**: Check latency to sources
3. **gRPC**: Monitor connection pool
4. **Memory**: Watch for leaks

## Test Scenarios

### Scenario 1: Single Agent, Single Source

- 1 agent with 1 active agreement
- Submit availability request
- Verify single source responds
- Create booking
- Verify booking flow

### Scenario 2: Single Agent, Multiple Sources

- 1 agent with 2+ active agreements
- Submit availability request
- Verify multiple sources respond
- Check aggregation of results

### Scenario 3: Multiple Agents, Multiple Sources

- 2+ agents, each with multiple agreements
- Concurrent availability requests
- Verify isolation between agents
- Check no cross-contamination

### Scenario 4: Source Health Degradation

- Simulate slow source (add delay)
- Submit availability request
- Verify source exclusion after 3 strikes
- Verify backoff behavior

### Scenario 5: High Load

- 50+ concurrent requests
- Monitor system stability
- Check error rates
- Verify response times

## Continuous Testing

### Pre-Deployment

1. Run integration tests
2. Run load test (light)
3. Check code coverage
4. Verify no linting errors

### Post-Deployment

1. Smoke tests
2. Health check verification
3. Monitor metrics for 1 hour
4. Check error logs

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Remove test bookings
DELETE FROM Booking WHERE agentId IN (SELECT id FROM Company WHERE email LIKE '%@test.com');

-- Remove test agreements
DELETE FROM Agreement WHERE sourceId IN (SELECT id FROM Company WHERE email LIKE '%@test.com');

-- Remove test companies (optional)
DELETE FROM Company WHERE email LIKE '%@test.com';
```

## Troubleshooting Test Issues

### Tests Failing

1. Check database connection
2. Verify test data exists
3. Check API endpoints are accessible
4. Review error messages

### Load Test Issues

1. Verify sufficient resources
2. Check rate limiting
3. Monitor database connections
4. Review timeout settings

### Integration Test Issues

1. Ensure backend is running
2. Check authentication tokens
3. Verify test agreements exist
4. Review network connectivity

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Clean up test data after tests
3. **Realistic Data**: Use realistic test scenarios
4. **Monitoring**: Always monitor during load tests
5. **Documentation**: Document test results and findings

