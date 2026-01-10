import { Config } from '../Config';
import { TransportInterface } from '../transport/TransportInterface';
import { BookingCreate } from '../DTO/BookingCreate';

export class BookingClient {
  constructor(
    private readonly transport: TransportInterface,
    private readonly config: Config
  ) {}

  public async create(dto: BookingCreate, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const payload = dto.toArray();
    if (!payload.agreement_ref) {
      throw new Error('agreement_ref required');
    }
    if (!payload.supplier_id) {
      throw new Error('supplier_id required');
    }
    return this.transport.bookingCreate(payload, idempotencyKey);
  }

  public async modify(
    supplierBookingRef: string,
    fields: Record<string, unknown>,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    return this.transport.bookingModify({
      supplier_booking_ref: supplierBookingRef,
      agreement_ref: agreementRef,
      fields,
    });
  }

  public async cancel(
    supplierBookingRef: string,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    return this.transport.bookingCancel({
      supplier_booking_ref: supplierBookingRef,
      agreement_ref: agreementRef,
    });
  }

  public async check(
    supplierBookingRef: string,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    return this.transport.bookingCheck(supplierBookingRef, agreementRef, sourceId);
  }
}

