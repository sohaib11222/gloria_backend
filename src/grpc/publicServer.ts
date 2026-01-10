import "dotenv/config";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from 'node:crypto';
import { prisma } from "../data/prisma.js";
import { bookingClient, availabilityClient } from "./clients/core.js";
import { agreementClient } from "./clients/agreement.client.js";
import { verifyAccessToken } from "../infra/auth.js";
import { logger } from "../infra/logger.js";

const P = "src/grpc/proto/agent_ingress.proto";

function loadPkg() {
  const def = protoLoader.loadSync(P, {
    keepCase: true,            // 👈 keep snake_case from .proto
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  return grpc.loadPackageDefinition(def);
}

function getBearer(metadata: grpc.Metadata): string {
  const v = metadata.get("authorization")[0];
  if (!v) return "";
  const s = String(v);
  return s.startsWith("Bearer ") ? s.slice(7) : s;
}

function authed(call: any): any {
  const token = getBearer(call.metadata);
  if (!token) throw { code: grpc.status.UNAUTHENTICATED, message: "missing bearer token" };
  try {
    const decoded = verifyAccessToken(token);
    return decoded;
  } catch {
    throw { code: grpc.status.UNAUTHENTICATED, message: "invalid token" };
  }
}

// Normalize client-provided criteria to the snake_case your core expects.
async function normalizeCriteria(agentCompanyId: string, raw: any): Promise<any> {
  const c = { ...(raw || {}) };
  // Accept both camelCase and snake_case for these keys
  const pick = (a: any, b: any) => (a !== undefined ? a : b);
  c.pickup_unlocode   = pick(c.pickup_unlocode,   c.pickupUnlocode);
  c.dropoff_unlocode  = pick(c.dropoff_unlocode,  c.dropoffUnlocode);
  c.pickup_iso        = pick(c.pickup_iso,        c.pickupIso);
  c.dropoff_iso       = pick(c.dropoff_iso,       c.dropoffIso);
  c.driver_age        = pick(c.driver_age,        c.driverAge);
  c.residency_country = pick(c.residency_country, c.residencyCountry);
  c.vehicle_classes   = pick(c.vehicle_classes,   c.vehicleClasses);
  // agreement_refs may be agreementRefs or agreement_ref(s)
  c.agreement_refs    = pick(c.agreement_refs,    pick(c.agreementRefs, pick(c.agreement_ref, c.agreementRef)));
  if (typeof c.agreement_refs === 'string') c.agreement_refs = [c.agreement_refs];

  // Fallback: if still missing/empty, auto-fill with all ACTIVE agreement refs for this agent
  if (!Array.isArray(c.agreement_refs) || c.agreement_refs.length === 0) {
    const rows = await prisma.agreement.findMany({
      where: { agentId: agentCompanyId, status: 'ACTIVE' },
      select: { agreementRef: true }
    });
    c.agreement_refs = rows.map(r => r.agreementRef);
  }
  return c;
}

export async function startPublicGrpcServer(): Promise<void> {
  const pkg = loadPkg();
  const Service = (pkg as any).agent.AgentIngressService.service;
  const server = new grpc.Server();

  server.addService(Service, {
    // ✅ Fixed: SubmitAvailability
    SubmitAvailability: async (call: any, cb: any) => {
      // mTLS infrastructure available but disabled by default
      try {
        const u = authed(call);
        const client = availabilityClient();
    
        const criteria = await normalizeCriteria(u.companyId, call.request);
    
        // derive a traceable request id up-front
        const incomingRid = call.metadata?.get?.('x-request-id')?.[0] || '';
        const rid = incomingRid || `req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    
        logger.debug({
          rid,
          agent: u.companyId,
          criteria,
        });
    
        client.Submit(
          { agent_id: u.companyId, criteria },
          (err: any, resp: any) => {
            if (err) return cb(err);
    
            // Log raw resp for sanity
            logger.debug({ resp }, '[AgentIngress.SubmitAvailability] raw resp');
    
            // Try to read fields (both snake_case and camelCase), but DO NOT depend on them
            const reqIdFromDownstream =
              (resp && (resp.request_id ?? resp.requestId ?? resp.rid)) || '';
    
            const expectedSources =
              (resp && (resp.expected_sources ?? resp.expectedSources)) ?? 0;
    
            const recommendedPollMs =
              (resp && (resp.recommended_poll_ms ?? resp.recommendedPollMs)) ?? 1500;
    
            // ✅ Always return a non-empty id: prefer downstream id, else use our rid
            const finalReqId = String(reqIdFromDownstream).trim() || rid;
    
            return cb(null, {
              request_id: finalReqId,
              expected_sources: expectedSources,
              recommended_poll_ms: recommendedPollMs,
            });
          }
        );
      } catch (e: any) {
        return cb({ code: grpc.status.INTERNAL, message: e.message || 'SubmitAvailability failed' });
      }
    },
    
  
    // ✅ Unchanged
    PollAvailability: (call: any, cb: any) => {
      // mTLS infrastructure available but disabled by default
      try {
        authed(call);
        const client = availabilityClient();
        client.Poll(
          {
            request_id: call.request.request_id,
            since_seq: call.request.since_seq || 0,
            wait_ms: call.request.wait_ms || 1000,
          },
          (err: any, resp: any) => {
            if (err) {
              // Gracefully complete if request not found
              if (err.code === 5 || err.message?.includes('not found')) {
                return cb(null, {
                  complete: true,
                  last_seq: 0,
                  offers: [],
                });
              }
              return cb(err);
            }
            cb(null, {
              complete: resp.complete,
              last_seq: resp.last_seq,
              offers: resp.offers || [],
            });
          }
        );
      } catch (e) {
        cb(e);
      }
    },
  
    // ✅ Unchanged
    CreateBooking: (call: any, cb: any) => {
      try {
        const u = authed(call);
        const client = bookingClient();
        const r = call.request;
        if (!r.idempotency_key)
          return cb({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Idempotency key required',
          });
        client.Create(
          {
            agent_id: u.companyId,
            source_id: r.source_id,
            agreement_ref: r.agreement_ref,
            supplier_offer_ref: r.supplier_offer_ref,
            idempotency_key: r.idempotency_key,
            agent_booking_ref: r.agent_booking_ref || '',
          },
          (err: any, resp: any) => (err ? cb(err) : cb(null, resp))
        );
      } catch (e) {
        cb(e);
      }
    },
  
    ModifyBooking: async (call: any, cb: any) => {
      try {
        const u = authed(call);
        const r = call.request;
        if (!r.supplier_booking_ref || !r.source_id) {
          return cb({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'supplier_booking_ref and source_id are required',
          });
        }

        // Lookup booking to get agreement_ref and validate ownership
        const booking = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: r.supplier_booking_ref,
            sourceId: r.source_id,
            agentId: u.companyId,
          },
          select: { agreementRef: true, id: true },
        });

        if (!booking) {
          return cb({
            code: grpc.status.NOT_FOUND,
            message: 'Booking not found or access denied',
          });
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: u.companyId,
            sourceId: r.source_id,
            agreementRef: booking.agreementRef,
            status: 'ACTIVE',
          },
        });

        if (!ag) {
          return cb({
            code: grpc.status.FAILED_PRECONDITION,
            message: 'AGREEMENT_INACTIVE or not found',
          });
        }

        const client = bookingClient();
        client.Modify(
          {
            supplier_booking_ref: r.supplier_booking_ref,
            source_id: r.source_id,
          },
          (err: any, resp: any) => (err ? cb(err) : cb(null, resp))
        );
      } catch (e: any) {
        cb({
          code: grpc.status.INTERNAL,
          message: e.message || 'ModifyBooking failed',
        });
      }
    },
  
    CancelBooking: async (call: any, cb: any) => {
      try {
        const u = authed(call);
        const r = call.request;
        if (!r.supplier_booking_ref || !r.source_id) {
          return cb({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'supplier_booking_ref and source_id are required',
          });
        }

        // Lookup booking to get agreement_ref and validate ownership
        const booking = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: r.supplier_booking_ref,
            sourceId: r.source_id,
            agentId: u.companyId,
          },
          select: { agreementRef: true, id: true },
        });

        if (!booking) {
          return cb({
            code: grpc.status.NOT_FOUND,
            message: 'Booking not found or access denied',
          });
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: u.companyId,
            sourceId: r.source_id,
            agreementRef: booking.agreementRef,
            status: 'ACTIVE',
          },
        });

        if (!ag) {
          return cb({
            code: grpc.status.FAILED_PRECONDITION,
            message: 'AGREEMENT_INACTIVE or not found',
          });
        }

        const client = bookingClient();
        client.Cancel(
          {
            supplier_booking_ref: r.supplier_booking_ref,
            source_id: r.source_id,
          },
          (err: any, resp: any) => (err ? cb(err) : cb(null, resp))
        );
      } catch (e: any) {
        cb({
          code: grpc.status.INTERNAL,
          message: e.message || 'CancelBooking failed',
        });
      }
    },
  
    CheckBooking: async (call: any, cb: any) => {
      try {
        const u = authed(call);
        const r = call.request;
        if (!r.supplier_booking_ref || !r.source_id) {
          return cb({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'supplier_booking_ref and source_id are required',
          });
        }

        // Lookup booking to get agreement_ref and validate ownership
        const booking = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: r.supplier_booking_ref,
            sourceId: r.source_id,
            agentId: u.companyId,
          },
          select: { agreementRef: true, id: true },
        });

        if (!booking) {
          return cb({
            code: grpc.status.NOT_FOUND,
            message: 'Booking not found or access denied',
          });
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: u.companyId,
            sourceId: r.source_id,
            agreementRef: booking.agreementRef,
            status: 'ACTIVE',
          },
        });

        if (!ag) {
          return cb({
            code: grpc.status.FAILED_PRECONDITION,
            message: 'AGREEMENT_INACTIVE or not found',
          });
        }

        const client = bookingClient();
        client.Check(
          {
            supplier_booking_ref: r.supplier_booking_ref,
            source_id: r.source_id,
          },
          (err: any, resp: any) => (err ? cb(err) : cb(null, resp))
        );
      } catch (e: any) {
        cb({
          code: grpc.status.INTERNAL,
          message: e.message || 'CheckBooking failed',
        });
      }
    },
  
    ListAgreements: (call: any, cb: any) => {
      try {
        const u = authed(call);
        prisma.agreement
          .findMany({
            where: { agentId: u.companyId, status: 'ACTIVE' },
            select: { id: true },
          })
          .then((rows) =>
            cb(null, { agreement_ids: rows.map((r) => r.id) })
          )
          .catch((err) => cb(err));
      } catch (e) {
        cb(e);
      }
    },
  });
  

  const PORT = Number(process.env.GRPC_PUBLIC_PORT || 50052);
  
  // mTLS infrastructure available but disabled by default
  // To enable: set GRPC_TLS_ENABLED=true and use createServerCredentials()
  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) { console.error("Public gRPC bind error", err); return; }
    logger.info({ port: PORT }, "Public gRPC (AgentIngress) listening");
    server.start();
  });
}
