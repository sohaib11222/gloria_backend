<?php
require __DIR__.'/../vendor/autoload.php';

use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;
use HMS\CarHire\DTO\AvailabilityCriteria;

$config = Config::forRest([
  'baseUrl' => 'https://your-gateway.example.com/v1',
  'token'   => 'Bearer <JWT>',
  'agentId' => 'ag_123',
  'callTimeoutMs' => 12000,
  'availabilitySlaMs' => 120000,
  'longPollWaitMs' => 10000
]);

$client = new CarHireClient($config);

$criteria = AvailabilityCriteria::make(
  'PKKHI','PKLHE',
  new DateTimeImmutable('+1 day'),
  new DateTimeImmutable('+3 days'),
  28,'USD',['AGR-001']
);

foreach ($client->availability()->search($criteria) as $chunk) {
  echo "[{$chunk->status}] items=".count($chunk->items)." cursor=".($chunk->cursor ?? 0).PHP_EOL;
}

