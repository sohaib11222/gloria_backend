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

