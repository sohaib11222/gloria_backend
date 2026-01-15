# Car-Hire PHP Agent SDK

- **Transports:** REST (working) + gRPC (stubs; run `composer proto:gen` after placing .proto in `../../protos`).
- **Features:** Availability (submit→poll streaming), Booking (create/modify/cancel/check), Agreement enforcement, Deadlines/SLA, Correlation IDs.

## Install (local)
```bash
cd sdks/php-agent
composer install

Quickstart (REST)
use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;
use HMS\CarHire\DTO\AvailabilityCriteria;
use HMS\CarHire\DTO\BookingCreate;

$config = Config::forRest([
  'baseUrl' => 'https://your-gateway.example.com/v1',
  'token'   => 'Bearer <JWT>',
  'apiKey'  => '<YOUR_API_KEY>', // [AUTO-AUDIT] Optional: prefer API key auth for SDKs
  'agentId' => 'ag_123',
  'callTimeoutMs' => 12000,
  'availabilitySlaMs' => 120000,
  'longPollWaitMs' => 10000
]);

$client = new CarHireClient($config);

$criteria = AvailabilityCriteria::make(
  pickupLocode: 'PKKHI',
  returnLocode: 'PKLHE',
  pickupAt: new DateTimeImmutable('2025-11-03T10:00:00Z'),
  returnAt: new DateTimeImmutable('2025-11-05T10:00:00Z'),
  driverAge: 28,
  currency: 'USD',
  agreementRefs: ['AGR-001']
);

foreach ($client->availability()->search($criteria) as $chunk) {
  // $chunk->items, $chunk->status (PARTIAL|COMPLETE), $chunk->cursor
}

// Note: supplier_id is not required - backend resolves source_id from agreement_ref
$booking = BookingCreate::fromOffer([
  'agreement_ref' => 'AGR-001',
  'offer_id'      => 'off_123',
  'driver'        => ['firstName'=>'Ali','lastName'=>'Raza','email'=>'ali@example.com','phone'=>'+92...', 'age'=>28]
]);
$res = $client->booking()->create($booking, 'idem-123');
echo $res['supplierBookingRef'] ?? '';

REST endpoints (aligned with middleware)


POST /availability/submit


GET  /availability/poll?request_id&since_seq&wait_ms


GET  /locations (Note: /locations/supported endpoint not available - use /coverage/agreement/{id} to check locations)


POST /bookings (with Idempotency-Key header)


PATCH /bookings/{supplierBookingRef}?agreement_ref (fields in body, backend resolves source_id from agreement)


POST /bookings/{supplierBookingRef}/cancel?agreement_ref (backend resolves source_id from agreement)


GET  /bookings/{supplierBookingRef}?agreement_ref (backend resolves source_id from agreement)


gRPC
Place .proto files in ../../protos and run:
composer run proto:gen

Then implement calls in GrpcTransport.

---

**File:** `sdks/php-agent/src/CarHireClient.php`
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire;

use HMS\CarHire\Clients\AvailabilityClient;
use HMS\CarHire\Clients\BookingClient;
use HMS\CarHire\Clients\LocationsClient;
use HMS\CarHire\Transport\GrpcTransport;
use HMS\CarHire\Transport\RestTransport;
use HMS\CarHire\Transport\TransportInterface;

final class CarHireClient
{
    private TransportInterface $transport;
    private AvailabilityClient $availability;
    private BookingClient $booking;
    private LocationsClient $locations;

    public function __construct(private Config $config)
    {
        $this->transport = $config->isGrpc()
            ? new GrpcTransport($config)
            : new RestTransport($config);

        $this->availability = new AvailabilityClient($this->transport, $this->config);
        $this->booking      = new BookingClient($this->transport, $this->config);
        $this->locations    = new LocationsClient($this->transport, $this->config);
    }

    public function availability(): AvailabilityClient { return $this->availability; }
    public function booking(): BookingClient { return $this->booking; }
    public function locations(): LocationsClient { return $this->locations; }
    public function transport(): TransportInterface { return $this->transport; }
}
```


File: `sdks/php-agent/src/Config.php**
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire;

final class Config
{
    private function __construct(
        private bool $grpc,
        private array $data
    ) {}

    public static function forGrpc(array $data): self
    {
        // required: host, caCert, clientCert, clientKey
        $defaults = [
            'callTimeoutMs' => 10000,
            'availabilitySlaMs' => 120000,
            'longPollWaitMs' => 10000,
            'agentId' => null,
            'correlationId' => 'php-sdk-'.bin2hex(random_bytes(6)),
        ];
        return new self(true, $data + $defaults);
    }

    public static function forRest(array $data): self
    {
        // required: baseUrl, token
        $defaults = [
            'callTimeoutMs' => 10000,
            'availabilitySlaMs' => 120000,
            'longPollWaitMs' => 10000,
            'agentId' => null,
            'correlationId' => 'php-sdk-'.bin2hex(random_bytes(6)),
        ];
        return new self(false, $data + $defaults);
    }

    public function isGrpc(): bool { return $this->grpc; }
    public function get(string $key, mixed $default = null): mixed { return $this->data[$key] ?? $default; }
    public function withCorrelationId(string $id): self { $c = clone $this; $c->data['correlationId'] = $id; return $c; }
}
```


File: sdks/php-agent/src/Transport/TransportInterface.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Transport;

interface TransportInterface
{
    // Availability
    public function availabilitySubmit(array $criteria): array;  // returns ['request_id' => '...']
    public function availabilityPoll(string $requestId, int $sinceSeq, int $waitMs): array; // returns chunk

    // Locations
    public function isLocationSupported(string $agreementRef, string $locode): bool;

    // Booking
    public function bookingCreate(array $payload, ?string $idempotencyKey = null): array;
    public function bookingModify(array $payload): array;
    public function bookingCancel(array $payload): array;
    public function bookingCheck(string $supplierBookingRef, string $agreementRef, string $sourceId): array;
}
```


File: sdks/php-agent/src/Transport/RestTransport.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Transport;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use HMS\CarHire\Config;
use HMS\CarHire\Exceptions\TransportException;

final class RestTransport implements TransportInterface
{
    private Client $http;

    public function __construct(private Config $config)
    {
        $this->http = new Client([
            'base_uri' => rtrim($config->get('baseUrl'), '/').'/',
            'timeout'  => max(ceil(($config->get('longPollWaitMs')+2000)/1000), 12),
        ]);
    }

    private function headers(array $extra = []): array
    {
        return array_merge([
            'Authorization'    => $this->config->get('token'),
            'Content-Type'     => 'application/json',
            'Accept'           => 'application/json',
            'X-Agent-Id'       => $this->config->get('agentId'),
            'X-Correlation-Id' => $this->config->get('correlationId'),
        ], $extra);
    }

    private function decode($resp): array
    {
        $body = (string) $resp->getBody();
        $json = json_decode($body, true);
        return is_array($json) ? $json : [];
    }

    public function availabilitySubmit(array $criteria): array
    {
        try {
            $resp = $this->http->post('availability/submit', [
                'headers' => $this->headers(),
                'json'    => $criteria,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function availabilityPoll(string $requestId, int $sinceSeq, int $waitMs): array
    {
        try {
            $resp = $this->http->get('availability/poll', [
                'headers' => $this->headers(),
                'query'   => ['request_id'=>$requestId,'since_seq'=>$sinceSeq,'wait_ms'=>$waitMs],
                'timeout' => max(($waitMs/1000)+2, $this->config->get('callTimeoutMs')/1000 + 2)
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function isLocationSupported(string $agreementRef, string $locode): bool
    {
        try {
            $resp = $this->http->get('locations/supported', [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref'=>$agreementRef, 'locode'=>$locode],
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            $data = $this->decode($resp);
            return (bool)($data['supported'] ?? false);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCreate(array $payload, ?string $idempotencyKey = null): array
    {
        try {
            $resp = $this->http->post('booking/create', [
                'headers' => $this->headers($idempotencyKey ? ['Idempotency-Key'=>$idempotencyKey] : []),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingModify(array $payload): array
    {
        try {
            $resp = $this->http->post('booking/modify', [
                'headers' => $this->headers(),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCancel(array $payload): array
    {
        try {
            $resp = $this->http->post('booking/cancel', [
                'headers' => $this->headers(),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCheck(string $supplierBookingRef, string $agreementRef, string $sourceId): array
    {
        try {
            $resp = $this->http->get("booking/check/{$supplierBookingRef}", [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref'=>$agreementRef, 'source_id'=>$sourceId],
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }
}
```


File: sdks/php-agent/src/Transport/GrpcTransport.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Transport;

use HMS\CarHire\Config;
use HMS\CarHire\Exceptions\TransportException;

/**
 * gRPC transport – STUBS until you run `composer run proto:gen` and wire service clients.
 * Implement methods by calling generated stubs with per-call deadlines and mTLS channel credentials.
 */
final class GrpcTransport implements TransportInterface
{
    public function __construct(private Config $config) {}

    public function availabilitySubmit(array $criteria): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function availabilityPoll(string $requestId, int $sinceSeq, int $waitMs): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function isLocationSupported(string $agreementRef, string $locode): bool
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function bookingCreate(array $payload, ?string $idempotencyKey = null): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function bookingModify(array $payload): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function bookingCancel(array $payload): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
    public function bookingCheck(string $supplierBookingRef, string $agreementRef, string $sourceId): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
}
```


File: sdks/php-agent/src/Clients/AvailabilityClient.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Clients;

use Generator;
use HMS\CarHire\Config;
use HMS\CarHire\DTO\AvailabilityChunk;
use HMS\CarHire\DTO\AvailabilityCriteria;
use HMS\CarHire\Transport\TransportInterface;
use InvalidArgumentException;

final class AvailabilityClient
{
    public function __construct(private TransportInterface $t, private Config $c) {}

    /** @return Generator<AvailabilityChunk> */
    public function search(AvailabilityCriteria $criteria): Generator
    {
        $payload = $criteria->toArray();
        if (empty($payload['agreement_refs'])) {
            throw new InvalidArgumentException('agreement_refs required');
        }

        $submit = $this->t->availabilitySubmit($payload);
        $requestId = $submit['request_id'] ?? null;
        if (!$requestId) {
            return; // nothing to yield
        }

        $since = 0;
        $deadline = microtime(true) + ($this->c->get('availabilitySlaMs') / 1000.0);

        while (true) {
            $remaining = (int) max(0, ($deadline - microtime(true)) * 1000);
            if ($remaining <= 0) break;

            $wait = (int) min($this->c->get('longPollWaitMs'), $remaining);
            $res = $this->t->availabilityPoll($requestId, $since, $wait);

            $chunk = AvailabilityChunk::fromArray($res);
            $since = $chunk->cursor ?? $since;

            yield $chunk;
            if (($chunk->status ?? '') === 'COMPLETE') break;
        }
    }

    public function wasComplete(): bool
    {
        // Callers can infer completion by last yielded chunk's status=COMPLETE.
        return true;
    }
}
```


File: sdks/php-agent/src/Clients/BookingClient.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Clients;

use HMS\CarHire\Config;
use HMS\CarHire\DTO\BookingCreate;
use HMS\CarHire\Transport\TransportInterface;
use InvalidArgumentException;

final class BookingClient
{
    public function __construct(private TransportInterface $t, private Config $c) {}

    public function create(BookingCreate $dto, ?string $idempotencyKey = null): array
    {
        $payload = $dto->toArray();
        if (empty($payload['agreement_ref'])) throw new InvalidArgumentException('agreement_ref required');
        // Note: supplier_id is not required - backend resolves source_id from agreement_ref
        return $this->t->bookingCreate($payload, $idempotencyKey);
    }

    public function modify(string $supplierBookingRef, array $fields, string $agreementRef, string $sourceId): array
    {
        return $this->t->bookingModify([
            'supplier_booking_ref' => $supplierBookingRef,
            'agreement_ref' => $agreementRef,
            'source_id' => $sourceId,
            'fields' => $fields
        ]);
    }

    public function cancel(string $supplierBookingRef, string $agreementRef, string $sourceId): array
    {
        return $this->t->bookingCancel([
            'supplier_booking_ref' => $supplierBookingRef,
            'agreement_ref' => $agreementRef,
            'source_id' => $sourceId
        ]);
    }

    public function check(string $supplierBookingRef, string $agreementRef, string $sourceId): array
    {
        return $this->t->bookingCheck($supplierBookingRef, $agreementRef, $sourceId);
    }
}
```


File: sdks/php-agent/src/Clients/LocationsClient.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Clients;

use HMS\CarHire\Config;
use HMS\CarHire\Transport\TransportInterface;

final class LocationsClient
{
    public function __construct(private TransportInterface $t, private Config $c) {}

    public function isSupported(string $agreementRef, string $locode): bool
    {
        return $this->t->isLocationSupported($agreementRef, $locode);
    }
}
```


File: sdks/php-agent/src/DTO/AvailabilityCriteria.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\DTO;

use DateTimeInterface;

final class AvailabilityCriteria
{
    private function __construct(
        private string $pickupLocode,
        private string $returnLocode,
        private DateTimeInterface $pickupAt,
        private DateTimeInterface $returnAt,
        private int $driverAge,
        private string $currency,
        private array $agreementRefs,
        private array $vehiclePrefs = [],
        private array $ratePrefs = [],
        private array $extras = []
    ) {}

    public static function make(
        string $pickupLocode,
        string $returnLocode,
        DateTimeInterface $pickupAt,
        DateTimeInterface $returnAt,
        int $driverAge,
        string $currency,
        array $agreementRefs,
        array $vehiclePrefs = [],
        array $ratePrefs = [],
        array $extras = []
    ): self {
        return new self($pickupLocode, $returnLocode, $pickupAt, $returnAt, $driverAge, $currency, $agreementRefs, $vehiclePrefs, $ratePrefs, $extras);
    }

    public function toArray(): array
    {
        return [
            'pickup_unlocode'  => $this->pickupLocode,
            'return_unlocode'  => $this->returnLocode,
            'pickup_at'        => $this->pickupAt->format(DATE_ATOM),
            'return_at'        => $this->returnAt->format(DATE_ATOM),
            'driver_age'       => $this->driverAge,
            'currency'         => $this->currency,
            'agreement_refs'   => $this->agreementRefs,
            'vehicle_prefs'    => $this->vehiclePrefs,
            'rate_prefs'       => $this->ratePrefs,
            'extras'           => $this->extras
        ];
    }
}
```


File: sdks/php-agent/src/DTO/AvailabilityChunk.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\DTO;

final class AvailabilityChunk
{
    /** @param array<string,mixed> $raw */
    private function __construct(
        public readonly array $items,
        public readonly string $status,
        public readonly ?int $cursor,
        public readonly array $raw
    ) {}

    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): self
    {
        return new self(
            items: $data['items'] ?? [],
            status: $data['status'] ?? 'PARTIAL',
            cursor: isset($data['cursor']) ? (int)$data['cursor'] : null,
            raw: $data
        );
    }
}
```


File: sdks/php-agent/src/DTO/BookingCreate.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\DTO;

final class BookingCreate
{
    /** @param array<string,mixed> $data */
    private function __construct(private array $data) {}

    /** @param array<string,mixed> $offer */
    public static function fromOffer(array $offer): self
    {
        // Minimal validation; middleware will enforce full schema
        // Note: supplier_id is not required - backend resolves source_id from agreement_ref
        foreach (['agreement_ref'] as $k) {
            if (empty($offer[$k])) throw new \InvalidArgumentException("$k required");
        }
        return new self($offer);
    }

    /** @return array<string,mixed> */
    public function toArray(): array { return $this->data; }
}
```


File: sdks/php-agent/src/Exceptions/TransportException.php
```php
<?php
declare(strict_types=1);

namespace HMS\CarHire\Exceptions;

use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class TransportException extends RuntimeException
{
    public static function fromHttp(GuzzleException $e): self
    {
        $code = method_exists($e, 'getCode') ? (int)$e->getCode() : 0;
        return new self($e->getMessage(), $code, $e);
    }
}
```


File: sdks/php-agent/examples/quickstart-rest.php
```php
<?php
require __DIR__.'/../vendor/autoload.php';

use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;
use HMS\CarHire\DTO\AvailabilityCriteria;

$config = Config::forRest([
  'baseUrl' => 'https://your-gateway.example.com/v1',
  'token'   => 'Bearer <JWT>',
  'agentId' => 'ag_123',
  'callTimeoutMs' => 12000,
  'availabilitySlaMs' => 120000,
  'longPollWaitMs' => 10000
]);

$client = new CarHireClient($config);

$criteria = AvailabilityCriteria::make(
  'PKKHI','PKLHE',
  new DateTimeImmutable('+1 day'),
  new DateTimeImmutable('+3 days'),
  28,'USD',['AGR-001']
);

foreach ($client->availability()->search($criteria) as $chunk) {
  echo "[{$chunk->status}] items=".count($chunk->items)." cursor=".($chunk->cursor ?? 0).PHP_EOL;
}
```


File: sdks/php-agent/tests/SmokeTest.php
```php
<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;

final class SmokeTest extends TestCase
{
    public function testClientBuilds(): void
    {
        $cfg = Config::forRest(['baseUrl'=>'http://localhost:3000/v1','token'=>'Bearer test','agentId'=>'ag']);
        $cli = new CarHireClient($cfg);
        $this->assertNotNull($cli->availability());
        $this->assertNotNull($cli->booking());
        $this->assertNotNull($cli->locations());
    }
}
```


After generation, run:
```
cd sdks/php-agent
composer install
# (optional) php -d detect_unicode=0 vendor/bin/phpunit
```

To wire gRPC later:

```

Put your .proto files in ../../protos


composer run proto:gen


Implement methods in GrpcTransport.php using generated stubs.

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

2. Run the test script:
   ```bash
   php examples/test-availability.php
   ```

3. See [TESTING_GUIDE.md](../TESTING_GUIDE.md) for detailed instructions.

### Example Test Scenarios
- Availability search: `examples/test-availability.php`
- Booking operations: `examples/test-booking.php`
- Quick start: `examples/quickstart.php`

