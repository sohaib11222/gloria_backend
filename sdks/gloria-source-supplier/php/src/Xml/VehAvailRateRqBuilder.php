<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Xml;

/**
 * Mirrors {@see buildOtaVehAvailRateRQ} in gloriaconnect_backend/src/services/otaXmlBuilder.ts
 */
final class VehAvailRateRqBuilder
{
    /**
     * @param array{
     *   pickup_unlocode: string,
     *   dropoff_unlocode: string,
     *   pickup_iso: string,
     *   dropoff_iso: string,
     *   driver_age?: int,
     *   residency_country?: string
     * } $criteria
     */
    public static function build(array $criteria, string $requestorId = '1000097'): string
    {
        $ts = (new \DateTimeImmutable('now'))->format('Y-m-d\TH:i:s');
        $driverAge = (string) ($criteria['driver_age'] ?? 30);
        $residency = $criteria['residency_country'] ?? 'US';

        $xml = new \DOMDocument('1.0', 'UTF-8');
        $xml->formatOutput = true;

        $root = $xml->createElementNS('http://www.opentravel.org/OTA/2003/05', 'OTA_VehAvailRateRQ');
        $root->setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
        $root->setAttribute('xsi:schemaLocation', 'http://www.opentravel.org/OTA/2003/05 OTA_VehAvailRateRQ.xsd');
        $root->setAttribute('TimeStamp', $ts);
        $root->setAttribute('Target', 'Production');
        $root->setAttribute('Version', '1.002');
        $xml->appendChild($root);

        $pos = $xml->createElement('POS');
        $source = $xml->createElement('Source');
        $rqId = $xml->createElement('RequestorID');
        $rqId->setAttribute('Type', '5');
        $rqId->setAttribute('ID', $requestorId);
        $source->appendChild($rqId);
        $pos->appendChild($source);
        $root->appendChild($pos);

        $core = $xml->createElement('VehAvailRQCore');
        $core->setAttribute('Status', 'Available');
        $vehRental = $xml->createElement('VehRentalCore');
        $vehRental->setAttribute('PickUpDateTime', $criteria['pickup_iso']);
        $vehRental->setAttribute('ReturnDateTime', $criteria['dropoff_iso']);
        $pu = $xml->createElement('PickUpLocation');
        $pu->setAttribute('LocationCode', $criteria['pickup_unlocode']);
        $rl = $xml->createElement('ReturnLocation');
        $rl->setAttribute('LocationCode', $criteria['dropoff_unlocode']);
        $vehRental->appendChild($pu);
        $vehRental->appendChild($rl);
        $core->appendChild($vehRental);
        $dt = $xml->createElement('DriverType');
        $dt->setAttribute('Age', $driverAge);
        $core->appendChild($dt);
        $root->appendChild($core);

        $info = $xml->createElement('VehAvailRQInfo');
        $cust = $xml->createElement('Customer');
        $prim = $xml->createElement('Primary');
        $cc = $xml->createElement('CitizenCountryName');
        $cc->setAttribute('Code', $residency);
        $prim->appendChild($cc);
        $cust->appendChild($prim);
        $info->appendChild($cust);
        $root->appendChild($info);

        return $xml->saveXML();
    }
}
