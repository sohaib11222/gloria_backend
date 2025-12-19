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
    public function bookingCheck(string $supplierBookingRef, string $agreementRef, ?string $sourceId = null): array
    {
        throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
    }
}

