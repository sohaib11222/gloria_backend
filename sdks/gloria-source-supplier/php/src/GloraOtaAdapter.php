<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier;

use Gloria\Client\Supplier\Config\AdapterConfig;
use Gloria\Client\Supplier\Exception\SupplierException;
use Gloria\Client\Supplier\Normalizer\OtaResponseNormalizer;
use Gloria\Client\Supplier\Xml\VehAvailRateRqBuilder;
use Gloria\Client\Supplier\Xml\VehCancelRqBuilder;
use Gloria\Client\Supplier\Xml\VehLocSearchRqBuilder;
use Gloria\Client\Supplier\Xml\VehResRqBuilder;
use Gloria\Client\Supplier\Xml\VehRetResRqBuilder;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * Client-side OTA adapter: builds OTA XML, POSTs to supplier HTTP, returns normalized JSON arrays.
 * XML stays here; gRPC wrapper only sees JSON over HTTP to Laravel.
 */
final class GloraOtaAdapter
{
    private Client $http;
    private LoggerInterface $logger;

    public function __construct(
        private readonly AdapterConfig $config,
        ?Client $http = null,
        ?LoggerInterface $logger = null
    ) {
        $this->http = $http ?? new Client([
            'timeout' => $config->timeoutSeconds,
            'connect_timeout' => $config->connectTimeoutSeconds,
            'http_errors' => false,
        ]);
        $this->logger = $logger ?? new NullLogger();
    }

    public function setLogger(LoggerInterface $logger): void
    {
        $this->logger = $logger;
    }

    /**
     * @return list<array{id: string, name: string, city: string}>
     */
    public function getBranches(?string $cityCode = null): array
    {
        $xml = VehLocSearchRqBuilder::build($cityCode, $this->config->requestorId);
        $body = $this->postXml($this->config->pathBranches, $xml);
        return OtaResponseNormalizer::branchesFromXml($body);
    }

    /**
     * @param array{
     *   pickup_unlocode: string,
     *   dropoff_unlocode: string,
     *   pickup_iso: string,
     *   dropoff_iso: string,
     *   driver_age?: int,
     *   residency_country?: string
     * } $criteria
     * @return list<array{id: string, name: string, price: float, currency: string}>
     */
    public function searchCars(array $criteria): array
    {
        $xml = VehAvailRateRqBuilder::build($criteria, $this->config->requestorId);
        $body = $this->postXml($this->config->pathSearch, $xml);
        $trim = ltrim($body);
        if ($trim !== '' && ($trim[0] === '{' || $trim[0] === '[')) {
            try {
                $json = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return OtaResponseNormalizer::carsFromVehAvailXml($body);
            }
            if (is_array($json) && isset($json['VehAvailRSCore'])) {
                return OtaResponseNormalizer::carsFromVehAvailJson($json);
            }
        }
        return OtaResponseNormalizer::carsFromVehAvailXml($body);
    }

    /**
     * @param array{
     *   agent_id: string,
     *   agent_company_name?: string,
     *   agreement_ref: string,
     *   supplier_offer_ref?: string,
     *   agent_booking_ref?: string,
     *   pickup_unlocode?: string,
     *   dropoff_unlocode?: string,
     *   pickup_iso?: string,
     *   dropoff_iso?: string,
     *   vehicle_class?: string,
     *   vehicle_make_model?: string,
     *   rate_plan_code?: string,
     *   driver_age?: int,
     *   residency_country?: string
     * } $data
     * @return array{reservation_id: string, status: string}
     */
    public function bookCar(array $data): array
    {
        $xml = VehResRqBuilder::build($data);
        $body = $this->postXml($this->config->pathBook, $xml);
        return OtaResponseNormalizer::bookingFromVehResRs($body);
    }

    /**
     * @return array{reservation_id: string, status: string}
     */
    public function cancelBooking(string $reservationId, ?string $agreementRef = null): array
    {
        unset($agreementRef);
        $xml = VehCancelRqBuilder::build($reservationId, '14', $this->config->requestorId);
        $body = $this->postXml($this->config->pathCancel, $xml);
        return OtaResponseNormalizer::bookingFromCancelRs($body);
    }

    /**
     * @return array{reservation_id: string, status: string}
     */
    public function getBookingStatus(string $reservationId, ?string $agreementRef = null): array
    {
        unset($agreementRef);
        $xml = VehRetResRqBuilder::build($reservationId, '14', $this->config->requestorId);
        $body = $this->postXml($this->config->pathStatus, $xml);
        return OtaResponseNormalizer::bookingFromVehRetResRs($body);
    }

    private function postXml(string $path, string $xml): string
    {
        $url = $this->config->url($path);
        $headers = array_merge(
            [
                'Content-Type' => 'text/xml; charset=UTF-8',
                'Accept' => 'application/xml, text/xml, application/json, */*',
            ],
            $this->config->headers
        );
        $this->logger->debug('GloraOtaAdapter POST', ['url' => $url, 'snippet' => substr($xml, 0, 200)]);

        try {
            $response = $this->http->post($url, [
                'headers' => $headers,
                'body' => $xml,
            ]);
        } catch (GuzzleException $e) {
            $code = str_contains(strtolower($e->getMessage()), 'timeout') || str_contains(strtolower($e->getMessage()), 'timed out')
                ? 'SUPPLIER_TIMEOUT'
                : 'SUPPLIER_HTTP';
            throw new SupplierException($e->getMessage(), $code, $e);
        }

        $code = $response->getStatusCode();
        $body = (string) $response->getBody();
        if ($code < 200 || $code >= 300) {
            throw new SupplierException(
                'Supplier HTTP ' . $code . ': ' . substr($body, 0, 500),
                'SUPPLIER_HTTP'
            );
        }
        if ($body === '') {
            throw new SupplierException('Empty response body', 'EMPTY_RESPONSE');
        }

        if (stripos($body, '<Error') !== false || stripos($body, 'fault') !== false) {
            $this->logger->warning('OTA fault hint in body', ['body' => substr($body, 0, 400)]);
        }

        return $body;
    }
}
