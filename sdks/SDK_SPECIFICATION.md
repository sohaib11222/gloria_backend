# Car-Hire SDK Specification

This document defines the common specification for all Car-Hire Agent SDKs across all supported languages.

## Overview

All SDKs follow the same architecture and API patterns to ensure consistency across languages. Each SDK supports both REST and gRPC transports.

## Architecture

```
CarHireClient
├── AvailabilityClient
├── BookingClient
├── LocationsClient
└── Transport (REST or gRPC)
```

## Common Interfaces

### Config

All SDKs provide a `Config` class with:

- `forRest(data)` - Create REST configuration
- `forGrpc(data)` - Create gRPC configuration
- `isGrpc()` - Check transport type
- `get(key, default)` - Get configuration value
- `withCorrelationId(id)` - Create new config with correlation ID

### Transport Interface

All transports implement:

- `availabilitySubmit(criteria)` - Submit availability request
- `availabilityPoll(requestId, sinceSeq, waitMs)` - Poll for results
- `isLocationSupported(agreementRef, locode)` - Check location support
- `bookingCreate(payload, idempotencyKey)` - Create booking
- `bookingModify(payload)` - Modify booking
- `bookingCancel(payload)` - Cancel booking
- `bookingCheck(supplierBookingRef, agreementRef, sourceId)` - Check booking

### Clients

#### AvailabilityClient

- `search(criteria)` - Search availability (returns stream/generator)

#### BookingClient

- `create(dto, idempotencyKey)` - Create booking
- `modify(supplierBookingRef, fields, agreementRef, sourceId)` - Modify booking
- `cancel(supplierBookingRef, agreementRef, sourceId)` - Cancel booking
- `check(supplierBookingRef, agreementRef, sourceId)` - Check booking status

#### LocationsClient

- `isSupported(agreementRef, locode)` - Check if location is supported
  
  **Note:** Currently returns `false` as a safe default. The backend requires agreement ID (not ref) to check coverage, and there's no direct endpoint to resolve agreementRef to ID. Location validation is automatically performed during availability submit, so this method is primarily for informational purposes. A future backend endpoint `GET /locations/supported?agreement_ref={ref}&locode={code}` would enable full implementation.

## Data Models

### AvailabilityCriteria

```typescript
{
  pickupLocode: string;
  returnLocode: string;
  pickupAt: Date;
  returnAt: Date;
  driverAge: number;
  currency: string;
  agreementRefs: string[];
  vehiclePrefs?: string[];
  ratePrefs?: string[];
  residencyCountry?: string;
  extras?: Record<string, unknown>;
}
```

### AvailabilityChunk

```typescript
{
  items: Offer[];
  status: 'PARTIAL' | 'COMPLETE';
  cursor?: number;
  raw: Record<string, unknown>;
}
```

### BookingCreate

```typescript
{
  agreement_ref: string;  // Required - backend resolves source_id from this
  offer_id?: string;
  supplier_offer_ref?: string;
  agent_booking_ref?: string;
  driver?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    age?: number;
  };
}
```

**Note:** `supplier_id` is not required. The backend automatically resolves `source_id` from `agreement_ref` by looking up the agreement in the database.

## REST Endpoints

All SDKs use these REST endpoints:

- `POST /availability/submit` - Submit availability request
- `GET /availability/poll?request_id&since_seq&wait_ms` - Poll results
- `POST /bookings` - Create booking (requires `Idempotency-Key` header)
- `PATCH /bookings/{supplierBookingRef}?agreement_ref` - Modify booking
- `POST /bookings/{supplierBookingRef}/cancel?agreement_ref` - Cancel booking
- `GET /bookings/{supplierBookingRef}?agreement_ref` - Check booking

## Error Handling

All SDKs provide `TransportException` with:

- `message` - Error message
- `statusCode` - HTTP status code (if applicable)
- `code` - Error code

## Configuration Options

### REST Configuration

- `baseUrl` (required) - API base URL
- `token` (required) - Bearer token
- `apiKey` (optional) - API key for authentication
- `agentId` (optional) - Agent identifier
- `callTimeoutMs` (default: 10000) - Request timeout
- `availabilitySlaMs` (default: 120000) - Availability SLA
- `longPollWaitMs` (default: 10000) - Long poll wait time
- `correlationId` (auto-generated) - Correlation ID

### gRPC Configuration

- `host` (required) - gRPC server address
- `caCert` (required) - CA certificate
- `clientCert` (required) - Client certificate
- `clientKey` (required) - Client key
- `agentId` (optional) - Agent identifier
- `callTimeoutMs` (default: 10000) - Request timeout
- `availabilitySlaMs` (default: 120000) - Availability SLA
- `longPollWaitMs` (default: 10000) - Long poll wait time

## Best Practices

1. **Idempotency**: Always use idempotency keys for booking creation
2. **Error Handling**: Always handle `TransportException`
3. **Agreement Validation**: Verify agreements before making requests
4. **Polling**: Use appropriate wait times for polling
5. **Timeouts**: Configure timeouts based on your SLA requirements

## Language-Specific Notes

### Node.js/TypeScript

- Uses async/await
- Supports TypeScript types
- Uses axios for HTTP
- Uses @grpc/grpc-js for gRPC

### Python

- Uses async/await
- Type hints included
- Uses requests for HTTP
- Uses grpcio for gRPC

### Java

- Uses CompletableFuture for async
- Uses OkHttp for HTTP
- Uses gRPC Java library

### Perl

- Uses standard Perl patterns
- Uses LWP::UserAgent for HTTP
- gRPC support via stubs

### PHP

- Uses standard PHP patterns
- Uses Guzzle for HTTP
- Uses grpc/grpc for gRPC

## Input Validation

All SDKs automatically validate inputs:

- **AvailabilityCriteria**: 
  - Validates dates (pickupAt < returnAt)
  - Validates locodes (non-empty, normalized to uppercase)
  - Validates driver age (18-100)
  - Validates currency (non-empty, normalized to uppercase)
  - Validates agreement refs (non-empty array)
  - Validates residency country (2-letter ISO code if provided)

- **BookingCreate**: 
  - Validates required fields (agreement_ref)
  - Note: supplier_id is not required (backend resolves from agreement_ref)

- **Config**: 
  - REST: Validates baseUrl and token are required
  - gRPC: Validates host, caCert, clientCert, clientKey are required
  - Validates timeout values are at least 1000ms

## Location Support

The `isLocationSupported()` method currently returns `false` as a safe default because:
- The backend requires agreement ID (not ref) to check coverage
- There's no direct endpoint to resolve agreementRef to agreementId
- Location validation is automatically performed during availability submit

**Recommendation**: Use availability submit for location validation, which validates locations automatically.

## Versioning

All SDKs follow semantic versioning (MAJOR.MINOR.PATCH).

Current version: 1.0.0

## Support

For SDK-specific issues, refer to individual SDK README files:
- [Node.js SDK](nodejs-agent/README.md)
- [Python SDK](python-agent/README.md)
- [Java SDK](java-agent/README.md)
- [Perl SDK](perl-agent/README.md)
- [PHP SDK](php-agent/README.md)

