# Production Setup Guide for Car-Hire Agent SDKs

This guide covers setting up and deploying the Car-Hire Agent SDKs in production environments.

## Overview

The SDKs support both REST and gRPC transports:
- **REST**: Fully implemented, production-ready, simpler to use
- **gRPC**: Implemented for Node.js (reference), others can follow the same pattern

## Prerequisites

1. Backend server running with gRPC enabled
2. Valid authentication token or API key
3. Active agreements configured
4. Network access to backend (HTTP and/or gRPC ports)

## Backend Configuration

### Environment Variables

```bash
# HTTP Server
PORT=8080

# gRPC Server (Agent Ingress)
GRPC_PUBLIC_PORT=50052

# TLS (optional, for production)
GRPC_TLS_ENABLED=false  # Set to true for mTLS
GRPC_TLS_CA=./certs/ca.pem
GRPC_TLS_CERT=./certs/server.pem
GRPC_TLS_KEY=./certs/server.key
```

### Default Ports

- **REST API**: `8080` (configurable via `PORT`)
- **gRPC Agent Ingress**: `50052` (configurable via `GRPC_PUBLIC_PORT`)

## SDK Configuration

### REST Transport (Recommended for Most Use Cases)

```typescript
// Node.js/TypeScript
import { Config, CarHireClient } from '@carhire/nodejs-sdk';

const config = Config.forRest({
  baseUrl: 'https://api.carhire.example.com',
  token: 'your-jwt-token',
  agentId: 'your-agent-id', // Optional
  callTimeoutMs: 10000,
  availabilitySlaMs: 120000,
  longPollWaitMs: 10000,
});

const client = new CarHireClient(config);
```

### gRPC Transport (Node.js)

```typescript
// Insecure connection (development/default)
const config = Config.forGrpc({
  host: 'api.carhire.example.com:50052',
  token: 'your-jwt-token',
  agentId: 'your-agent-id', // Optional
  callTimeoutMs: 10000,
});

// Secure connection (production with mTLS)
const config = Config.forGrpc({
  host: 'api.carhire.example.com:50052',
  token: 'your-jwt-token',
  caCert: fs.readFileSync('./certs/ca.pem', 'utf8'),
  clientCert: fs.readFileSync('./certs/client.pem', 'utf8'),
  clientKey: fs.readFileSync('./certs/client.key', 'utf8'),
  agentId: 'your-agent-id',
  callTimeoutMs: 10000,
});
```

## Authentication

### JWT Token

1. Register/login via REST API: `POST /auth/login`
2. Extract `access` token from response
3. Use token in SDK config

### API Key

1. Generate API key via admin interface
2. Use API key in SDK config (instead of token)

```typescript
const config = Config.forRest({
  baseUrl: 'https://api.carhire.example.com',
  apiKey: 'your-api-key',
  // token not needed when using apiKey
});
```

## Network Requirements

### Firewall Rules

Allow outbound connections to:
- **REST**: `https://api.carhire.example.com:8080` (or your configured port)
- **gRPC**: `api.carhire.example.com:50052` (or your configured port)

### DNS

Ensure backend hostname resolves correctly:
```bash
# Test DNS resolution
nslookup api.carhire.example.com
```

## Production Checklist

### Before Deployment

- [ ] Backend server is running and accessible
- [ ] Authentication credentials are valid
- [ ] Network connectivity verified (REST and/or gRPC)
- [ ] Agreements are configured and ACTIVE
- [ ] Error handling is implemented
- [ ] Logging is configured
- [ ] Monitoring/alerting is set up

### Security

- [ ] Use HTTPS for REST (not HTTP)
- [ ] Store credentials securely (environment variables, secrets manager)
- [ ] Enable mTLS for gRPC in production (set `GRPC_TLS_ENABLED=true`)
- [ ] Rotate tokens/keys regularly
- [ ] Use least-privilege API keys

### Performance

- [ ] Configure appropriate timeouts
- [ ] Implement retry logic for transient failures
- [ ] Use connection pooling (if applicable)
- [ ] Monitor latency and error rates

## Monitoring

### Key Metrics

- Request latency (p50, p95, p99)
- Error rates by type
- Availability search completion time
- Booking success rate
- Connection health (for gRPC)

### Health Checks

```typescript
// REST health check
const health = await fetch('https://api.carhire.example.com/health');
const status = await health.json();

// gRPC health check (if implemented)
// Use gRPC health service
```

## Troubleshooting

### Connection Issues

1. **REST**: Verify `baseUrl` is correct and accessible
2. **gRPC**: Verify `host` includes port (e.g., `host:port`)
3. Check firewall rules
4. Verify DNS resolution

### Authentication Errors

1. Verify token is valid and not expired
2. Check token format (should start with actual JWT, not "Bearer ")
3. Verify API key is active
4. Check backend logs for authentication failures

### gRPC Issues

1. **Proto file not found**: Ensure `agent_ingress.proto` is in `protos/` directory
2. **Connection refused**: Verify backend gRPC server is running
3. **TLS errors**: Check certificate paths and formats
4. **Timeout**: Increase `callTimeoutMs` if needed

## Deployment Examples

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy SDK
COPY sdks/nodejs-agent ./sdk

WORKDIR /app/sdk

# Install dependencies
RUN npm install

# Copy proto file
COPY protos ./protos

# Build
RUN npm run build

# Your application code
WORKDIR /app
COPY . .

CMD ["node", "index.js"]
```

### Kubernetes

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: carhire-sdk-config
data:
  API_BASE_URL: "https://api.carhire.example.com"
  GRPC_HOST: "api.carhire.example.com:50052"
---
apiVersion: v1
kind: Secret
metadata:
  name: carhire-credentials
type: Opaque
stringData:
  token: "your-jwt-token"
  # or
  api-key: "your-api-key"
```

## Support

For issues or questions:
1. Check SDK README files
2. Review `INTEGRATION_GUIDE.md`
3. Check backend logs
4. Contact support team

## Version Compatibility

- **SDK Version**: 1.0.0
- **Backend API**: Compatible with backend v1.0+
- **Proto Version**: agent_ingress.proto (latest)

