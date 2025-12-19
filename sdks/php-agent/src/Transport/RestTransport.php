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
            // Backend doesn't have a direct /locations/supported endpoint
            // Instead, we check by getting agreement locations and checking if locode is in the list
            // First, we need to get the agreement ID from the agreement_ref
            // For now, we'll use the coverage endpoint: GET /coverage/agreement/{agreementId}
            // But we need agreement ID, not ref. Since we only have ref, we'll need to:
            // Option 1: List agreements and find by ref, then get coverage
            // Option 2: The SDK client should handle this by getting agreement first
            // For now, return false if we can't validate (safer default)
            // TODO: Implement proper location support check via agreement coverage endpoint
            
            // This is a placeholder - actual implementation would require:
            // 1. Get agreement by ref (via /agreements endpoint with filter)
            // 2. Get coverage for that agreement (via /coverage/agreement/{id})
            // 3. Check if locode is in the coverage list
            
            // For now, return false to be safe (location not supported until verified)
            // SDK users should check locations via the agreement coverage endpoint directly
            return false;
        } catch (GuzzleException $e) {
            // On error, assume not supported for safety
            return false;
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
            // Backend expects agreement_ref in query string, fields in body
            // Extract agreement_ref from payload for query param
            $agreementRef = $payload['agreement_ref'] ?? '';
            $fields = $payload['fields'] ?? [];
            $supplierBookingRef = $payload['supplier_booking_ref'];
            
            $resp = $this->http->patch('bookings/'.$supplierBookingRef, [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref' => $agreementRef],
                'json'    => $fields, // Send fields as body
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
            // Backend expects agreement_ref in query string
            $agreementRef = $payload['agreement_ref'] ?? '';
            $supplierBookingRef = $payload['supplier_booking_ref'];
            
            $resp = $this->http->post('bookings/'.$supplierBookingRef.'/cancel', [
                'headers' => $this->headers(),
                'query'   => ['agreement_ref' => $agreementRef],
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }

    public function bookingCheck(string $supplierBookingRef, string $agreementRef, ?string $sourceId = null): array
    {
        try {
            // Backend expects agreement_ref in query string, source_id is resolved from agreement
            $query = ['agreement_ref' => $agreementRef];
            // source_id is optional and backend resolves it, but we can pass it if provided
            if ($sourceId) {
                $query['source_id'] = $sourceId;
            }
            
            $resp = $this->http->get("bookings/{$supplierBookingRef}", [
                'headers' => $this->headers(),
                'query'   => $query,
                'timeout' => $this->config->get('callTimeoutMs')/1000 + 2
            ]);
            return $this->decode($resp);
        } catch (GuzzleException $e) {
            throw TransportException::fromHttp($e);
        }
    }
}

