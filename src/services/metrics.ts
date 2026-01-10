import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Enable default metrics collection
collectDefaultMetrics({ register });

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// Adapter latency histogram
export const adapterLatency = new Histogram({
  name: 'adapter_latency_seconds',
  help: 'Duration of adapter calls in seconds',
  labelNames: ['source_id', 'operation', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// Source exclusion counter
export const sourceExclusionTotal = new Counter({
  name: 'source_exclusion_total',
  help: 'Total number of source exclusions due to health issues',
  labelNames: ['source_id', 'reason'],
});

// Active availability jobs gauge
export const activeAvailabilityJobs = new Gauge({
  name: 'active_availability_jobs',
  help: 'Number of currently active availability jobs',
});

// Booking operations counter
export const bookingOperationsTotal = new Counter({
  name: 'booking_operations_total',
  help: 'Total number of booking operations',
  labelNames: ['operation', 'status', 'source_id'],
});

// Verification operations counter
export const verificationOperationsTotal = new Counter({
  name: 'verification_operations_total',
  help: 'Total number of verification operations',
  labelNames: ['type', 'status'],
});

// Source health status gauge
export const sourceHealthStatus = new Gauge({
  name: 'source_health_status',
  help: 'Source health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['source_id'],
});

// Agreement status gauge
export const agreementStatus = new Gauge({
  name: 'agreement_status',
  help: 'Number of agreements by status',
  labelNames: ['status'],
});

// Company status gauge
export const companyStatus = new Gauge({
  name: 'company_status',
  help: 'Number of companies by status',
  labelNames: ['type', 'status'],
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(adapterLatency);
register.registerMetric(sourceExclusionTotal);
register.registerMetric(activeAvailabilityJobs);
register.registerMetric(bookingOperationsTotal);
register.registerMetric(verificationOperationsTotal);
register.registerMetric(sourceHealthStatus);
register.registerMetric(agreementStatus);
register.registerMetric(companyStatus);

export { register };
