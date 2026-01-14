export interface BookingCreateOptions {
  agreement_ref: string;
  supplier_offer_ref?: string;
  agent_booking_ref?: string;
  
  // Availability context (optional - if provided, will retrieve context from availability search)
  availability_request_id?: string;
  
  // Location details (from availability search) - OTA: PickupLocation, DropOffLocation
  pickup_unlocode?: string;     // PickupLocation (UN/LOCODE)
  dropoff_unlocode?: string;    // DropOffLocation (UN/LOCODE)
  pickup_iso?: string;          // PickupDateTime (ISO-8601)
  dropoff_iso?: string;         // DropOffDateTime (ISO-8601)
  
  // Vehicle and driver details (from availability search/offer)
  vehicle_class?: string;       // VehicleClass (OTA codes: ECMN, CDMR, etc.)
  vehicle_make_model?: string;  // VehicleMakeModel
  rate_plan_code?: string;      // RatePlanCode (BAR, MEMBER, PREPAY, etc.)
  driver_age?: number;          // DriverAge
  residency_country?: string;   // ResidencyCountry (ISO 3166-1 alpha-2)
  
  // Customer and payment information (JSON objects)
  customer_info?: Record<string, unknown>; // Customer name, contact details, etc.
  payment_info?: Record<string, unknown>;  // Payment details, card info, etc.
  
  // Legacy/deprecated fields (kept for backward compatibility)
  offer_id?: string;
  driver?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    age?: number;
  };
  
  [key: string]: unknown;
}

export class BookingCreate {
  private constructor(private readonly data: BookingCreateOptions) {}

  public static fromOffer(offer: BookingCreateOptions): BookingCreate {
    const required = ['agreement_ref'];
    for (const key of required) {
      if (!offer[key]) {
        throw new Error(`${key} required`);
      }
    }
    return new BookingCreate(offer);
  }

  public toArray(): BookingCreateOptions {
    return this.data;
  }
}

