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
        array $extras = []
    ): self {
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

