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
    // Validation
    if (!options.pickupLocode || options.pickupLocode.trim().length === 0) {
      throw new Error('pickupLocode is required');
    }
    if (!options.returnLocode || options.returnLocode.trim().length === 0) {
      throw new Error('returnLocode is required');
    }
    if (!options.pickupAt || !(options.pickupAt instanceof Date) || isNaN(options.pickupAt.getTime())) {
      throw new Error('pickupAt must be a valid Date');
    }
    if (!options.returnAt || !(options.returnAt instanceof Date) || isNaN(options.returnAt.getTime())) {
      throw new Error('returnAt must be a valid Date');
    }
    if (options.returnAt <= options.pickupAt) {
      throw new Error('returnAt must be after pickupAt');
    }
    if (!options.driverAge || options.driverAge < 18 || options.driverAge > 100) {
      throw new Error('driverAge must be between 18 and 100');
    }
    if (!options.currency || options.currency.trim().length === 0) {
      throw new Error('currency is required');
    }
    if (!options.agreementRefs || !Array.isArray(options.agreementRefs) || options.agreementRefs.length === 0) {
      throw new Error('agreementRefs must be a non-empty array');
    }
    if (options.residencyCountry && options.residencyCountry.length !== 2) {
      throw new Error('residencyCountry must be a 2-letter ISO code');
    }

    return new AvailabilityCriteria(
      options.pickupLocode.trim().toUpperCase(),
      options.returnLocode.trim().toUpperCase(),
      options.pickupAt,
      options.returnAt,
      options.driverAge,
      options.currency.trim().toUpperCase(),
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

