<?php
/**
 * Quick Start Example
 * 
 * This is a minimal example showing how to use the Car-Hire SDK.
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: php examples/quickstart.php
 */

require __DIR__.'/../vendor/autoload.php';

use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;
use HMS\CarHire\DTO\AvailabilityCriteria;

// 1. Create configuration
$config = Config::forRest([
    'baseUrl' => $_ENV['BASE_URL'] ?? getenv('BASE_URL') ?: 'http://localhost:8080',
    'token' => 'Bearer ' . ($_ENV['JWT_TOKEN'] ?? getenv('JWT_TOKEN') ?: ''),
    'agentId' => $_ENV['AGENT_ID'] ?? getenv('AGENT_ID'),
]);

// 2. Create client
$client = new CarHireClient($config);

// 3. Create availability criteria
$criteria = AvailabilityCriteria::make(
    'PKKHI',
    'PKLHE',
    new DateTimeImmutable('2025-12-01T10:00:00Z'),
    new DateTimeImmutable('2025-12-03T10:00:00Z'),
    28,
    'USD',
    ['AGR-001'],
);

// 4. Search availability (streaming)
echo "Searching availability...\n";
foreach ($client->availability()->search($criteria) as $chunk) {
    $items = $chunk->items ?? [];
    $status = $chunk->status ?? 'PARTIAL';
    echo "Received " . count($items) . " offers (status: {$status})\n";
    
    if ($status === 'COMPLETE') {
        break;
    }
}

echo "Done!\n";

