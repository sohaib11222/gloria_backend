import { Config } from '../Config';
import { TransportInterface } from './TransportInterface';
import { TransportException } from '../Exceptions/TransportException';

/**
 * gRPC transport – STUBS until proto files are generated and service clients are wired.
 * To generate stubs, run: npm run proto:gen
 * Then implement methods by calling generated stubs with per-call deadlines and mTLS channel credentials.
 */
export class GrpcTransport implements TransportInterface {
  constructor(private readonly config: Config) {}

  public async availabilitySubmit(criteria: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async availabilityPoll(
    requestId: string,
    sinceSeq: number,
    waitMs: number
  ): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async isLocationSupported(agreementRef: string, locode: string): Promise<boolean> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async bookingCreate(
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async bookingModify(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async bookingCancel(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }

  public async bookingCheck(
    supplierBookingRef: string,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    throw new TransportException('gRPC not wired yet. Generate stubs and implement.');
  }
}

