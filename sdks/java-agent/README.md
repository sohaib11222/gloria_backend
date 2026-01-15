# Car-Hire Java Agent SDK

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

## Installation

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>com.carhire</groupId>
    <artifactId>carhire-java-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

Or install locally:

```bash
mvn install
```

## Quickstart (REST)

```java
import com.carhire.sdk.*;
import java.util.*;

Map<String, Object> configData = new HashMap<>();
configData.put("baseUrl", "https://your-gateway.example.com");
configData.put("token", "Bearer <JWT>");
configData.put("apiKey", "<YOUR_API_KEY>"); // Optional
configData.put("agentId", "ag_123");
configData.put("callTimeoutMs", 12000);
configData.put("availabilitySlaMs", 120000);
configData.put("longPollWaitMs", 10000);

Config config = Config.forRest(configData);
CarHireClient client = new CarHireClient(config);

// Search availability
Map<String, Object> criteria = new HashMap<>();
criteria.put("pickup_unlocode", "PKKHI");
criteria.put("dropoff_unlocode", "PKLHE");
criteria.put("pickup_iso", "2025-11-03T10:00:00Z");
criteria.put("dropoff_iso", "2025-11-05T10:00:00Z");
criteria.put("driver_age", 28);
criteria.put("currency", "USD");
criteria.put("agreement_refs", Arrays.asList("AGR-001"));

client.getAvailability().search(criteria).forEach(chunkFuture -> {
    Map<String, Object> chunk = chunkFuture.join();
    System.out.println("Status: " + chunk.get("status"));
    if ("COMPLETE".equals(chunk.get("status"))) {
        // Process complete
    }
});

// Create booking
// Note: supplier_id is not required - backend resolves source_id from agreement_ref
Map<String, Object> booking = new HashMap<>();
booking.put("agreement_ref", "AGR-001");
booking.put("offer_id", "off_123");

Map<String, Object> result = client.getBooking().create(booking, "idem-123").join();
System.out.println(result.get("supplierBookingRef"));
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
mvn compile
```

Then implement the methods in `GrpcTransport.java` using the generated stubs.

## Configuration

### REST Configuration

```java
Map<String, Object> configData = new HashMap<>();
configData.put("baseUrl", "https://api.example.com"); // Required
configData.put("token", "Bearer <JWT>"); // Required
configData.put("apiKey", "<API_KEY>"); // Optional
configData.put("agentId", "ag_123"); // Optional
configData.put("callTimeoutMs", 10000); // Default: 10000
configData.put("availabilitySlaMs", 120000); // Default: 120000
configData.put("longPollWaitMs", 10000); // Default: 10000

Config config = Config.forRest(configData);
```

### gRPC Configuration

```java
Map<String, Object> configData = new HashMap<>();
configData.put("host", "api.example.com:50051"); // Required
configData.put("caCert", "<CA_CERT>"); // Required
configData.put("clientCert", "<CLIENT_CERT>"); // Required
configData.put("clientKey", "<CLIENT_KEY>"); // Required

Config config = Config.forGrpc(configData);
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with `TransportException`
- **Async Support**: Uses `CompletableFuture` for asynchronous operations

## Error Handling

```java
try {
    Map<String, Object> result = client.getBooking().create(booking, "idem-123").join();
} catch (TransportException e) {
    System.err.println("Status: " + e.getStatusCode() + ", Code: " + e.getCode());
    throw e;
}
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

2. Set environment variables (Java doesn't have built-in .env support):
   ```bash
   export BASE_URL=http://localhost:8080
   export JWT_TOKEN=your_access_token_here
   export AGENT_ID=your_agent_id_here
   export AGREEMENT_REF=AGR-001
   ```

3. Compile and run:
   ```bash
   mvn compile
   javac -cp "target/classes:$(mvn dependency:build-classpath -q -Dmdep.outputFile=/dev/stdout)" examples/TestAvailability.java
   java -cp ".:target/classes:$(mvn dependency:build-classpath -q -Dmdep.outputFile=/dev/stdout)" examples.TestAvailability
   ```

4. See [TESTING_GUIDE.md](../TESTING_GUIDE.md) for detailed instructions.

### Example Test Scenarios
- Availability search: `examples/TestAvailability.java`
- Booking operations: `examples/TestBooking.java`
- Quick start: `examples/QuickStart.java`

## Requirements

- Java 11+
- Maven 3.6+

## License

Proprietary

