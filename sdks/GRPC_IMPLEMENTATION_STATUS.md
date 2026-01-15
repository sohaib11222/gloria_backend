# gRPC Implementation Status

## Overview

This document tracks the gRPC transport implementation status across all SDKs.

## Implementation Status

### ✅ Node.js/TypeScript SDK - **COMPLETE**

**Status**: Fully implemented and production-ready

**Features**:
- ✅ Dynamic proto loading (no code generation required)
- ✅ Insecure and mTLS support
- ✅ Bearer token authentication
- ✅ All service methods implemented
- ✅ Error handling and timeout support
- ✅ Automatic proto file discovery

**Location**: `sdks/nodejs-agent/src/transport/GrpcTransport.ts`

**Usage**:
```typescript
const config = Config.forGrpc({
  host: 'localhost:50052',
  token: 'your-jwt-token',
  // Certificates optional (uses insecure by default)
});

const client = new CarHireClient(config);
```

### ⚠️ Python SDK - **STUBBED**

**Status**: Stub implementation (can follow Node.js pattern)

**Next Steps**:
1. Implement using `grpcio` and `protobuf`
2. Use dynamic proto loading similar to Node.js
3. Support both insecure and mTLS connections

**Location**: `sdks/python-agent/carhire/transport/grpc.py`

### ⚠️ Go SDK - **STUBBED**

**Status**: Stub implementation

**Next Steps**:
1. Generate proto stubs: `protoc --go_out=. --go-grpc_out=. agent_ingress.proto`
2. Implement transport using generated stubs
3. Support both insecure and mTLS connections

**Location**: `sdks/go-agent/grpc_transport.go`

### ⚠️ Java SDK - **STUBBED**

**Status**: Stub implementation

**Next Steps**:
1. Generate proto stubs using `protoc` with Java plugin
2. Implement transport using generated stubs
3. Support both insecure and mTLS connections

**Location**: `sdks/java-agent/src/main/java/com/carhire/sdk/transport/GrpcTransport.java`

### ⚠️ PHP SDK - **STUBBED**

**Status**: Stub implementation

**Next Steps**:
1. Use `grpc/grpc` PHP extension
2. Implement dynamic proto loading or use generated stubs
3. Support both insecure and mTLS connections

**Location**: `sdks/php-agent/src/Transport/GrpcTransport.php`

### ⚠️ Perl SDK - **STUBBED**

**Status**: Stub implementation

**Next Steps**:
1. Use `Grpc` Perl module
2. Implement dynamic proto loading or use generated stubs
3. Support both insecure and mTLS connections

**Location**: `sdks/perl-agent/lib/CarHire/SDK/Transport/GrpcTransport.pm`

## Reference Implementation

The **Node.js SDK** serves as the reference implementation. Other SDKs should follow the same patterns:

1. **Dynamic Proto Loading**: Use proto-loader/equivalent to avoid code generation
2. **Optional Certificates**: Make mTLS optional (default to insecure)
3. **Bearer Token Auth**: Use metadata header "authorization" with Bearer token
4. **Error Handling**: Map gRPC errors to SDK exceptions
5. **Timeout Support**: Respect `callTimeoutMs` configuration

## Backend Configuration

### Default Setup (Insecure)

```bash
# Backend uses insecure by default
GRPC_PUBLIC_PORT=50052
GRPC_TLS_ENABLED=false  # Default
```

### Production Setup (mTLS)

```bash
GRPC_PUBLIC_PORT=50052
GRPC_TLS_ENABLED=true
GRPC_TLS_CA=./certs/ca.pem
GRPC_TLS_CERT=./certs/server.pem
GRPC_TLS_KEY=./certs/server.key
```

## Proto File

**Location**: `protos/agent_ingress.proto`

**Service**: `AgentIngressService`

**Methods**:
- `SubmitAvailability` - Submit availability request
- `PollAvailability` - Poll availability results
- `CreateBooking` - Create booking
- `ModifyBooking` - Modify booking
- `CancelBooking` - Cancel booking
- `CheckBooking` - Check booking status
- `ListAgreements` - List agreements (optional helper)

## Authentication

All gRPC calls require Bearer token authentication via metadata:

```typescript
metadata.add('authorization', `Bearer ${token}`);
```

Optional headers:
- `x-api-key` - API key (alternative to token)
- `x-agent-id` - Agent identifier
- `x-correlation-id` - Correlation ID for tracing

## Testing

### Test gRPC Connection

```bash
# Using grpcurl (if installed)
grpcurl -plaintext -H "authorization: Bearer YOUR_TOKEN" \
  localhost:50052 list

# Test health check
grpcurl -plaintext -H "authorization: Bearer YOUR_TOKEN" \
  localhost:50052 grpc.health.v1.Health/Check
```

### Test from Node.js SDK

```typescript
const config = Config.forGrpc({
  host: 'localhost:50052',
  token: 'your-token',
});

const client = new CarHireClient(config);

// Test availability submit
const criteria = AvailabilityCriteria.make({...});
const result = await client.getAvailability().search(criteria).next();
console.log('gRPC test successful:', result);
```

## Migration Guide

### From REST to gRPC

1. Change config from `Config.forRest()` to `Config.forGrpc()`
2. Update `baseUrl` to `host` (include port: `host:port`)
3. Ensure proto file is accessible
4. Test connection
5. No code changes needed - same API surface!

```typescript
// Before (REST)
const config = Config.forRest({
  baseUrl: 'https://api.example.com',
  token: 'token',
});

// After (gRPC)
const config = Config.forGrpc({
  host: 'api.example.com:50052',
  token: 'token',
});

// Client usage is identical!
const client = new CarHireClient(config);
```

## Performance Considerations

### gRPC Advantages

- **Binary Protocol**: More efficient than JSON
- **HTTP/2**: Multiplexing, header compression
- **Streaming**: Native support for streaming responses
- **Type Safety**: Strong typing via proto definitions

### When to Use gRPC

- High-throughput scenarios
- Low-latency requirements
- Internal service-to-service communication
- When streaming is beneficial

### When to Use REST

- Simpler debugging (human-readable JSON)
- Browser/client compatibility
- Firewall-friendly (standard HTTP)
- Easier integration with existing tools

## Production Checklist

- [ ] Backend gRPC server is running
- [ ] Port is accessible (default: 50052)
- [ ] Authentication credentials are valid
- [ ] Proto file is accessible from application
- [ ] Network connectivity verified
- [ ] Error handling implemented
- [ ] Monitoring/alerting configured
- [ ] mTLS enabled for production (if required)

## Support

For implementation questions:
1. Reference Node.js SDK implementation
2. Check `PRODUCTION_SETUP.md` for deployment guide
3. Review backend `publicServer.ts` for service implementation
4. Test with `grpcurl` for debugging

