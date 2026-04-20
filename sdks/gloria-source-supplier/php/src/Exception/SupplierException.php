<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Exception;

use RuntimeException;

/**
 * Thrown when supplier HTTP, OTA fault, or local config/parse fails.
 * {@see $code} uses stable machine codes: CONFIG_ERROR, SUPPLIER_TIMEOUT, etc.
 */
final class SupplierException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $errorCode,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, 0, $previous);
    }
}
