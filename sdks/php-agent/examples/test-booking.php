<?php
/**
 * Test script for booking operations
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: php examples/test-booking.php
 */

require __DIR__.'/../vendor/autoload.php';

// Load environment variables (similar to test-availability.php)
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
use HMS\CarHire\DTO\BookingCreate;

$baseUrl = $_ENV['BASE_URL'] ?? getenv('BASE_URL') ?: 'http://localhost:8080';
$token = $_ENV['JWT_TOKEN'] ?? getenv('JWT_TOKEN') ?: '';

if (empty($token)) {
    echo "Error: JWT_TOKEN environment variable is required\n";
    exit(1);
}

$config = Config::forRest([
    'baseUrl' => $baseUrl,
    'token' => "Bearer {$token}",
]);

$client = new CarHireClient($config);

try {
    echo "=== Testing Booking Operations ===\n";
    echo "\n";

    // Step 1: Search for availability first
    echo "Step 1: Searching for availability...\n";
    $criteria = AvailabilityCriteria::make(
        $_ENV['PICKUP_LOCODE'] ?? 'PKKHI',
        $_ENV['RETURN_LOCODE'] ?? 'PKLHE',
        new DateTimeImmutable($_ENV['PICKUP_DATE'] ?? '2025-12-01T10:00:00Z'),
        new DateTimeImmutable($_ENV['RETURN_DATE'] ?? '2025-12-03T10:00:00Z'),
        (int)($_ENV['DRIVER_AGE'] ?? '28'),
        $_ENV['CURRENCY'] ?? 'USD',
        [$_ENV['AGREEMENT_REF'] ?? 'AGR-001'],
    );

    $selectedOffer = null;
    foreach ($client->availability()->search($criteria) as $chunk) {
        $items = $chunk->items ?? [];
        if (count($items) > 0) {
            $selectedOffer = $items[0];
            echo "✓ Found offer: " . ($selectedOffer->vehicle_class ?? 'N/A') . " - " . ($selectedOffer->make_model ?? 'N/A') . "\n";
            echo "  Price: " . ($selectedOffer->currency ?? 'USD') . " " . ($selectedOffer->total_price ?? 'N/A') . "\n";
            break;
        }
        if (($chunk->status ?? '') === 'COMPLETE') {
            break;
        }
    }

    if (!$selectedOffer) {
        echo "⚠ No offers found. Cannot test booking creation.\n";
        return;
    }

    echo "\n";

    // Step 2: Create booking
    echo "Step 2: Creating booking...\n";
    $bookingData = BookingCreate::fromOffer($selectedOffer, [
        'agreement_ref' => $_ENV['AGREEMENT_REF'] ?? 'AGR-001',
        'driver' => [
            'firstName' => 'John',
            'lastName' => 'Doe',
            'email' => 'john.doe@example.com',
            'phone' => '+1234567890',
            'age' => (int)($_ENV['DRIVER_AGE'] ?? '28'),
        ],
        'agent_booking_ref' => 'TEST-' . time(),
    ]);

    $booking = $client->booking()->create($bookingData);
    $bookingRef = $booking->supplier_booking_ref ?? $booking->id ?? 'N/A';
    $status = $booking->status ?? 'N/A';
    echo "✓ Booking created: {$bookingRef}\n";
    echo "  Status: {$status}\n";
    echo "\n";

    // Step 3: Check booking status
    if (isset($booking->supplier_booking_ref)) {
        echo "Step 3: Checking booking status...\n";
        $status = $client->booking()->check($booking->supplier_booking_ref, $_ENV['AGREEMENT_REF'] ?? 'AGR-001');
        echo "✓ Booking status: " . ($status->status ?? 'N/A') . "\n";
        echo "\n";
    }

    echo "✓ All booking tests completed successfully!\n";

} catch (Exception $error) {
    echo "❌ Error: {$error->getMessage()}\n";
    if (method_exists($error, 'getStatusCode')) {
        echo "   Status Code: {$error->getStatusCode()}\n";
    }
    exit(1);
}

