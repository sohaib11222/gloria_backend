export interface AvailabilityCriteriaOptions {
  pickupLocode: string;
  returnLocode: string;
  pickupAt: Date;
  returnAt: Date;
  driverAge: number;
  currency: string;
  agreementRefs: string[];
  vehiclePrefs?: string[];
  ratePrefs?: string[];
  residencyCountry?: string;
  extras?: Record<string, unknown>;
}

export class AvailabilityCriteria {
  private constructor(
    private readonly pickupLocode: string,
    private readonly returnLocode: string,
    private readonly pickupAt: Date,
    private readonly returnAt: Date,
    private readonly driverAge: number,
    private readonly currency: string,
    private readonly agreementRefs: string[],
    private readonly vehiclePrefs: string[],
    private readonly ratePrefs: string[],
    private readonly residencyCountry: string,
    private readonly extras: Record<string, unknown>
  ) {}

  public static make(options: AvailabilityCriteriaOptions): AvailabilityCriteria {
    return new AvailabilityCriteria(
      options.pickupLocode,
      options.returnLocode,
      options.pickupAt,
      options.returnAt,
      options.driverAge,
      options.currency,
      options.agreementRefs,
      options.vehiclePrefs || [],
      options.ratePrefs || [],
      options.residencyCountry || 'US',
      options.extras || {}
    );
  }

  public toArray(): Record<string, unknown> {
    return {
      pickup_unlocode: this.pickupLocode,
      dropoff_unlocode: this.returnLocode,
      pickup_iso: this.pickupAt.toISOString(),
      dropoff_iso: this.returnAt.toISOString(),
      driver_age: this.driverAge,
      residency_country: this.residencyCountry,
      vehicle_classes: this.vehiclePrefs,
      agreement_refs: this.agreementRefs,
      rate_prefs: this.ratePrefs,
      ...this.extras,
    };
  }
}

