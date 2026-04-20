<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Xml;

/**
 * OTA_VehRetResRQ — retrieve reservation status (pairs with OTA_VehRetResRS).
 */
final class VehRetResRqBuilder
{
    public static function build(string $uniqueId, string $idContext, string $requestorId = '1000097'): string
    {
        $xml = new \DOMDocument('1.0', 'UTF-8');
        $xml->formatOutput = true;

        $root = $xml->createElementNS('http://www.opentravel.org/OTA/2003/05', 'OTA_VehRetResRQ');
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

        $core = $xml->createElement('VehRetResRQCore');
        $uid = $xml->createElement('UniqueID');
        $uid->setAttribute('ID', $uniqueId);
        $uid->setAttribute('ID_Context', $idContext);
        $uid->setAttribute('Type', '14');
        $core->appendChild($uid);
        $root->appendChild($core);

        return $xml->saveXML();
    }
}
