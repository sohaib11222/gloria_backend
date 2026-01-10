export interface BookingCreateOptions {
  agreement_ref: string;
  supplier_id: string;
  offer_id?: string;
  supplier_offer_ref?: string;
  agent_booking_ref?: string;
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
    const required = ['agreement_ref', 'supplier_id'];
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

