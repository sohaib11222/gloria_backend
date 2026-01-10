<?php
declare(strict_types=1);

namespace HMS\CarHire\Exceptions;

use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class TransportException extends RuntimeException
{
    public static function fromHttp(GuzzleException $e): self
    {
        $code = method_exists($e, 'getCode') ? (int)$e->getCode() : 0;
        return new self($e->getMessage(), $code, $e);
    }
}

