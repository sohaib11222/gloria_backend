<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Xml;

/**
 * Subset of {@see buildOtaVehResRQ} (gloriaconnect_backend otaXmlBuilder.ts) sufficient for bookCar().
 *
 * @param array{
 *   agent_id: string,
 *   agent_company_name?: string,
 *   agreement_ref: string,
 *   supplier_offer_ref?: string,
 *   agent_booking_ref?: string,
 *   pickup_unlocode?: string,
 *   dropoff_unlocode?: string,
 *   pickup_iso?: string,
 *   dropoff_iso?: string,
 *   vehicle_class?: string,
 *   vehicle_make_model?: string,
 *   rate_plan_code?: string,
 *   driver_age?: int,
 *   residency_country?: string
 * } $data
 */
final class VehResRqBuilder
{
    public static function build(array $data): string
    {
        $xml = new \DOMDocument('1.0', 'UTF-8');
        $xml->formatOutput = true;

        $root = $xml->createElementNS('http://www.opentravel.org/OTA/2003/05', 'OTA_VehResRQ');
        $root->setAttribute('TimeStamp', (new \DateTimeImmutable('now'))->format('c'));
        $root->setAttribute('Target', 'Production');
        $root->setAttribute('Version', '1.000');
        $root->setAttribute('ReqRespVersion', '2024A');
        $xml->appendChild($root);

        $pos = $xml->createElement('POS');
        $source = $xml->createElement('Source');
        $rqId = $xml->createElement('RequestorID');
        $rqId->setAttribute('ID', $data['agent_id']);
        $rqId->setAttribute('ID_Context', 'MIDDLEWARE');
        $rqId->setAttribute('Type', '1');
        $source->appendChild($rqId);
        if (!empty($data['agent_company_name'])) {
            $bc = $xml->createElement('BookingChannel');
            $bc->setAttribute('Type', '1');
            $cn = $xml->createElement('CompanyName', $data['agent_company_name']);
            $bc->appendChild($cn);
            $source->appendChild($bc);
        }
        $pos->appendChild($source);
        $root->appendChild($pos);

        $vehResCore = $xml->createElement('VehResRQCore');
        if (!empty($data['agent_booking_ref'])) {
            $uid = $xml->createElement('UniqueID');
            $uid->setAttribute('ID', $data['agent_booking_ref']);
            $uid->setAttribute('ID_Context', 'AGENT');
            $uid->setAttribute('Type', '14');
            $vehResCore->appendChild($uid);
        }

        if (!empty($data['pickup_unlocode']) || !empty($data['pickup_iso'])) {
            $vrc = $xml->createElement('VehRentalCore');
            if (!empty($data['pickup_unlocode'])) {
                $pl = $xml->createElement('PickUpLocation');
                $pl->setAttribute('LocationCode', $data['pickup_unlocode']);
                $vrc->appendChild($pl);
            }
            if (!empty($data['pickup_iso'])) {
                $pdt = $xml->createElement('PickUpDateTime', $data['pickup_iso']);
                $vrc->appendChild($pdt);
            }
            if (!empty($data['dropoff_unlocode'])) {
                $rl = $xml->createElement('ReturnLocation');
                $rl->setAttribute('LocationCode', $data['dropoff_unlocode']);
                $vrc->appendChild($rl);
            }
            if (!empty($data['dropoff_iso'])) {
                $rdt = $xml->createElement('ReturnDateTime', $data['dropoff_iso']);
                $vrc->appendChild($rdt);
            }
            $vehResCore->appendChild($vrc);
        }

        if (!empty($data['vehicle_class'])) {
            $vp = $xml->createElement('VehPref');
            $vp->setAttribute('VehicleClass', $data['vehicle_class']);
            if (!empty($data['vehicle_make_model'])) {
                $vp->setAttribute('MakeModel', $data['vehicle_make_model']);
            }
            $vehResCore->appendChild($vp);
        }

        if (isset($data['driver_age'])) {
            $dty = $xml->createElement('DriverType');
            $dty->setAttribute('Age', (string) $data['driver_age']);
            if (!empty($data['residency_country'])) {
                $dty->setAttribute('ResidencyCountry', $data['residency_country']);
            }
            $vehResCore->appendChild($dty);
        }

        if (!empty($data['rate_plan_code'])) {
            $rq = $xml->createElement('RateQualifier');
            $rq->setAttribute('RatePlanCode', $data['rate_plan_code']);
            $rq->setAttribute('PromoCode', $data['agreement_ref']);
            $vehResCore->appendChild($rq);
        }

        if (!empty($data['supplier_offer_ref'])) {
            $ref = $xml->createElement('Reference');
            $ref->setAttribute('ID', $data['supplier_offer_ref']);
            $ref->setAttribute('ID_Context', 'SUPPLIER_OFFER');
            $vehResCore->appendChild($ref);
        }

        $root->appendChild($vehResCore);

        return $xml->saveXML();
    }
}
