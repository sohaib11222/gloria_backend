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
        foreach (['agreement_ref','supplier_id','offer_id'] as $k) {
            if (empty($offer[$k])) throw new \InvalidArgumentException("$k required");
        }
        return new self($offer);
    }

    /** @return array<string,mixed> */
    public function toArray(): array { return $this->data; }
}

