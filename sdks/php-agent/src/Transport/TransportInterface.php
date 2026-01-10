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
    public function bookingCheck(string $supplierBookingRef, string $agreementRef, ?string $sourceId = null): array;
}

