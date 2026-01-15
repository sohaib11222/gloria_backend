# gRPC Configuration Guide

This document explains how to configure gRPC transport for the Agent SDKs to connect to the Car Hire Middleware backend.

## Backend gRPC Server

The backend exposes a public gRPC server for agents:

- **Service**: `AgentIngressService` (defined in `protos/agent_ingress.proto`)
- **Default Port**: `50052` (configurable via `GRPC_PUBLIC_PORT` environment variable)
- **Default Address**: `0.0.0.0:50052` (listens on all interfaces)
- **Security**: Currently uses insecure credentials (no mTLS by default)

### Service Methods

The `AgentIngressService` provides the following RPC methods:

1. **SubmitAvailability** - Submit an availability search request
2. **PollAvailability** - Poll for availability results
3. **CreateBooking** - Create a new booking
4. **ModifyBooking** - Modify an existing booking
5. **CancelBooking** - Cancel a booking
6. **CheckBooking** - Check booking status
7. **ListAgreements** - List available agreements (optional helper)

## Proto File Location

The proto file for agents is located at:
- **Backend**: `src/grpc/proto/agent_ingress.proto`
- **SDKs**: `protos/agent_ingress.proto` (copied from backend)

All SDKs reference proto files from the `protos/` directory relative to the SDK root:
```
gloriaconnect_backend/
├── protos/
│   └── agent_ingress.proto  ← SDKs use this
└── sdks/
    └── nodejs-agent/
        └── src/
            └── proto/  ← Generated code goes here
```

## SDK Configuration

### Node.js SDK

```typescript
import { Config } from '@carhire/nodejs-sdk';

// For development (insecure connection)
const config = Config.forGrpc({
  host: 'localhost:50052',  // Backend gRPC public port
  // Note: mTLS certificates are required by Config validation
  // but backend currently uses insecure credentials
  // For development, you may need to modify Config validation
  // or use REST transport instead
  caCert: '',  // Not used with insecure
  clientCert: '',  // Not used with insecure
  clientKey: '',  // Not used with insecure
  agentId: 'ag_123',
  callTimeoutMs: 10000,
});
```

**Note**: The Node.js SDK's `Config.forGrpc()` currently requires certificates, but the backend uses insecure credentials by default. For development, you may need to:
1. Use REST transport instead
2. Modify the Config validation to make certificates optional
3. Enable mTLS on the backend (set `GRPC_TLS_ENABLED=true`)

### Python SDK

```python
from carhire import Config

config = Config.for_grpc({
    "host": "localhost:50052",
    "caCert": "",  # Optional if using insecure
    "clientCert": "",  # Optional if using insecure
    "clientKey": "",  # Optional if using insecure
    "agentId": "ag_123",
})
```

### Go SDK

```go
import "github.com/carhire/go-sdk"

config := sdk.ForGrpc(sdk.ConfigData{
    Host: "localhost:50052",
    // Certificates optional if backend uses insecure
    AgentId: "ag_123",
})
```

### PHP SDK

```php
use HMS\CarHire\Config;

$config = Config::forGrpc([
    'host' => 'localhost:50052',
    // Certificates optional if backend uses insecure
    'agentId' => 'ag_123',
]);
```

### Java SDK

```java
import com.carhire.sdk.Config;

Map<String, Object> configData = new HashMap<>();
configData.put("host", "localhost:50052");
// Certificates optional if backend uses insecure
configData.put("agentId", "ag_123");

Config config = Config.forGrpc(configData);
```

### Perl SDK

```perl
use CarHire::SDK::Config;

my $config = CarHire::SDK::Config->for_grpc({
    host => 'localhost:50052',
    # Certificates optional if backend uses insecure
    agentId => 'ag_123',
});
```

## Generating Proto Stubs

Each SDK needs to generate client stubs from the proto file:

### Node.js
```bash
cd sdks/nodejs-agent
npm run proto:gen
```

### Python
```bash
cd sdks/python-agent
python -m grpc_tools.protoc -I../../protos --python_out=. --grpc_python_out=. ../../protos/agent_ingress.proto
```

### Go
```bash
cd sdks/go-agent
protoc --go_out=. --go-grpc_out=. ../../protos/agent_ingress.proto
```

### PHP
```bash
cd sdks/php-agent
composer run proto:gen
```

### Java
```bash
cd sdks/java-agent
# Use protoc with Java plugin
protoc --java_out=src/main/java --grpc-java_out=src/main/java ../../protos/agent_ingress.proto
```

### Perl
```bash
cd sdks/perl-agent
protoc --perl_out=. --grpc_out=. --plugin=protoc-gen-perl=/path/to/perl-plugin ../../protos/agent_ingress.proto
```

## Authentication

The gRPC server expects authentication via Bearer token in metadata:

```typescript
// Example for Node.js
const metadata = new grpc.Metadata();
metadata.add('authorization', `Bearer ${jwtToken}`);
```

The backend extracts the token from the `authorization` metadata header and validates it using JWT verification.

## Current Status

### ✅ Implemented
- Backend gRPC server (`AgentIngressService`)
- Proto file in `protos/` directory
- SDK Config classes support gRPC configuration
- Authentication via Bearer token

### ⚠️ Partially Implemented
- SDK gRPC transports are mostly stubs
- Proto stub generation needs to be run per SDK
- mTLS support is available but disabled by default

### ❌ Not Yet Implemented
- Full gRPC transport implementation in SDKs (currently stubs)
- mTLS certificate validation in SDKs
- Connection pooling and retry logic

## Recommendations

1. **For Development**: Use REST transport instead of gRPC (simpler, no proto generation needed)
2. **For Production**: 
   - Enable mTLS on backend (`GRPC_TLS_ENABLED=true`)
   - Generate proto stubs for your SDK
   - Implement full gRPC transport in SDK
   - Configure proper certificates

## Troubleshooting

### "gRPC not wired yet" Error
- Run proto generation for your SDK
- Implement the gRPC transport methods using generated stubs

### Connection Refused
- Check backend is running: `GRPC_PUBLIC_PORT=50052`
- Verify firewall allows connections to port 50052
- Check backend logs for gRPC server startup messages

### Authentication Errors
- Ensure JWT token is valid and not expired
- Verify token is sent in `authorization` metadata header
- Check backend logs for authentication failures

### Certificate Errors
- If using insecure mode, ensure SDK Config allows empty certificates
- If using mTLS, verify certificates are valid and match backend configuration

