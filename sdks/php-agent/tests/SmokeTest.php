<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use HMS\CarHire\Config;
use HMS\CarHire\CarHireClient;

final class SmokeTest extends TestCase
{
    public function testClientBuilds(): void
    {
        $cfg = Config::forRest(['baseUrl'=>'http://localhost:3000/v1','token'=>'Bearer test','agentId'=>'ag']);
        $cli = new CarHireClient($cfg);
        $this->assertNotNull($cli->availability());
        $this->assertNotNull($cli->booking());
        $this->assertNotNull($cli->locations());
    }
}

