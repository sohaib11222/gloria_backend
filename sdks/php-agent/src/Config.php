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
        // Validation
        if (empty($data['host']) || !is_string($data['host']) || trim($data['host']) === '') {
            throw new \InvalidArgumentException('host is required for gRPC configuration');
        }
        if (empty($data['caCert']) || !is_string($data['caCert']) || trim($data['caCert']) === '') {
            throw new \InvalidArgumentException('caCert is required for gRPC configuration');
        }
        if (empty($data['clientCert']) || !is_string($data['clientCert']) || trim($data['clientCert']) === '') {
            throw new \InvalidArgumentException('clientCert is required for gRPC configuration');
        }
        if (empty($data['clientKey']) || !is_string($data['clientKey']) || trim($data['clientKey']) === '') {
            throw new \InvalidArgumentException('clientKey is required for gRPC configuration');
        }
        
        // Validate timeouts if provided
        if (isset($data['callTimeoutMs'])) {
            $timeout = is_numeric($data['callTimeoutMs']) ? (int) $data['callTimeoutMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('callTimeoutMs must be at least 1000ms');
            }
        }
        if (isset($data['availabilitySlaMs'])) {
            $timeout = is_numeric($data['availabilitySlaMs']) ? (int) $data['availabilitySlaMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('availabilitySlaMs must be at least 1000ms');
            }
        }
        if (isset($data['longPollWaitMs'])) {
            $timeout = is_numeric($data['longPollWaitMs']) ? (int) $data['longPollWaitMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('longPollWaitMs must be at least 1000ms');
            }
        }
        
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
        // Validation
        if (empty($data['baseUrl']) || !is_string($data['baseUrl']) || trim($data['baseUrl']) === '') {
            throw new \InvalidArgumentException('baseUrl is required for REST configuration');
        }
        if (empty($data['token']) || !is_string($data['token']) || trim($data['token']) === '') {
            throw new \InvalidArgumentException('token is required for REST configuration');
        }
        
        // Validate timeouts if provided
        if (isset($data['callTimeoutMs'])) {
            $timeout = is_numeric($data['callTimeoutMs']) ? (int) $data['callTimeoutMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('callTimeoutMs must be at least 1000ms');
            }
        }
        if (isset($data['availabilitySlaMs'])) {
            $timeout = is_numeric($data['availabilitySlaMs']) ? (int) $data['availabilitySlaMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('availabilitySlaMs must be at least 1000ms');
            }
        }
        if (isset($data['longPollWaitMs'])) {
            $timeout = is_numeric($data['longPollWaitMs']) ? (int) $data['longPollWaitMs'] : 0;
            if ($timeout < 1000) {
                throw new \InvalidArgumentException('longPollWaitMs must be at least 1000ms');
            }
        }
        
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

