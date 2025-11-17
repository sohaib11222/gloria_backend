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
            'apiKey' => null, // [AUTO-AUDIT]
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
            'apiKey' => null, // [AUTO-AUDIT]
        ];
        return new self(false, $data + $defaults);
    }

    public function isGrpc(): bool { return $this->grpc; }
    public function get(string $key, mixed $default = null): mixed { return $this->data[$key] ?? $default; }
    public function withCorrelationId(string $id): self { $c = clone $this; $c->data['correlationId'] = $id; return $c; }
}

