# Car-Hire Go Agent SDK

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

## Installation

```bash
go get github.com/carhire/go-sdk
# or
go mod init your-project
go get ./go-agent
```

## Quickstart (REST)

```go
package main

import (
    "context"
    "fmt"
    "time"
    "github.com/carhire/go-sdk"
)

func main() {
    config := sdk.ForRest(sdk.ConfigData{
        BaseURL: "https://your-gateway.example.com",
        Token: "Bearer <JWT>",
        APIKey: "<YOUR_API_KEY>", // Optional
        AgentID: "ag_123",
        CallTimeoutMs: 12000,
        AvailabilitySlaMs: 120000,
        LongPollWaitMs: 10000,
    })
    
    client := sdk.NewClient(config)
    ctx := context.Background()
    
    // Search availability (with validation)
    criteria, err := sdk.MakeAvailabilityCriteria(
        "PKKHI",
        "PKLHE",
        time.Date(2025, 11, 3, 10, 0, 0, 0, time.UTC),
        time.Date(2025, 11, 5, 10, 0, 0, 0, time.UTC),
        28,
        "USD",
        []string{"AGR-001"},
    )
    if err != nil {
        log.Fatal(err)
    }
    
    resultChan, err := client.Availability().Search(ctx, criteria)
    if err != nil {
        panic(err)
    }
    
    for result := range resultChan {
        if result.Error != nil {
            fmt.Printf("Error: %v\n", result.Error)
            break
        }
        chunk := result.Chunk
        fmt.Printf("[%s] items=%d", chunk.Status, len(chunk.Items))
        if chunk.Cursor != nil {
            fmt.Printf(" cursor=%d", *chunk.Cursor)
        }
        fmt.Println()
        if chunk.Status == "COMPLETE" {
            break
        }
    }
    
    // Create booking
    // Note: supplier_id is not required - backend resolves source_id from agreement_ref
    bookingData := map[string]interface{}{
        "agreement_ref": "AGR-001",
        "offer_id":      "off_123",
        "driver": map[string]interface{}{
            "first_name": "Ali",
            "last_name":  "Raza",
            "email":      "ali@example.com",
            "phone":      "+92...",
            "age":        28,
        },
    }
    
    booking, err := sdk.BookingCreateFromOffer(bookingData)
    if err != nil {
        panic(err)
    }
    
    result, err := client.Booking().Create(ctx, booking, "idem-123")
    if err != nil {
        panic(err)
    }
    fmt.Println(result.SupplierBookingRef)
}
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

gRPC transport is currently a stub implementation. Full implementation requires proto file generation from the backend:

```bash
protoc --go_out=. --go-grpc_out=. ../../protos/*.proto
```

The gRPC transport will return errors indicating it's not yet implemented until proto files are generated and integrated.

## Configuration

### REST Configuration

```go
config := sdk.ForRest(sdk.ConfigData{
    BaseURL: "https://api.example.com", // Required
    Token: "Bearer <JWT>", // Required
    APIKey: "<API_KEY>", // Optional
    AgentID: "ag_123", // Optional
    CallTimeoutMs: 10000, // Default: 10000
    AvailabilitySlaMs: 120000, // Default: 120000
    LongPollWaitMs: 10000, // Default: 10000
    CorrelationID: "custom-id", // Auto-generated if not provided
})
```

### gRPC Configuration

```go
config := sdk.ForGrpc(sdk.ConfigData{
    Host: "api.example.com:50051", // Required
    CACert: "<CA_CERT>", // Required
    ClientCert: "<CLIENT_CERT>", // Required
    ClientKey: "<CLIENT_KEY>", // Required
    AgentID: "ag_123", // Optional
    CallTimeoutMs: 10000, // Default: 10000
    AvailabilitySlaMs: 120000, // Default: 120000
    LongPollWaitMs: 10000, // Default: 10000
})
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with `TransportException`
- **Context Support**: Full context.Context support for cancellation and timeouts
- **Input Validation**: Automatic validation of criteria, bookings, and configuration
- **Location Support**: Location validation happens automatically during availability submit

## Input Validation

The SDK automatically validates inputs. Invalid inputs will return errors immediately:

```go
// Invalid input will return an error
criteria, err := sdk.MakeAvailabilityCriteria(
    "", // Error: pickupLocode is required
    "PKLHE",
    time.Date(2025, 11, 3, 10, 0, 0, 0, time.UTC),
    time.Date(2025, 11, 1, 10, 0, 0, 0, time.UTC), // Error: returnAt must be after pickupAt
    17, // Error: driverAge must be between 18 and 100
    "USD",
    []string{}, // Error: agreementRefs must be a non-empty array
)
if err != nil {
    log.Fatal("Validation error:", err)
}
```

**Validated Fields:**
- AvailabilityCriteria: dates, locodes, driver age (18-100), currency, agreement refs
- BookingCreate: required fields (agreement_ref)
- Config: required fields and timeout values

## Location Support

Location validation is automatically performed during availability submit. The `IsLocationSupported()` method currently returns `false` as a safe default because the backend requires agreement ID (not ref) to check coverage.

```go
// Location validation happens automatically during availability search
// The IsLocationSupported() method is informational only
supported, _ := client.Locations().IsSupported(ctx, "AGR-001", "GBMAN")
// Returns false (safe default) - use availability submit for actual validation
```

## Error Handling

```go
result, err := client.Booking().Create(ctx, booking, "idem-123")
if err != nil {
    var transportErr *sdk.TransportException
    if errors.As(err, &transportErr) {
        fmt.Printf("Status: %d, Code: %s\n", transportErr.StatusCode, transportErr.Code)
    }
    return err
}
```

Note: Import `errors` package for error handling utilities.

## Requirements

- Go 1.18+
- Standard library: `net/http`, `encoding/json`, `context`, `time`, `fmt`
- For gRPC: `google.golang.org/grpc` and generated proto stubs (not yet implemented)

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

2. Install dependencies (if using godotenv):
   ```bash
   go get github.com/joho/godotenv
   ```

3. Run the test script:
   ```bash
   go run examples/test-availability.go
   ```

4. See [TESTING_GUIDE.md](../TESTING_GUIDE.md) for detailed instructions.

### Example Test Scenarios
- Availability search: `examples/test-availability.go`
- Booking operations: `examples/test-booking.go`
- Quick start: `examples/quickstart.go`

## Package Structure

- `config.go` - Configuration management with factory methods (`ForRest`, `ForGrpc`)
- `exceptions.go` - Error handling with `TransportException`
- `dto.go` - Data transfer objects (AvailabilityCriteria, AvailabilityChunk, BookingCreate, etc.)
- `client.go` - Main client implementation
- `availability_client.go` - Availability search with channel-based streaming
- `booking_client.go` - Booking operations (create, modify, cancel, check)
- `locations_client.go` - Location support checking
- `rest_transport.go` - REST transport implementation
- `grpc_transport.go` - gRPC transport stub (requires proto generation)

## License

Proprietary

