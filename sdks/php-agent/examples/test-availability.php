<?php
/**
 * Test script for availability search
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: php examples/test-availability.php
 * 
 * Or set environment variables:
 *   BASE_URL=http://localhost:8080 JWT_TOKEN=your_token php examples/test-availability.php
 */

require __DIR__.'/../vendor/autoload.php';

// Load environment variables from .env file if available
if (file_exists(__DIR__.'/../.env')) {
    $lines = file(__DIR__.'/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $_ENV[trim($key)] = trim($value);
    }
}

use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;
use HMS\CarHire\DTO\AvailabilityCriteria;

// Get configuration from environment variables
$baseUrl = $_ENV['BASE_URL'] ?? getenv('BASE_URL') ?: 'http://localhost:8080';
$token = $_ENV['JWT_TOKEN'] ?? getenv('JWT_TOKEN') ?: '';
$agentId = $_ENV['AGENT_ID'] ?? getenv('AGENT_ID') ?: '';

if (empty($token)) {
    echo "Error: JWT_TOKEN environment variable is required\n";
    echo "Please set JWT_TOKEN or create a .env file with your credentials\n";
    exit(1);
}

// Create configuration
$config = Config::forRest([
    'baseUrl' => $baseUrl,
    'token' => "Bearer {$token}",
    'agentId' => $agentId ?: null,
]);

// Create client
$client = new CarHireClient($config);

// Test data from environment variables
$pickupLocode = $_ENV['PICKUP_LOCODE'] ?? getenv('PICKUP_LOCODE') ?: 'PKKHI';
$returnLocode = $_ENV['RETURN_LOCODE'] ?? getenv('RETURN_LOCODE') ?: 'PKLHE';
$pickupDate = $_ENV['PICKUP_DATE'] ?? getenv('PICKUP_DATE') ?: '2025-12-01T10:00:00Z';
$returnDate = $_ENV['RETURN_DATE'] ?? getenv('RETURN_DATE') ?: '2025-12-03T10:00:00Z';
$driverAge = (int)($_ENV['DRIVER_AGE'] ?? getenv('DRIVER_AGE') ?: '28');
$currency = $_ENV['CURRENCY'] ?? getenv('CURRENCY') ?: 'USD';
$agreementRef = $_ENV['AGREEMENT_REF'] ?? getenv('AGREEMENT_REF') ?: 'AGR-001';

try {
    echo "=== Testing Availability Search ===\n";
    echo "Base URL: {$baseUrl}\n";
    echo "Pickup: {$pickupLocode} at {$pickupDate}\n";
    echo "Return: {$returnLocode} at {$returnDate}\n";
    echo "Driver Age: {$driverAge}, Currency: {$currency}\n";
    echo "Agreement: {$agreementRef}\n";
    echo "\n";

    // Create availability criteria
    $criteria = AvailabilityCriteria::make(
        $pickupLocode,
        $returnLocode,
        new DateTimeImmutable($pickupDate),
        new DateTimeImmutable($returnDate),
        $driverAge,
        $currency,
        [$agreementRef]
    );

    echo "Searching availability...\n";
    echo "\n";

    // Search availability (streaming)
    $chunkCount = 0;
    $totalOffers = 0;

    foreach ($client->availability()->search($criteria) as $chunk) {
        $chunkCount++;
        $status = $chunk->status ?? 'PARTIAL';
        $items = $chunk->items ?? [];
        $totalOffers += count($items);

        echo "[Chunk {$chunkCount}] Status: {$status}, Offers: " . count($items) . "\n";

        if (count($items) > 0) {
            // Show first offer as example
            $firstOffer = $items[0];
            $vehicleClass = $firstOffer->vehicle_class ?? 'N/A';
            $makeModel = $firstOffer->make_model ?? 'N/A';
            $price = $firstOffer->total_price ?? 'N/A';
            $offerCurrency = $firstOffer->currency ?? $currency;
            $sourceId = $firstOffer->source_id ?? 'N/A';
            echo "  Example offer: {$vehicleClass} - {$makeModel}\n";
            echo "    Price: {$offerCurrency} {$price}\n";
            echo "    Source: {$sourceId}\n";
        }

        if ($status === 'COMPLETE') {
            echo "\n";
            echo "✓ Search complete! Total chunks: {$chunkCount}, Total offers: {$totalOffers}\n";
            break;
        }
    }

    if ($chunkCount === 0) {
        echo "⚠ No availability chunks received\n";
    }

} catch (Exception $error) {
    echo "❌ Error: {$error->getMessage()}\n";
    if (method_exists($error, 'getStatusCode')) {
        echo "   Status Code: {$error->getStatusCode()}\n";
    }
    if (method_exists($error, 'getCode')) {
        echo "   Error Code: {$error->getCode()}\n";
    }
    exit(1);
}

