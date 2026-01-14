# Car-Hire Perl Agent SDK

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

## Installation

```bash
perl Makefile.PL
make
make install
```

Or using cpanm:

```bash
cpanm --installdeps .
cpanm .
```

## Quickstart (REST)

```perl
use CarHire::SDK;

my $config = CarHire::SDK::Config->for_rest({
    baseUrl => 'https://your-gateway.example.com',
    token   => 'Bearer <JWT>',
    apiKey  => '<YOUR_API_KEY>',  # Optional
    agentId => 'ag_123',
    callTimeoutMs     => 12000,
    availabilitySlaMs => 120000,
    longPollWaitMs    => 10000,
});

my $client = CarHire::SDK::Client->new($config);

# Search availability
my $criteria = {
    pickup_unlocode  => 'PKKHI',
    dropoff_unlocode => 'PKLHE',
    pickup_iso       => '2025-11-03T10:00:00Z',
    dropoff_iso      => '2025-11-05T10:00:00Z',
    driver_age       => 28,
    currency         => 'USD',
    agreement_refs   => ['AGR-001'],
};

for my $chunk ($client->availability()->search($criteria)) {
    print "[$chunk->{status}] items=" . scalar(@{$chunk->{items}}) . " cursor=" . ($chunk->{cursor} || 0) . "\n";
    last if $chunk->{status} eq 'COMPLETE';
}

# Create booking
# Note: supplier_id is not required - backend resolves source_id from agreement_ref
my $booking = {
    agreement_ref => 'AGR-001',
    offer_id      => 'off_123',
    driver        => {
        firstName => 'Ali',
        lastName  => 'Raza',
        email     => 'ali@example.com',
        phone     => '+92...',
        age       => 28,
    },
};

my $result = $client->booking()->create($booking, 'idem-123');
print $result->{supplierBookingRef}, "\n";
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
protoc --perl_out=. --grpc_out=. --plugin=protoc-gen-perl=/path/to/perl-plugin ../../protos/*.proto
```

Then implement the methods in `Transport/GRPC.pm` using the generated stubs.

## Configuration

### REST Configuration

```perl
CarHire::SDK::Config->for_rest({
    baseUrl => 'https://api.example.com',  # Required
    token   => 'Bearer <JWT>',              # Required
    apiKey  => '<API_KEY>',                 # Optional
    agentId => 'ag_123',                    # Optional
    callTimeoutMs     => 10000,             # Default: 10000
    availabilitySlaMs => 120000,           # Default: 120000
    longPollWaitMs    => 10000,            # Default: 10000
    correlationId     => 'custom-id',       # Auto-generated if not provided
});
```

### gRPC Configuration

```perl
CarHire::SDK::Config->for_grpc({
    host       => 'api.example.com:50051',  # Required
    caCert     => '<CA_CERT>',              # Required
    clientCert => '<CLIENT_CERT>',          # Required
    clientKey  => '<CLIENT_KEY>',           # Required
    agentId    => 'ag_123',                 # Optional
});
```

## Features

- **Availability Search**: Submit → Poll pattern with streaming results
- **Booking Management**: Create, modify, cancel, and check bookings
- **Agreement Enforcement**: All operations require valid agreement references
- **Idempotency**: Booking creation supports idempotency keys
- **Error Handling**: Comprehensive error handling with exceptions

## Error Handling

```perl
eval {
    my $result = $client->booking()->create($booking, 'idem-123');
    print $result->{supplierBookingRef}, "\n";
};
if ($@) {
    warn "Error: $@\n";
    die;
}
```

## Requirements

- Perl 5.10+
- LWP::UserAgent
- JSON
- HTTP::Request
- HTTP::Response
- Time::HiRes

## License

Proprietary

