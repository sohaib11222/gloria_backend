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

