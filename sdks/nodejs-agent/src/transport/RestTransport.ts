import axios, { AxiosInstance, AxiosError } from 'axios';
import { Config } from '../Config';
import { TransportInterface } from './TransportInterface';
import { TransportException } from '../Exceptions/TransportException';

interface LocationCacheEntry {
  locodes: Set<string>;
  expiresAt: number;
}

export class RestTransport implements TransportInterface {
  private readonly http: AxiosInstance;
  private readonly locationCache: Map<string, LocationCacheEntry> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly config: Config) {
    const baseUrl = config.get('baseUrl') || '';
    this.http = axios.create({
      baseURL: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
      timeout: Math.max(
        Math.ceil((config.get('longPollWaitMs') || 10000 + 2000) / 1000),
        12
      ) * 1000,
    });
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const base: Record<string, string> = {
      Authorization: this.config.get('token') || '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Agent-Id': this.config.get('agentId') || '',
      'X-Correlation-Id': this.config.get('correlationId') || '',
    };

    const apiKey = this.config.get('apiKey');
    if (apiKey) {
      base['X-API-Key'] = apiKey;
    }

    return { ...base, ...extra };
  }

  private async decode<T>(response: { data: T }): Promise<T> {
    return response.data;
  }

  public async availabilitySubmit(criteria: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const response = await this.http.post('availability/submit', criteria, {
        headers: this.headers(),
        timeout: ((this.config.get('callTimeoutMs') || 10000) / 1000 + 2) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }

  public async availabilityPoll(
    requestId: string,
    sinceSeq: number,
    waitMs: number
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.http.get('availability/poll', {
        headers: this.headers(),
        params: {
          request_id: requestId,
          since_seq: sinceSeq,
          wait_ms: waitMs,
        },
        timeout: Math.max(
          (waitMs / 1000) + 2,
          (this.config.get('callTimeoutMs') || 10000) / 1000 + 2
        ) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }

  public async isLocationSupported(agreementRef: string, locode: string): Promise<boolean> {
    // Note: This method currently returns false as a safe default.
    // The backend requires agreement ID (not ref) to check coverage via /coverage/agreement/{id},
    // and there's no direct endpoint to resolve agreementRef to agreementId.
    // 
    // Location validation is automatically performed during availability submit,
    // so this method is primarily for informational purposes.
    //
    // TODO: Backend should add GET /locations/supported?agreement_ref={ref}&locode={code}
    // to enable full implementation of this method.
    //
    // The cache structure is prepared for future implementation.
    return false;
  }

  public async bookingCreate(
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    try {
      const headers = this.headers(
        idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}
      );
      const response = await this.http.post('bookings', payload, {
        headers,
        timeout: ((this.config.get('callTimeoutMs') || 10000) / 1000 + 2) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }

  public async bookingModify(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const agreementRef = (payload.agreement_ref as string) || '';
      const supplierBookingRef = payload.supplier_booking_ref as string;
      const fields = payload.fields || {};

      const response = await this.http.patch(`bookings/${supplierBookingRef}`, fields, {
        headers: this.headers(),
        params: { agreement_ref: agreementRef },
        timeout: ((this.config.get('callTimeoutMs') || 10000) / 1000 + 2) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }

  public async bookingCancel(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const agreementRef = (payload.agreement_ref as string) || '';
      const supplierBookingRef = payload.supplier_booking_ref as string;

      const response = await this.http.post(`bookings/${supplierBookingRef}/cancel`, {}, {
        headers: this.headers(),
        params: { agreement_ref: agreementRef },
        timeout: ((this.config.get('callTimeoutMs') || 10000) / 1000 + 2) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }

  public async bookingCheck(
    supplierBookingRef: string,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    try {
      const params: Record<string, string> = { agreement_ref: agreementRef };
      if (sourceId) {
        params.source_id = sourceId;
      }

      const response = await this.http.get(`bookings/${supplierBookingRef}`, {
        headers: this.headers(),
        params,
        timeout: ((this.config.get('callTimeoutMs') || 10000) / 1000 + 2) * 1000,
      });
      return this.decode(response);
    } catch (error) {
      throw TransportException.fromHttp(error);
    }
  }
}

