<?php
declare(strict_types=1);

namespace HMS\CarHire\DTO;

use DateTimeInterface;

final class AvailabilityCriteria
{
    private function __construct(
        private string $pickupLocode,
        private string $returnLocode,
        private DateTimeInterface $pickupAt,
        private DateTimeInterface $returnAt,
        private int $driverAge,
        private string $currency,
        private array $agreementRefs,
        private array $vehiclePrefs = [],
        private array $ratePrefs = [],
        private array $extras = []
    ) {}

    public static function make(
        string $pickupLocode,
        string $returnLocode,
        DateTimeInterface $pickupAt,
        DateTimeInterface $returnAt,
        int $driverAge,
        string $currency,
        array $agreementRefs,
        array $vehiclePrefs = [],
        array $ratePrefs = [],
        ?string $residencyCountry = null,
        array $extras = []
    ): self {
        // Validation
        if (empty($pickupLocode) || trim($pickupLocode) === '') {
            throw new \InvalidArgumentException('pickupLocode is required');
        }
        if (empty($returnLocode) || trim($returnLocode) === '') {
            throw new \InvalidArgumentException('returnLocode is required');
        }
        if (!$pickupAt instanceof \DateTimeInterface) {
            throw new \InvalidArgumentException('pickupAt must be a valid DateTimeInterface');
        }
        if (!$returnAt instanceof \DateTimeInterface) {
            throw new \InvalidArgumentException('returnAt must be a valid DateTimeInterface');
        }
        if ($returnAt <= $pickupAt) {
            throw new \InvalidArgumentException('returnAt must be after pickupAt');
        }
        if ($driverAge < 18 || $driverAge > 100) {
            throw new \InvalidArgumentException('driverAge must be between 18 and 100');
        }
        if (empty($currency) || trim($currency) === '') {
            throw new \InvalidArgumentException('currency is required');
        }
        if (empty($agreementRefs) || !is_array($agreementRefs) || count($agreementRefs) === 0) {
            throw new \InvalidArgumentException('agreementRefs must be a non-empty array');
        }
        if ($residencyCountry !== null && strlen($residencyCountry) !== 2) {
            throw new \InvalidArgumentException('residencyCountry must be a 2-letter ISO code');
        }
        
        // Normalize
        $pickupLocode = strtoupper(trim($pickupLocode));
        $returnLocode = strtoupper(trim($returnLocode));
        $currency = strtoupper(trim($currency));
        
        return new self($pickupLocode, $returnLocode, $pickupAt, $returnAt, $driverAge, $currency, $agreementRefs, $vehiclePrefs, $ratePrefs, $extras);
    }

    public function toArray(): array
    {
        return [
            'pickup_unlocode'  => $this->pickupLocode,
            'dropoff_unlocode' => $this->returnLocode, // Backend expects dropoff_unlocode
            'pickup_iso'       => $this->pickupAt->format(DATE_ATOM), // Backend expects pickup_iso
            'dropoff_iso'      => $this->returnAt->format(DATE_ATOM), // Backend expects dropoff_iso
            'driver_age'       => $this->driverAge,
            'residency_country' => 'US', // Default, can be overridden
            'vehicle_classes'  => $this->vehiclePrefs, // Map vehicle_prefs to vehicle_classes
            'agreement_refs'   => $this->agreementRefs,
            'rate_prefs'       => $this->ratePrefs,
            'extras'           => $this->extras
        ];
    }
}

