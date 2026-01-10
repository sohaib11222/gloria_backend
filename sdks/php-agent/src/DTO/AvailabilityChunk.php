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

