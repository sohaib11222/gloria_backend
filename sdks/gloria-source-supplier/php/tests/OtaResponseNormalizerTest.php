<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Tests;

use Gloria\Client\Supplier\Normalizer\OtaResponseNormalizer;
use PHPUnit\Framework\TestCase;

final class OtaResponseNormalizerTest extends TestCase
{
    public function testCarsFromXmlFixture(): void
    {
        $xml = file_get_contents(__DIR__ . '/fixtures/veh_avail_sample.xml');
        $cars = OtaResponseNormalizer::carsFromVehAvailXml($xml);
        $this->assertNotEmpty($cars);
        $this->assertArrayHasKey('id', $cars[0]);
        $this->assertArrayHasKey('currency', $cars[0]);
    }

    public function testBranchesFromXmlFixture(): void
    {
        $xml = file_get_contents(__DIR__ . '/fixtures/veh_loc_sample.xml');
        $branches = OtaResponseNormalizer::branchesFromXml($xml);
        $this->assertNotEmpty($branches);
        $this->assertSame('DXBA02', $branches[0]['id']);
    }
}
