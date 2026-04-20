<?php

declare(strict_types=1);

namespace Gloria\Client\Supplier\Normalizer;

/**
 * Normalizes OTA XML into stable JSON-ready arrays.
 * Car extraction aligns with parseOtaVehAvailResponse (grpc.adapter.ts).
 */
final class OtaResponseNormalizer
{
    /**
     * @return list<array{id: string, name: string, city: string}>
     */
    public static function branchesFromXml(string $xmlString): array
    {
        $sx = self::loadXml($xmlString);
        $out = [];

        $detailNodes = $sx->xpath('//*[local-name()="LocationDetail"]') ?: [];
        foreach ($detailNodes as $node) {
            $attrs = $node->attributes();
            $code = (string) ($attrs['Code'] ?? $attrs['LocationCode'] ?? '');
            $name = (string) ($attrs['Name'] ?? $attrs['Locationname'] ?? '');
            $city = (string) ($attrs['City'] ?? $attrs['Locationcity'] ?? '');
            if ($code !== '' || $name !== '') {
                $out[] = [
                    'id' => $code !== '' ? $code : $name,
                    'name' => $name !== '' ? $name : $code,
                    'city' => $city,
                ];
            }
        }
        if ($out !== []) {
            return $out;
        }

        foreach ($sx->xpath('//*[@LocationCode]') ?: [] as $node) {
            $attrs = $node->attributes();
            $code = (string) ($attrs['LocationCode'] ?? '');
            $name = (string) ($attrs['Locationname'] ?? $attrs['Name'] ?? '');
            $city = (string) ($attrs['Locationcity'] ?? $attrs['City'] ?? '');
            if ($code !== '') {
                $out[] = ['id' => $code, 'name' => $name !== '' ? $name : $code, 'city' => $city];
            }
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $root Parsed JSON (e.g. VehAvailRS root)
     * @return list<array{id: string, name: string, price: float, currency: string}>
     */
    public static function carsFromVehAvailJson(array $root): array
    {
        $core = $root['VehAvailRSCore'] ?? null;
        if (!is_array($core)) {
            return [];
        }
        $out = [];
        $vv = $core['VehVendorAvails']['VehVendorAvail'] ?? null;
        if ($vv === null) {
            return [];
        }
        $vvaList = isset($vv['VehAvails']) || isset($vv['VehAvail']) ? [$vv] : (array) $vv;
        foreach ($vvaList as $vva) {
            $raw = $vva['VehAvails']['VehAvail'] ?? $vva['VehAvail'] ?? [];
            $list = isset($raw['VehAvailCore']) ? [$raw] : (array) $raw;
            foreach ($list as $item) {
                $c = $item['VehAvailCore'] ?? $item;
                if (!is_array($c)) {
                    continue;
                }
                $attrs = $c['@attributes'] ?? [];
                $vehId = (string) ($attrs['VehID'] ?? $attrs['VehId'] ?? '');
                $vehicle = is_array($c['Vehicle'] ?? null) ? $c['Vehicle'] : [];
                $mm = $vehicle['VehMakeModel']['@attributes'] ?? (is_array($vehicle['VehMakeModel'] ?? null) ? $vehicle['VehMakeModel'] : []);
                $name = is_array($mm) ? (string) ($mm['Name'] ?? '') : '';
                $tcNode = $c['TotalCharge'] ?? [];
                $tc = is_array($tcNode) ? ($tcNode['@attributes'] ?? $tcNode) : [];
                $price = (float) (is_array($tc) ? ($tc['RateTotalAmount'] ?? 0) : 0);
                $currency = is_array($tc) ? (string) ($tc['CurrencyCode'] ?? '') : '';
                if ($vehId !== '' || $name !== '') {
                    $out[] = [
                        'id' => $vehId !== '' ? $vehId : md5($name . $price . $currency),
                        'name' => $name !== '' ? $name : 'Vehicle',
                        'price' => $price,
                        'currency' => $currency,
                    ];
                }
            }
        }
        return $out;
    }

    /**
     * @return list<array{id: string, name: string, price: float, currency: string}>
     */
    public static function carsFromVehAvailXml(string $xmlString): array
    {
        $sx = self::loadXml($xmlString);
        $out = [];

        $vehAvails = $sx->xpath('//*[local-name()="VehAvail"]') ?: [];
        foreach ($vehAvails as $va) {
            $core = $va->xpath('.//*[local-name()="VehAvailCore"]');
            $coreEl = $core[0] ?? $va;
            $vehId = '';
            $cAttrs = $coreEl->attributes();
            if ($cAttrs) {
                $vehId = (string) ($cAttrs['VehID'] ?? $cAttrs['VehId'] ?? '');
            }

            $mm = $va->xpath('.//*[local-name()="VehMakeModel"]');
            $name = '';
            if (isset($mm[0])) {
                $a = $mm[0]->attributes();
                $name = $a ? (string) ($a['Name'] ?? '') : '';
            }

            $total = $va->xpath('.//*[local-name()="TotalCharge"]');
            $price = 0.0;
            $currency = '';
            if (isset($total[0])) {
                $ta = $total[0]->attributes();
                if ($ta) {
                    $price = (float) ($ta['RateTotalAmount'] ?? 0);
                    $currency = (string) ($ta['CurrencyCode'] ?? '');
                }
            }

            if ($vehId !== '' || $name !== '') {
                $out[] = [
                    'id' => $vehId !== '' ? $vehId : md5($name . $price . $currency),
                    'name' => $name !== '' ? $name : 'Vehicle',
                    'price' => $price,
                    'currency' => $currency,
                ];
            }
        }

        return $out;
    }

    /**
     * @return array{reservation_id: string, status: string}
     */
    public static function bookingFromVehResRs(string $xmlString): array
    {
        $sx = self::loadXml($xmlString);
        $id = '';
        $status = 'CONFIRMED';

        $uids = $sx->xpath('//*[local-name()="UniqueID"]') ?: [];
        foreach ($uids as $u) {
            $a = $u->attributes();
            if ($a && (string) ($a['ID_Context'] ?? '') === 'SUPPLIER') {
                $id = (string) ($a['ID'] ?? '');
                break;
            }
        }
        if ($id === '' && isset($uids[0])) {
            $a = $uids[0]->attributes();
            $id = $a ? (string) ($a['ID'] ?? '') : '';
        }

        $conf = $sx->xpath('//*[local-name()="VehReservation"]') ?: [];
        if (isset($conf[0])) {
            $a = $conf[0]->attributes();
            if ($a && isset($a['Status'])) {
                $status = (string) $a['Status'];
            }
        }

        return ['reservation_id' => $id, 'status' => $status];
    }

    /**
     * @return array{reservation_id: string, status: string}
     */
    public static function bookingFromVehRetResRs(string $xmlString): array
    {
        return self::bookingFromVehResRs($xmlString);
    }

    /**
     * @return array{reservation_id: string, status: string}
     */
    public static function bookingFromCancelRs(string $xmlString): array
    {
        $sx = self::loadXml($xmlString);
        $id = '';
        $uids = $sx->xpath('//*[local-name()="UniqueID"]') ?: [];
        if (isset($uids[0])) {
            $a = $uids[0]->attributes();
            $id = $a ? (string) ($a['ID'] ?? '') : '';
        }
        return ['reservation_id' => $id, 'status' => 'CANCELLED'];
    }

    private static function loadXml(string $xml): \SimpleXMLElement
    {
        libxml_use_internal_errors(true);
        $sx = simplexml_load_string($xml, \SimpleXMLElement::class, LIBXML_NOCDATA);
        if ($sx === false) {
            $err = libxml_get_last_error();
            throw new \InvalidArgumentException('Invalid XML: ' . ($err ? $err->message : 'parse error'));
        }
        return $sx;
    }
}
