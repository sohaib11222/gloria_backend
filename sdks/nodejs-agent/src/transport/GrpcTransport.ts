import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { Config } from '../Config';
import { TransportInterface } from './TransportInterface';
import { TransportException } from '../Exceptions/TransportException';

/**
 * gRPC transport implementation for Car-Hire Agent SDK.
 * 
 * Uses proto-loader to dynamically load the agent_ingress.proto file.
 * Supports both secure (mTLS) and insecure connections.
 * 
 * Authentication: Bearer token via metadata header "authorization"
 */
export class GrpcTransport implements TransportInterface {
  private client: any;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): any {
    // Try multiple possible paths for the proto file
    const possiblePaths = [
      path.join(__dirname, '../../../protos/agent_ingress.proto'),
      path.join(__dirname, '../../../../protos/agent_ingress.proto'),
      path.join(process.cwd(), 'protos/agent_ingress.proto'),
      path.join(process.cwd(), 'sdks/../protos/agent_ingress.proto'),
    ];

    let protoPath: string | null = null;
    for (const p of possiblePaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(p)) {
          protoPath = p;
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    if (!protoPath) {
      throw new TransportException(
        `Proto file not found. Tried: ${possiblePaths.join(', ')}. ` +
        `Please ensure agent_ingress.proto is in the protos/ directory.`
      );
    }
    
    // Load proto definition
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as any;
    const Service = proto.agent?.AgentIngressService;

    if (!Service) {
      throw new TransportException('Failed to load AgentIngressService from proto file');
    }

    // Create credentials
    const credentials = this.createCredentials();
    const host = this.config.get('host') || 'localhost:50052';

    return new Service(host, credentials);
  }

  private createCredentials(): grpc.ChannelCredentials {
    const caCert = this.config.get('caCert');
    const clientCert = this.config.get('clientCert');
    const clientKey = this.config.get('clientKey');

    // If certificates are provided, use mTLS
    if (caCert && clientCert && clientKey) {
      try {
        return grpc.credentials.createSsl(
          Buffer.from(caCert, 'utf8'),
          Buffer.from(clientKey, 'utf8'),
          Buffer.from(clientCert, 'utf8')
        );
      } catch (error) {
        throw new TransportException(`Failed to create mTLS credentials: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Default to insecure (matches backend default)
    return grpc.credentials.createInsecure();
  }

  private createMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    
    // Add Bearer token
    const token = this.config.get('token');
    if (token) {
      metadata.add('authorization', `Bearer ${token}`);
    }

    // Add API key if provided
    const apiKey = this.config.get('apiKey');
    if (apiKey) {
      metadata.add('x-api-key', apiKey);
    }

    // Add agent ID if provided
    const agentId = this.config.get('agentId');
    if (agentId) {
      metadata.add('x-agent-id', agentId);
    }

    // Add correlation ID
    const correlationId = this.config.get('correlationId');
    if (correlationId) {
      metadata.add('x-correlation-id', correlationId);
    }

    return metadata;
  }

  private callWithTimeout<T>(
    method: string,
    request: any,
    timeoutMs: number = 10000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const metadata = this.createMetadata();
      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + timeoutMs);

      this.client[method](request, metadata, { deadline }, (err: any, response: any) => {
        if (err) {
          // Map gRPC errors to TransportException
          const statusCode = err.code || 500;
          const message = err.message || 'gRPC call failed';
          reject(new TransportException(message, statusCode, err.code));
        } else {
          resolve(response as T);
        }
      });
    });
  }

  public async availabilitySubmit(criteria: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      // Normalize criteria to match proto format
      const request: any = {
        pickup_unlocode: criteria.pickupLocode || criteria.pickup_unlocode || '',
        dropoff_unlocode: criteria.returnLocode || criteria.dropoff_unlocode || '',
        pickup_iso: criteria.pickupIso || criteria.pickup_iso || '',
        dropoff_iso: criteria.returnIso || criteria.dropoff_iso || '',
        driver_age: criteria.driverAge || criteria.driver_age || 0,
        residency_country: criteria.residencyCountry || criteria.residency_country || '',
        vehicle_classes: criteria.vehiclePrefs || criteria.vehicle_classes || [],
        agreement_refs: criteria.agreementRefs || criteria.agreement_refs || [],
      };

      const timeout = this.config.get('callTimeoutMs') || 10000;
      const response = await this.callWithTimeout<{
        request_id: string;
        expected_sources: number;
        recommended_poll_ms: number;
      }>('SubmitAvailability', request, timeout);

      return {
        request_id: response.request_id,
        expected_sources: response.expected_sources,
        recommended_poll_ms: response.recommended_poll_ms,
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Availability submit failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async availabilityPoll(
    requestId: string,
    sinceSeq: number,
    waitMs: number
  ): Promise<Record<string, unknown>> {
    try {
      const request = {
        request_id: requestId,
        since_seq: sinceSeq,
        wait_ms: waitMs,
      };

      const timeout = Math.max(waitMs + 5000, this.config.get('callTimeoutMs') || 10000);
      const response = await this.callWithTimeout<{
        complete: boolean;
        last_seq: number;
        offers: any[];
      }>('PollAvailability', request, timeout);

      // Transform offers to match REST format
      const offers = (response.offers || []).map((offer: any) => ({
        source_id: offer.source_id,
        agreement_ref: offer.agreement_ref,
        vehicle_class: offer.vehicle_class,
        vehicle_make_model: offer.vehicle_make_model,
        rate_plan_code: offer.rate_plan_code,
        currency: offer.currency,
        total_price: offer.total_price,
        supplier_offer_ref: offer.supplier_offer_ref,
      }));

      return {
        complete: response.complete,
        last_seq: response.last_seq,
        items: offers,
        status: response.complete ? 'COMPLETE' : 'PARTIAL',
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Availability poll failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async isLocationSupported(agreementRef: string, locode: string): Promise<boolean> {
    // gRPC proto doesn't have this method, return false as documented
    return false;
  }

  public async bookingCreate(
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    try {
      if (!idempotencyKey) {
        throw new TransportException('Idempotency key is required for booking creation', 400);
      }

      const request: any = {
        source_id: payload.source_id || '',
        agreement_ref: payload.agreement_ref || '',
        supplier_offer_ref: payload.supplier_offer_ref || payload.offer_id || '',
        idempotency_key: idempotencyKey,
        agent_booking_ref: payload.agent_booking_ref || '',
      };

      const timeout = this.config.get('callTimeoutMs') || 10000;
      const response = await this.callWithTimeout<{
        supplier_booking_ref: string;
        status: string;
        agreement_ref: string;
        source_id: string;
      }>('CreateBooking', request, timeout);

      return {
        supplier_booking_ref: response.supplier_booking_ref,
        status: response.status,
        agreement_ref: response.agreement_ref,
        source_id: response.source_id,
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Booking create failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async bookingModify(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const request = {
        supplier_booking_ref: payload.supplier_booking_ref || '',
        source_id: payload.source_id || '',
      };

      const timeout = this.config.get('callTimeoutMs') || 10000;
      const response = await this.callWithTimeout<{
        supplier_booking_ref: string;
        status: string;
        agreement_ref: string;
        source_id: string;
      }>('ModifyBooking', request, timeout);

      return {
        supplier_booking_ref: response.supplier_booking_ref,
        status: response.status,
        agreement_ref: response.agreement_ref,
        source_id: response.source_id,
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Booking modify failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async bookingCancel(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const request = {
        supplier_booking_ref: payload.supplier_booking_ref || '',
        source_id: payload.source_id || '',
      };

      const timeout = this.config.get('callTimeoutMs') || 10000;
      const response = await this.callWithTimeout<{
        supplier_booking_ref: string;
        status: string;
        agreement_ref: string;
        source_id: string;
      }>('CancelBooking', request, timeout);

      return {
        supplier_booking_ref: response.supplier_booking_ref,
        status: response.status,
        agreement_ref: response.agreement_ref,
        source_id: response.source_id,
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Booking cancel failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async bookingCheck(
    supplierBookingRef: string,
    agreementRef: string,
    sourceId?: string
  ): Promise<Record<string, unknown>> {
    try {
      if (!sourceId) {
        throw new TransportException('source_id is required for booking check', 400);
      }

      const request = {
        supplier_booking_ref: supplierBookingRef,
        source_id: sourceId,
      };

      const timeout = this.config.get('callTimeoutMs') || 10000;
      const response = await this.callWithTimeout<{
        supplier_booking_ref: string;
        status: string;
        agreement_ref: string;
        source_id: string;
      }>('CheckBooking', request, timeout);

      return {
        supplier_booking_ref: response.supplier_booking_ref,
        status: response.status,
        agreement_ref: response.agreement_ref,
        source_id: response.source_id,
      };
    } catch (error) {
      if (error instanceof TransportException) {
        throw error;
      }
      throw new TransportException(
        `Booking check failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }
}
