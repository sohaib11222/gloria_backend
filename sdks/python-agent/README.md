# Car-Hire Python Agent SDK

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

## Installation

```bash
pip install carhire-python-sdk
# or
pip install -e .
```

## Quickstart (REST)

```python
from datetime import datetime
from carhire import CarHireClient, Config, AvailabilityCriteria, BookingCreate

config = Config.for_rest({
    "baseUrl": "https://your-gateway.example.com",
    "token": "Bearer <JWT>",
    "apiKey": "<YOUR_API_KEY>",  # Optional
    "agentId": "ag_123",
    "callTimeoutMs": 12000,
    "availabilitySlaMs": 120000,
    "longPollWaitMs": 10000,
})

# The client uses async HTTP (httpx) for non-blocking requests
# For proper cleanup, use async context manager or manually close the transport
client = CarHireClient(config)

# Search availability
criteria = AvailabilityCriteria.make(
    pickup_locode="PKKHI",
    return_locode="PKLHE",
    pickup_at=datetime.fromisoformat("2025-11-03T10:00:00Z"),
    return_at=datetime.fromisoformat("2025-11-05T10:00:00Z"),
    driver_age=28,
    currency="USD",
    agreement_refs=["AGR-001"],
)

async for chunk in client.get_availability().search(criteria):
    print(f"[{chunk.status}] items={len(chunk.items)} cursor={chunk.cursor or 0}")
    if chunk.status == "COMPLETE":
        break

# Create booking
# Note: supplier_id is not required - backend resolves source_id from agreement_ref
booking = BookingCreate.from_offer({
    "agreement_ref": "AGR-001",
    "offer_id": "off_123",
    "driver": {
        "firstName": "Ali",
        "lastName": "Raza",
        "email": "ali@example.com",
        "phone": "+92...",
        "age": 28,
    },
})

result = await client.get_booking().create(booking, "idem-123")
print(result["supplierBookingRef"])
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
python -m grpc_tools.protoc -I../../protos --python_out=. --grpc_python_out=. ../../protos/*.proto
```

Then implement the methods in `transport/grpc.py` using the generated stubs.

## Configuration

### REST Configuration

```python
Config.for_rest({
    "baseUrl": "https://api.example.com",  # Required
    "token": "Bearer <JWT>",  # Required
    "apiKey": "<API_KEY>",  # Optional
    "agentId": "ag_123",  # Optional
    "callTimeoutMs": 10000,  # Default: 10000
    "availabilitySlaMs": 120000,  # Default: 120000
    "longPollWaitMs": 10000,  # Default: 10000
    "correlationId": "custom-id",  # Auto-generated if not provided
})
```

### gRPC Configuration

```python
Config.for_grpc({
    "host": "api.example.com:50051",  # Required
    "caCert": "<CA_CERT>",  # Required
    "clientCert": "<CLIENT_CERT>",  # Required
    "clientKey": "<CLIENT_KEY>",  # Required
    "agentId": "ag_123",  # Optional
    "callTimeoutMs": 10000,  # Default: 10000
    "availabilitySlaMs": 120000,  # Default: 120000
    "longPollWaitMs": 10000,  # Default: 10000
})
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with `TransportException`
- **Type Hints**: Full type annotations included

## Input Validation

The SDK automatically validates inputs:

- **AvailabilityCriteria**: Validates dates, locodes, driver age (18-100), currency, and agreement refs
- **BookingCreate**: Validates required fields (agreement_ref)
- **Config**: Validates required fields (baseUrl, token for REST; host, certificates for gRPC)
- **Locations**: UN/LOCODEs are automatically normalized to uppercase

```python
# Invalid input will raise ValueError
try:
    criteria = AvailabilityCriteria.make(
        pickup_locode="",  # Error: pickup_locode is required
        return_locode="PKLHE",
        pickup_at=datetime(2025, 11, 3),
        return_at=datetime(2025, 11, 1),  # Error: return_at must be after pickup_at
        driver_age=17,  # Error: driver_age must be between 18 and 100
        currency="USD",
        agreement_refs=[],  # Error: agreement_refs must be a non-empty list
    )
except ValueError as e:
    print(f"Validation error: {e}")
```

## Location Support

Location validation is automatically performed during availability submit. The `is_supported()` method currently returns `False` as a safe default because the backend requires agreement ID (not ref) to check coverage.

```python
# Location validation happens automatically during availability search
# The is_supported() method is informational only
supported = await client.get_locations().is_supported("AGR-001", "GBMAN")
# Returns False (safe default) - use availability submit for actual validation
```

## Error Handling

```python
from carhire import TransportException

try:
    await client.get_booking().create(booking, "idem-123")
except TransportException as e:
    print(f"Status: {e.status_code}, Code: {e.code}")
    raise
```

## Testing Locally

### Prerequisites
1. Backend running on `http://localhost:8080`
2. Agent account created and verified
3. Active agreement with a source
4. JWT token from agent login

### Quick Test
1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. Install dependencies (if using python-dotenv):
   ```bash
   pip install python-dotenv
   ```

3. Run the test script:
   ```bash
   python examples/test-availability.py
   ```

4. See [TESTING_GUIDE.md](../TESTING_GUIDE.md) for detailed instructions.

### Example Test Scenarios
- Availability search: `examples/test-availability.py`
- Booking operations: `examples/test-booking.py`
- Quick start: `examples/quickstart.py`

**Note:** The client uses async HTTP (httpx) for non-blocking requests. For proper cleanup, use async context manager or manually close the transport.

## Requirements

- Python 3.8+
- httpx >= 0.25.0 (async HTTP client)
- grpcio >= 1.60.0 (for gRPC transport)

## License

Proprietary

