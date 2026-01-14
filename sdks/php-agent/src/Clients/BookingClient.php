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

    public function modify(string $supplierBookingRef, array $fields, string $agreementRef, ?string $sourceId = null): array
    {
        // Backend resolves source_id from agreement_ref, so we don't need to pass it
        // But we keep the parameter for backward compatibility
        return $this->t->bookingModify([
            'supplier_booking_ref' => $supplierBookingRef,
            'agreement_ref' => $agreementRef,
            'fields' => $fields
        ]);
    }

    public function cancel(string $supplierBookingRef, string $agreementRef, ?string $sourceId = null): array
    {
        // Backend resolves source_id from agreement_ref, so we don't need to pass it
        // But we keep the parameter for backward compatibility
        return $this->t->bookingCancel([
            'supplier_booking_ref' => $supplierBookingRef,
            'agreement_ref' => $agreementRef
        ]);
    }

    public function check(string $supplierBookingRef, string $agreementRef, ?string $sourceId = null): array
    {
        // Backend resolves source_id from agreement_ref, so we don't need to pass it
        // But we keep the parameter for backward compatibility
        return $this->t->bookingCheck($supplierBookingRef, $agreementRef, $sourceId);
    }
}

