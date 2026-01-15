# SDK Testing Guide

This guide provides step-by-step instructions for testing all Car-Hire Agent SDKs locally.

## Prerequisites

### 1. Backend Running

Ensure the backend is running on `http://localhost:8080`:

```bash
cd gloriaconnect_backend
npm install
npm run dev
```

The backend should be accessible at `http://localhost:8080`.

### 2. Agent Account

You need an agent account to test the SDKs. If you don't have one:

1. **Register an Agent Account:**
   - Send a POST request to `http://localhost:8080/auth/register`:
   ```json
   {
     "companyName": "Test Agent",
     "type": "AGENT",
     "email": "agent@example.com",
     "password": "password123"
   }
   ```

2. **Verify Email:**
   - Check your email for the OTP code (or check backend logs in development)
   - Send a POST request to `http://localhost:8080/auth/verify-email`:
   ```json
   {
     "email": "agent@example.com",
     "otp": "1234"
   }
   ```
   - This returns JWT tokens (`access` and `refresh`)

3. **Login (if already registered):**
   - Send a POST request to `http://localhost:8080/auth/login`:
   ```json
   {
     "email": "agent@example.com",
     "password": "password123"
   }
   ```
   - Response includes `access` token (JWT)

### 3. Active Agreement

You need an active agreement with a source. Agreements are typically created by administrators. For testing:

- Use an existing agreement reference (e.g., `AGR-001`)
- Or create one through the admin interface
- The agreement must be in `ACTIVE` status

### 4. Get Credentials

**JWT Token:**
- From the login/verify-email response, copy the `access` token
- This is your `JWT_TOKEN` for SDK configuration

**Agent ID:**
- From the login/verify-email response, the `user.company.id` field
- This is your `AGENT_ID` (optional but recommended)

**Agreement Reference:**
- The reference of an active agreement (e.g., `AGR-001`)
- This is your `AGREEMENT_REF` for testing

## SDK-Specific Testing Instructions

### Node.js SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/nodejs-agent
npm install
npm run build
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```
   BASE_URL=http://localhost:8080
   JWT_TOKEN=your_access_token_here
   AGENT_ID=your_agent_id_here
   AGREEMENT_REF=AGR-001
   ```

**Run Tests:**
```bash
# Test availability search
node examples/test-availability.js

# Test booking operations
node examples/test-booking.js

# Quick start example
node examples/quickstart.js
```

**Note:** Install `dotenv` package if you want automatic .env loading:
```bash
npm install dotenv
```

---

### Python SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/python-agent
pip install -e .
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials (same format as Node.js)

**Run Tests:**
```bash
# Test availability search
python examples/test-availability.py

# Test booking operations
python examples/test-booking.py

# Quick start example
python examples/quickstart.py
```

**Note:** Install `python-dotenv` for automatic .env loading:
```bash
pip install python-dotenv
```

**Important:** The Python SDK uses `httpx` for async HTTP. For proper cleanup, use async context manager or manually close the transport.

---

### Go SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/go-agent
go mod download
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials

**Run Tests:**
```bash
# Test availability search
go run examples/test-availability.go

# Test booking operations
go run examples/test-booking.go

# Quick start example
go run examples/quickstart.go
```

**Note:** Install `github.com/joho/godotenv` for .env loading:
```bash
go get github.com/joho/godotenv
```

---

### Java SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/java-agent
mvn compile
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Set environment variables (Java doesn't have built-in .env support):
   ```bash
   export BASE_URL=http://localhost:8080
   export JWT_TOKEN=your_access_token_here
   export AGENT_ID=your_agent_id_here
   export AGREEMENT_REF=AGR-001
   ```

**Run Tests:**
```bash
# Compile
javac -cp "target/classes:$(mvn dependency:build-classpath -q -Dmdep.outputFile=/dev/stdout)" examples/TestAvailability.java

# Run
java -cp ".:target/classes:$(mvn dependency:build-classpath -q -Dmdep.outputFile=/dev/stdout)" examples.TestAvailability
```

---

### PHP SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/php-agent
composer install
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials

**Run Tests:**
```bash
# Test availability search
php examples/test-availability.php

# Test booking operations
php examples/test-booking.php

# Quick start example
php examples/quickstart.php
```

---

### Perl SDK

**Installation:**
```bash
cd gloriaconnect_backend/sdks/perl-agent
cpanm --installdeps .
```

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials

**Run Tests:**
```bash
# Test availability search
perl examples/test-availability.pl

# Test booking operations
perl examples/test-booking.pl

# Quick start example
perl examples/quickstart.pl
```

---

## Common Test Scenarios

### 1. Availability Search (Basic)

All SDKs support streaming availability search:

```javascript
// Node.js example
const criteria = AvailabilityCriteria.make({
  pickupLocode: 'PKKHI',
  returnLocode: 'PKLHE',
  pickupAt: new Date('2025-12-01T10:00:00Z'),
  returnAt: new Date('2025-12-03T10:00:00Z'),
  driverAge: 28,
  currency: 'USD',
  agreementRefs: ['AGR-001'],
});

for await (const chunk of client.getAvailability().search(criteria)) {
  console.log(`Received ${chunk.items.length} offers`);
  if (chunk.status === 'COMPLETE') break;
}
```

### 2. Availability Search (With Filters)

Add vehicle class or rate preferences:

```javascript
const criteria = AvailabilityCriteria.make({
  // ... basic fields ...
  vehiclePrefs: ['ECONOMY', 'COMPACT'],
  ratePrefs: ['STANDARD'],
});
```

### 3. Booking Creation

Create a booking from an availability offer:

```javascript
// First, get an offer from availability search
const offer = /* from availability search */;

// Create booking
const booking = BookingCreate.fromOffer(offer, {
  agreement_ref: 'AGR-001',
  driver: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    age: 28,
  },
  agent_booking_ref: 'MY-REF-123',
});

const result = await client.getBooking().create(booking);
```

### 4. Booking Modification

Modify an existing booking:

```javascript
await client.getBooking().modify(
  'supplier_booking_ref_123',
  'AGR-001',
  {
    driver: {
      email: 'newemail@example.com',
    },
  }
);
```

### 5. Booking Cancellation

Cancel a booking:

```javascript
await client.getBooking().cancel(
  'supplier_booking_ref_123',
  'AGR-001'
);
```

### 6. Booking Status Check

Check booking status:

```javascript
const status = await client.getBooking().check(
  'supplier_booking_ref_123',
  'AGR-001'
);
```

### 7. Error Handling (Validation Errors)

All SDKs validate input and throw clear errors:

```javascript
try {
  const criteria = AvailabilityCriteria.make({
    pickupLocode: '', // Invalid: empty
    // ...
  });
} catch (error) {
  console.error('Validation error:', error.message);
  // Error: pickupLocode is required
}
```

### 8. Error Handling (Network Errors)

Handle network/transport errors:

```javascript
try {
  await client.getAvailability().search(criteria);
} catch (error) {
  if (error instanceof TransportException) {
    console.error('Transport error:', error.statusCode, error.message);
  }
}
```

### 9. Error Handling (API Errors)

Handle API errors (400, 401, 404, etc.):

```javascript
try {
  await client.getBooking().create(booking);
} catch (error) {
  if (error.statusCode === 401) {
    console.error('Authentication failed - check your JWT token');
  } else if (error.statusCode === 404) {
    console.error('Resource not found');
  }
}
```

---

## Troubleshooting

### Common Errors and Solutions

#### 1. "JWT_TOKEN is required"

**Problem:** JWT token not set in environment variables.

**Solution:**
- Ensure `.env` file exists and contains `JWT_TOKEN=your_token`
- Or set environment variable: `export JWT_TOKEN=your_token`
- Verify token is valid by checking backend logs

#### 2. "pickupLocode is required" (Validation Error)

**Problem:** Invalid or empty locode provided.

**Solution:**
- Ensure locode is 5 characters (UN/LOCODE format)
- Example: `PKKHI`, `PKLHE`, `USNYC`
- Locodes are automatically normalized to uppercase

#### 3. "returnAt must be after pickupAt"

**Problem:** Return date is before or equal to pickup date.

**Solution:**
- Ensure return date/time is after pickup date/time
- Example: Pickup `2025-12-01T10:00:00Z`, Return `2025-12-03T10:00:00Z`

#### 4. "driverAge must be between 18 and 100"

**Problem:** Driver age is outside valid range.

**Solution:**
- Set driver age between 18 and 100
- Example: `driverAge: 28`

#### 5. "agreement_refs must be a non-empty array"

**Problem:** No agreement references provided.

**Solution:**
- Provide at least one agreement reference
- Example: `agreementRefs: ['AGR-001']`
- Ensure agreement exists and is active

#### 6. "baseUrl is required for REST configuration"

**Problem:** Base URL not set in configuration.

**Solution:**
- Set `BASE_URL` in `.env` or environment variables
- Default: `http://localhost:8080`

#### 7. "token is required for REST configuration"

**Problem:** JWT token not set in configuration.

**Solution:**
- Set `JWT_TOKEN` in `.env` or environment variables
- Token should be the access token from login/verify-email

#### 8. Network Connectivity Issues

**Problem:** Cannot connect to backend.

**Solution:**
- Verify backend is running: `curl http://localhost:8080/health`
- Check firewall settings
- Verify `BASE_URL` is correct

#### 9. Authentication Problems (401 Unauthorized)

**Problem:** JWT token is invalid or expired.

**Solution:**
- Get a new token by logging in again
- Check token format: should start with `Bearer ` in SDK config
- Verify token hasn't expired (default: 1 hour)

#### 10. Agreement Not Found (404)

**Problem:** Agreement reference doesn't exist or isn't active.

**Solution:**
- Verify agreement reference is correct
- Check agreement status (must be `ACTIVE`)
- Ensure agreement belongs to your agent account

#### 11. Python: "httpx.AsyncClient requires explicit close"

**Problem:** Python SDK async client not properly closed.

**Solution:**
- Use async context manager:
  ```python
  async with CarHireClient(config) as client:
      # use client
  ```
- Or manually close: `await client.close()`

#### 12. Go: "undefined: sdk.ConfigForRest"

**Problem:** Go SDK not properly imported or built.

**Solution:**
- Ensure SDK is in your Go module path
- Run `go mod tidy`
- Check import path matches SDK structure

---

## Example Test Scenarios

### Scenario 1: Basic Availability Search

1. Set up credentials in `.env`
2. Run availability test script
3. Verify you receive availability chunks
4. Check that offers contain required fields (vehicle_class, price, etc.)

### Scenario 2: Full Booking Flow

1. Search for availability
2. Select an offer
3. Create booking with driver information
4. Check booking status
5. (Optional) Modify booking
6. (Optional) Cancel booking

### Scenario 3: Error Handling

1. Test with invalid locode (should get validation error)
2. Test with expired token (should get 401 error)
3. Test with non-existent agreement (should get 404 error)
4. Verify error messages are clear and actionable

### Scenario 4: Streaming Behavior

1. Run availability search
2. Verify chunks are received incrementally
3. Check that `status` changes from `PARTIAL` to `COMPLETE`
4. Verify `cursor` increments correctly

---

## Next Steps

After successfully testing locally:

1. **Integration Testing:** Test with real backend in staging environment
2. **Performance Testing:** Test with high-volume requests
3. **Error Recovery:** Test retry logic and error handling
4. **Documentation:** Review and update SDK documentation based on findings

---

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review SDK README files
3. Check backend API documentation
4. Contact development team

---

## Additional Resources

- [SDK Specification](../sdks/SDK_SPECIFICATION.md)
- [Integration Guide](../sdks/INTEGRATION_GUIDE.md)
- [Backend API Documentation](../../docs/)
- Individual SDK READMEs in each SDK directory

