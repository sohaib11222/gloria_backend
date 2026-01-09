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
    config := sdk.Config{
        BaseURL: "https://your-gateway.example.com",
        Token: "Bearer <JWT>",
        APIKey: "<YOUR_API_KEY>", // Optional
        AgentID: "ag_123",
        CallTimeoutMs: 12000,
        AvailabilitySlaMs: 120000,
        LongPollWaitMs: 10000,
    }
    
    client := sdk.NewClient(config)
    ctx := context.Background()
    
    // Search availability
    criteria := sdk.AvailabilityCriteria{
        PickupLocode: "PKKHI",
        ReturnLocode: "PKLHE",
        PickupAt: time.Date(2025, 11, 3, 10, 0, 0, 0, time.UTC),
        ReturnAt: time.Date(2025, 11, 5, 10, 0, 0, 0, time.UTC),
        DriverAge: 28,
        Currency: "USD",
        AgreementRefs: []string{"AGR-001"},
    }
    
    chunks, err := client.Availability().Search(ctx, criteria)
    if err != nil {
        panic(err)
    }
    
    for chunk := range chunks {
        fmt.Printf("[%s] items=%d cursor=%d\n", chunk.Status, len(chunk.Items), chunk.Cursor)
        if chunk.Status == "COMPLETE" {
            break
        }
    }
    
    // Create booking
    booking := sdk.BookingCreate{
        AgreementRef: "AGR-001",
        SupplierID: "SRC-AVIS",
        OfferID: "off_123",
        Driver: sdk.Driver{
            FirstName: "Ali",
            LastName: "Raza",
            Email: "ali@example.com",
            Phone: "+92...",
            Age: 28,
        },
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

gRPC transport is available but requires proto file generation:

```bash
protoc --go_out=. --go-grpc_out=. ../../protos/*.proto
```

Then implement the methods in `transport/grpc.go` using the generated stubs.

## Configuration

### REST Configuration

```go
config := sdk.Config{
    BaseURL: "https://api.example.com", // Required
    Token: "Bearer <JWT>", // Required
    APIKey: "<API_KEY>", // Optional
    AgentID: "ag_123", // Optional
    CallTimeoutMs: 10000, // Default: 10000
    AvailabilitySlaMs: 120000, // Default: 120000
    LongPollWaitMs: 10000, // Default: 10000
    CorrelationID: "custom-id", // Auto-generated if not provided
}
```

### gRPC Configuration

```go
config := sdk.Config{
    Host: "api.example.com:50051", // Required
    CACert: "<CA_CERT>", // Required
    ClientCert: "<CLIENT_CERT>", // Required
    ClientKey: "<CLIENT_KEY>", // Required
    AgentID: "ag_123", // Optional
    CallTimeoutMs: 10000, // Default: 10000
    AvailabilitySlaMs: 120000, // Default: 120000
    LongPollWaitMs: 10000, // Default: 10000
}
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with `TransportException`
- **Context Support**: Full context.Context support for cancellation and timeouts

## Error Handling

```go
result, err := client.Booking().Create(ctx, booking, "idem-123")
if err != nil {
    if sdkErr, ok := err.(*sdk.TransportException); ok {
        fmt.Printf("Status: %d, Code: %s\n", sdkErr.StatusCode, sdkErr.Code)
    }
    return err
}
```

## Requirements

- Go 1.18+
- Standard library: `net/http`, `encoding/json`, `context`
- For gRPC: `google.golang.org/grpc` and generated proto stubs

## License

Proprietary

