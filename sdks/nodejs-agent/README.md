# Car-Hire Node.js/TypeScript Agent SDK

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

## Installation

```bash
npm install @carhire/nodejs-sdk
# or
yarn add @carhire/nodejs-sdk
```

## Quickstart (REST)

```typescript
import { CarHireClient, Config, AvailabilityCriteria, BookingCreate } from '@carhire/nodejs-sdk';

const config = Config.forRest({
  baseUrl: 'https://your-gateway.example.com',
  token: 'Bearer <JWT>',
  apiKey: '<YOUR_API_KEY>', // Optional: prefer API key auth for SDKs
  agentId: 'ag_123',
  callTimeoutMs: 12000,
  availabilitySlaMs: 120000,
  longPollWaitMs: 10000,
});

const client = new CarHireClient(config);

// Search availability
const criteria = AvailabilityCriteria.make({
  pickupLocode: 'PKKHI',
  returnLocode: 'PKLHE',
  pickupAt: new Date('2025-11-03T10:00:00Z'),
  returnAt: new Date('2025-11-05T10:00:00Z'),
  driverAge: 28,
  currency: 'USD',
  agreementRefs: ['AGR-001'],
});

for await (const chunk of client.getAvailability().search(criteria)) {
  console.log(`[${chunk.status}] items=${chunk.items.length} cursor=${chunk.cursor ?? 0}`);
  if (chunk.status === 'COMPLETE') break;
}

// Create booking
// Note: supplier_id is not required - backend resolves source_id from agreement_ref
const booking = BookingCreate.fromOffer({
  agreement_ref: 'AGR-001',
  offer_id: 'off_123',
  driver: {
    firstName: 'Ali',
    lastName: 'Raza',
    email: 'ali@example.com',
    phone: '+92...',
    age: 28,
  },
});

const result = await client.getBooking().create(booking, 'idem-123');
console.log(result.supplierBookingRef);
```

## REST Endpoints

The SDK uses the following REST endpoints (aligned with middleware):

- `POST /availability/submit` - Submit availability request
- `GET /availability/poll?request_id&since_seq&wait_ms` - Poll availability results
- `POST /bookings` - Create booking (with `Idempotency-Key` header)
- `PATCH /bookings/{supplierBookingRef}?agreement_ref` - Modify booking
- `POST /bookings/{supplierBookingRef}/cancel?agreement_ref` - Cancel booking
- `GET /bookings/{supplierBookingRef}?agreement_ref` - Check booking status

## gRPC Transport

gRPC transport is available but requires proto file generation:

```bash
npm run proto:gen
```

Then implement the methods in `GrpcTransport.ts` using the generated stubs.

## Configuration

### REST Configuration

```typescript
Config.forRest({
  baseUrl: 'https://api.example.com', // Required
  token: 'Bearer <JWT>', // Required
  apiKey: '<API_KEY>', // Optional
  agentId: 'ag_123', // Optional
  callTimeoutMs: 10000, // Default: 10000
  availabilitySlaMs: 120000, // Default: 120000
  longPollWaitMs: 10000, // Default: 10000
  correlationId: 'custom-id', // Auto-generated if not provided
});
```

### gRPC Configuration

```typescript
Config.forGrpc({
  host: 'api.example.com:50051', // Required
  caCert: '<CA_CERT>', // Required
  clientCert: '<CLIENT_CERT>', // Required
  clientKey: '<CLIENT_KEY>', // Required
  agentId: 'ag_123', // Optional
  callTimeoutMs: 10000, // Default: 10000
  availabilitySlaMs: 120000, // Default: 120000
  longPollWaitMs: 10000, // Default: 10000
});
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with `TransportException`
- **TypeScript Support**: Full type definitions included
- **Input Validation**: Automatic validation of criteria, bookings, and configuration
- **Location Support**: Location validation happens automatically during availability submit

## Input Validation

The SDK automatically validates inputs:

- **AvailabilityCriteria**: Validates dates, locodes, driver age (18-100), currency, and agreement refs
- **BookingCreate**: Validates required fields (agreement_ref)
- **Config**: Validates required fields (baseUrl, token for REST; host, certificates for gRPC)
- **Locations**: UN/LOCODEs are automatically normalized to uppercase

```typescript
// Invalid input will throw an error
try {
  const criteria = AvailabilityCriteria.make({
    pickupLocode: '', // Error: pickupLocode is required
    returnLocode: 'PKLHE',
    pickupAt: new Date('2025-11-03'),
    returnAt: new Date('2025-11-01'), // Error: returnAt must be after pickupAt
    driverAge: 17, // Error: driverAge must be between 18 and 100
    currency: 'USD',
    agreementRefs: [], // Error: agreementRefs must be a non-empty array
  });
} catch (error) {
  console.error('Validation error:', error.message);
}
```

## Location Support

Location validation is automatically performed during availability submit. The `isLocationSupported()` method currently returns `false` as a safe default because the backend requires agreement ID (not ref) to check coverage, and there's no direct endpoint to resolve agreementRef to ID.

```typescript
// Location validation happens automatically during availability search
// The isLocationSupported() method is informational only
const supported = await client.getLocations().isSupported('AGR-001', 'GBMAN');
// Returns false (safe default) - use availability submit for actual validation
```

## Error Handling

```typescript
import { TransportException } from '@carhire/nodejs-sdk';

try {
  await client.getBooking().create(booking, 'idem-123');
} catch (error) {
  if (error instanceof TransportException) {
    console.error(`Status: ${error.statusCode}, Code: ${error.code}`);
  }
  throw error;
}
```

## Examples

See the `examples/` directory for more detailed usage examples.

## License

Proprietary

