<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Xml;

/**
 * Minimal OTA_VehLocSearchRQ for branch/location lists.
 * Suppliers may require different criteria; extend via {@see AdapterConfig::$extra}.
 */
final class VehLocSearchRqBuilder
{
    public static function build(
        ?string $cityCode = null,
        string $requestorId = '1000097'
    ): string {
        $xml = new \DOMDocument('1.0', 'UTF-8');
        $xml->formatOutput = true;

        $root = $xml->createElementNS('http://www.opentravel.org/OTA/2003/05', 'OTA_VehLocSearchRQ');
        $root->setAttribute('TimeStamp', (new \DateTimeImmutable('now'))->format('c'));
        $root->setAttribute('Target', 'Production');
        $root->setAttribute('Version', '1.000');
        $xml->appendChild($root);

        $pos = $xml->createElement('POS');
        $source = $xml->createElement('Source');
        $rq = $xml->createElement('RequestorID');
        $rq->setAttribute('Type', '5');
        $rq->setAttribute('ID', $requestorId);
        $source->appendChild($rq);
        $pos->appendChild($source);
        $root->appendChild($pos);

        if ($cityCode !== null && $cityCode !== '') {
            $vls = $xml->createElement('VehLocSearchCriterion');
            $ref = $xml->createElement('RefPoint', $cityCode);
            $vls->appendChild($ref);
            $root->appendChild($vls);
        }

        return $xml->saveXML();
    }
}
