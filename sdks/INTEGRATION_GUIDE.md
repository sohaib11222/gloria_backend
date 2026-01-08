# Car-Hire SDK Integration Guide

This guide helps you integrate the Car-Hire SDK into your application, whether you're an Agent or Source.

## Quick Start

### 1. Choose Your SDK

Select the SDK for your language:
- Node.js/TypeScript: `@carhire/nodejs-sdk`
- Python: `carhire-python-sdk`
- Java: `com.carhire:carhire-java-sdk`
- Perl: `CarHire::SDK`
- PHP: `hmstech/carhire-php-sdk`

### 2. Install SDK

See individual SDK README files for installation instructions.

### 3. Configure Client

```typescript
// Example: Node.js
import { CarHireClient, Config } from '@carhire/nodejs-sdk';

const config = Config.forRest({
  baseUrl: 'https://api.carhire.example.com',
  token: 'Bearer <your-jwt-token>',
  agentId: 'your-agent-id',
});

const client = new CarHireClient(config);
```

### 4. Make Your First Request

```typescript
// Search availability
const criteria = AvailabilityCriteria.make({
  pickupLocode: 'GBMAN',
  returnLocode: 'GBGLA',
  pickupAt: new Date('2025-11-03T10:00:00Z'),
  returnAt: new Date('2025-11-05T10:00:00Z'),
  driverAge: 30,
  currency: 'USD',
  agreementRefs: ['AGR-001'],
});

for await (const chunk of client.getAvailability().search(criteria)) {
  console.log(`Received ${chunk.items.length} offers`);
  if (chunk.status === 'COMPLETE') break;
}
```

## Common Patterns

### Availability Search Pattern

```typescript
// 1. Submit request
const criteria = AvailabilityCriteria.make({...});
const stream = client.getAvailability().search(criteria);

// 2. Process results as they arrive
for await (const chunk of stream) {
  // Process partial results
  processOffers(chunk.items);
  
  // Check if complete
  if (chunk.status === 'COMPLETE') {
    break;
  }
}
```

### Booking Creation Pattern

```typescript
// 1. Create booking with idempotency
const booking = BookingCreate.fromOffer({
  agreement_ref: 'AGR-001',
  supplier_id: 'SRC-AVIS',
  offer_id: 'off_123',
});

const idempotencyKey = generateUniqueId();
const result = await client.getBooking().create(booking, idempotencyKey);

// 2. Store booking reference
const supplierBookingRef = result.supplier_booking_ref;
```

### Error Handling Pattern

```typescript
try {
  const result = await client.getBooking().create(booking, idempotencyKey);
} catch (error) {
  if (error instanceof TransportException) {
    if (error.statusCode === 409) {
      // Handle conflict (e.g., duplicate booking)
    } else if (error.statusCode === 502) {
      // Handle upstream error
    }
  }
  throw error;
}
```

## Integration Checklist

### As an Agent

- [ ] Register your company
- [ ] Complete email verification
- [ ] Pass agent verification (create/modify/cancel test bookings)
- [ ] Accept agreements from sources
- [ ] Configure SDK with your credentials
- [ ] Test availability search
- [ ] Test booking creation
- [ ] Implement error handling
- [ ] Set up monitoring

### As a Source

- [ ] Register your company
- [ ] Complete email verification
- [ ] Configure gRPC endpoint
- [ ] Pass source verification (API test suite)
- [ ] Create and offer agreements to agents
- [ ] Implement source provider service
- [ ] Handle availability requests
- [ ] Handle booking requests
- [ ] Set up monitoring

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify token is valid
   - Check token expiration
   - Ensure correct base URL

2. **Agreement Not Found**
   - Verify agreement exists
   - Check agreement status (must be ACTIVE)
   - Ensure correct agreement reference

3. **Location Not Supported**
   - Check agreement location coverage
   - Verify UN/LOCODE format
   - Check source location sync

4. **Timeout Errors**
   - Increase timeout settings
   - Check network connectivity
   - Verify source is responding

5. **Idempotency Errors**
   - Use unique idempotency keys
   - Don't reuse keys for different bookings
   - Store keys for retry scenarios

## Best Practices

1. **Always use idempotency keys** for booking operations
2. **Handle errors gracefully** with retry logic
3. **Monitor response times** and adjust timeouts
4. **Cache agreement data** to reduce API calls
5. **Implement circuit breakers** for unreliable sources
6. **Log all operations** for debugging
7. **Use correlation IDs** for request tracking

## Performance Optimization

1. **Connection Pooling**: Reuse HTTP/gRPC connections
2. **Request Batching**: Batch multiple operations when possible
3. **Caching**: Cache agreement and location data
4. **Async Operations**: Use async/await for non-blocking operations
5. **Timeout Tuning**: Adjust timeouts based on your SLA

## Security

1. **Never commit tokens** to version control
2. **Use environment variables** for sensitive data
3. **Rotate tokens regularly**
4. **Use HTTPS** for all connections
5. **Validate all inputs** before sending to API

## Support

For integration help:
- Check SDK README files
- Review API documentation
- Contact support team

