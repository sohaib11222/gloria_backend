<?php
declare(strict_types=1);

namespace HMS\CarHire\Transport;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use HMS\CarHire\Config;
use HMS\CarHire\Exceptions\TransportException;

final class RestTransport implements TransportInterface
{
    private Client $http;

    public function __construct(private Config $config)
    {
        $this->http = new Client([
            'base_uri' => rtrim($config->get('baseUrl'), '/').'/',
            'timeout'  => max(ceil(($config->get('longPollWaitMs')+2000)/1000), 12),
        ]);
    }

    private function headers(array $extra = []): array
    {
        $base = [
            'Authorization'    => $this->config->get('token'),
            'Content-Type'     => 'application/json',
            'Accept'           => 'application/json',
            'X-Agent-Id'       => $this->config->get('agentId'),
            'X-Correlation-Id' => $this->config->get('correlationId'),
        ];
        // [AUTO-AUDIT] Support API key header when provided
        if ($this->config->get('apiKey')) {
            $base['X-API-Key'] = $this->config->get('apiKey');
        }
        return array_merge($base, $extra);
    }

    private function decode($resp): array
    {
        $body = (string) $resp->getBody();
        $json = json_decode($body, true);
        return is_array($json) ? $json : [];
    }

    public function availabilitySubmit(array $criteria): array
    {
        try {
            // [AUTO-AUDIT] Align with middleware REST endpoints
            $resp = $this->http->post('availability/submit', [
                'headers' => $this->headers(),
                'json'    => $criteria,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function availabilityPoll(string $requestId, int $sinceSeq, int $waitMs): array
    {
        try {
            $resp = $this->http->get('availability/poll', [
                'headers' => $this->headers(),
                'query'   => ['request_id'=>$requestId,'since_seq'=>$sinceSeq,'wait_ms'=>$waitMs],
                'timeout' => max(($waitMs/1000)+2, $this->config->get('callTimeoutMs')/1000 + 2)
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function isLocationSupported(string $agreementRef, string $locode): bool
    {
        try {
            $resp = $this->http->get('locations/supported', [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref'=>$agreementRef, 'locode'=>$locode],
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            $data = $this->decode($resp);
            return (bool)($data['supported'] ?? false);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCreate(array $payload, ?string $idempotencyKey = null): array
    {
        try {
            $resp = $this->http->post('bookings', [
                'headers' => $this->headers($idempotencyKey ? ['Idempotency-Key'=>$idempotencyKey] : []),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingModify(array $payload): array
    {
        try {
            $resp = $this->http->patch('bookings/'.$payload['supplier_booking_ref'], [
                'headers' => $this->headers(),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCancel(array $payload): array
    {
        try {
            $resp = $this->http->post('bookings/'.$payload['supplier_booking_ref'].'/cancel', [
                'headers' => $this->headers(),
                'json'    => $payload,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCheck(string $supplierBookingRef, string $agreementRef, string $sourceId): array
    {
        try {
            $resp = $this->http->get("bookings/{$supplierBookingRef}", [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref'=>$agreementRef, 'source_id'=>$sourceId],
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }
}

