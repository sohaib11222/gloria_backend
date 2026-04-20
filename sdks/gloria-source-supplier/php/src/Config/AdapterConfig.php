<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Config;

/**
 * Endpoint paths and HTTP settings for {@see \Gloria\Client\Supplier\GloraOtaAdapter}.
 *
 * Paths are relative to baseUrl unless absolute URLs are passed per-operation in future extensions.
 */
final class AdapterConfig
{
    /**
     * @param array<string, string> $headers Default headers for every request (e.g. Authorization)
     * @param array<string, mixed> $extra Opaque bag for extensions
     */
    public function __construct(
        public readonly string $baseUrl,
        public readonly string $pathBranches = '/locations',
        public readonly string $pathSearch = '/availability',
        public readonly string $pathBook = '/booking',
        public readonly string $pathCancel = '/cancel',
        public readonly string $pathStatus = '/status',
        public readonly string $requestorId = '1000097',
        public readonly float $timeoutSeconds = 30.0,
        public readonly float $connectTimeoutSeconds = 10.0,
        public readonly array $headers = [],
        public readonly string $branchesRequestRoot = 'OTA_VehLocSearchRQ',
        public readonly array $extra = [],
    ) {}

    public function url(string $path): string
    {
        $base = rtrim($this->baseUrl, '/');
        $p = '/' . ltrim($path, '/');
        return $base . $p;
    }
}
