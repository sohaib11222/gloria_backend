export interface TransportInterface {
  availabilitySubmit(criteria: Record<string, unknown>): Promise<Record<string, unknown>>;
  availabilityPoll(requestId: string, sinceSeq: number, waitMs: number): Promise<Record<string, unknown>>;
  isLocationSupported(agreementRef: string, locode: string): Promise<boolean>;
  bookingCreate(payload: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>>;
  bookingModify(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  bookingCancel(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  bookingCheck(supplierBookingRef: string, agreementRef: string, sourceId?: string): Promise<Record<string, unknown>>;
}

