import "dotenv/config";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { logger } from "../infra/logger.js";
import { prisma } from "../data/prisma.js";

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise, 'reason:', reason);
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});
import {
  notifyAgreementOffered,
  notifyAgreementAccepted,
  notifyAgreementStatus,
} from "../services/notifications.js";
import { getAdapterForSource } from "../adapters/registry.js";
import { sleep } from "../infra/sleep.js";
import { auditLog } from "../services/audit.js";
import { SourceHealthService } from "../services/health.js";
import { VerificationRunner } from "../services/verificationRunner.js";
import { AvailabilityStore } from "../services/availabilityStore.js";
import { buildAvailabilityResponse, buildBookingResponse, buildCheckBookingResponse } from "../services/otaResponseBuilder.js";
import {
  adapterLatency,
  bookingOperationsTotal,
  verificationOperationsTotal,
} from "../services/metrics.js";
import { v4 as uuid } from "uuid";
import pLimit from "p-limit";
import { submitEcho, getEchoResults } from "../services/echoService.js";

const CORE_PORT = Number(process.env.GRPC_CORE_PORT || 50051);

function load(protoPath: string) {
  const pkgDef = protoLoader.loadSync(protoPath, {
    keepCase: true, // 👈 keep snake_case from .proto
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(pkgDef);
}

function getAllowedTransitions(currentStatus: string): string {
  const transitions: Record<string, string[]> = {
    DRAFT: ["OFFERED"],
    OFFERED: ["ACCEPTED", "EXPIRED"],
    ACCEPTED: ["ACTIVE"],
    ACTIVE: ["SUSPENDED", "EXPIRED"],
    SUSPENDED: ["ACTIVE", "EXPIRED"],
    EXPIRED: [],
  };
  return transitions[currentStatus]?.join(", ") || "none";
}

async function isLocationAllowedForAgreement(
  agreementId: string,
  unlocode: string
) {
  // Effective coverage = (source coverage ∪ allow overrides) \ deny overrides
  const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!ag) return false;

  const base = await prisma.sourceLocation.findFirst({
    where: { sourceId: ag.sourceId, unlocode },
  });

  const override = await prisma.agreementLocationOverride.findUnique({
    where: { agreementId_unlocode: { agreementId, unlocode } },
  });

  // Override takes precedence
  if (override) return override.allowed;

  return !!base;
}

export async function startGrpcServers() {
  const server = new grpc.Server();

  // Availability
  const availabilityPkg = load("src/grpc/proto/availability.proto") as any;
  const AvailabilityService =
    availabilityPkg.core.availability.AvailabilityService.service;
  server.addService(AvailabilityService, {
    Submit: async (call: any, cb: any) => {
      // mTLS infrastructure available but disabled by default
      console.log(`[Availability.Submit] 🎯 gRPC Submit handler called:`, {
        agent_id: call.request?.agent_id,
        hasCriteria: !!call.request?.criteria,
        requestId: call.request?.request_id
      });
      
      try {
        const { criteria: raw, agent_id } = call.request;
        
        console.log(`[Availability.Submit] 📋 Raw request received:`, {
          agent_id,
          criteria: raw,
          request_id: call.request?.request_id
        });

        // 1) Normalize criteria (accept camel or snake)
        const pick = (a: any, b: any) => (a !== undefined ? a : b);
        const c = { ...(raw || {}) };
        c.pickup_unlocode = pick(c.pickup_unlocode, c.pickupUnlocode);
        c.dropoff_unlocode = pick(c.dropoff_unlocode, c.dropoffUnlocode);
        c.pickup_iso = pick(c.pickup_iso, c.pickupIso);
        c.dropoff_iso = pick(c.dropoff_iso, c.dropoffIso);
        c.driver_age = pick(c.driver_age, c.driverAge);
        c.residency_country = pick(c.residency_country, c.residencyCountry);
        c.vehicle_classes = pick(c.vehicle_classes, c.vehicleClasses);
        c.agreement_refs = pick(
          c.agreement_refs,
          pick(c.agreementRefs, pick(c.agreement_ref, c.agreementRef))
        );
        if (typeof c.agreement_refs === "string")
          c.agreement_refs = [c.agreement_refs];

        // 2) Auto-fill agreement_refs from ACTIVE agreements if none provided
        if (!Array.isArray(c.agreement_refs) || c.agreement_refs.length === 0) {
          const rows = await prisma.agreement.findMany({
            where: { agentId: agent_id, status: "ACTIVE" },
            select: { agreementRef: true },
          });
          c.agreement_refs = rows.map((r: any) => r.agreementRef);
        }

        // 3) Resolve eligible agreements/sources
        console.log(`[Availability.Submit] 🔍 Querying agreements:`, {
          agent_id,
          status: "ACTIVE",
          agreementRefs: c.agreement_refs,
          criteria: {
            pickup: c.pickup_unlocode,
            dropoff: c.dropoff_unlocode,
            pickupDate: c.pickup_iso,
            dropoffDate: c.dropoff_iso
          }
        });
        
        const agreements = await prisma.agreement.findMany({
          where: {
            agentId: agent_id,
            status: "ACTIVE",
            agreementRef: { in: c.agreement_refs },
          },
          select: { id: true, agreementRef: true, sourceId: true },
        });
        
        console.log(`[Availability.Submit] 📊 Agreements found:`, {
          count: agreements.length,
          agreements: agreements.map((a: any) => ({
            id: a.id,
            agreementRef: a.agreementRef,
            sourceId: a.sourceId
          }))
        });
        
        const expected_sources = new Set(agreements.map((a: any) => a.sourceId))
          .size;
        
        console.log(`[Availability.Submit] 📈 Expected sources: ${expected_sources} (unique source IDs)`);

        // 4) Always create a job (even if 0 sources), so we can return a request_id
        const jobId = await AvailabilityStore.createJob({
          agentId: agent_id,
          agreementRefs: c.agreement_refs,
          payload: c,
        });

        // Debug log
        logger.debug(
          { jobId, expected_sources, refs: c.agreement_refs },
          "[Availability.Submit]"
        );

        // 5) If no eligible sources, finish early with a valid request_id
        if (expected_sources === 0) {
          console.log(`[Availability.Submit] ⚠️ No sources found, returning early:`, {
            jobId,
            agent_id,
            agreementRefs: c.agreement_refs,
            agreementsFound: agreements.length
          });
          return cb(null, {
            request_id: jobId,
            expected_sources: 0,
            recommended_poll_ms: 1500,
          });
        }

        // 6) Per-agreement coverage check for pickup/dropoff + health filtering
        console.log(`[Availability.Submit] 🔍 Checking ${agreements.length} agreements for location coverage and health...`);
        const eligible: { ag: any }[] = [];
        for (const ag of agreements) {
          const okPick = await isLocationAllowedForAgreement(
            ag.id,
            c.pickup_unlocode
          );
          const okDrop = await isLocationAllowedForAgreement(
            ag.id,
            c.dropoff_unlocode
          );
          const isExcluded = await SourceHealthService.isSourceExcluded(
            ag.sourceId
          );

          console.log(`[Availability.Submit] 📍 Agreement ${ag.agreementRef} (source: ${ag.sourceId}):`, {
            pickup: c.pickup_unlocode,
            dropoff: c.dropoff_unlocode,
            okPick,
            okDrop,
            isExcluded,
            eligible: okPick && okDrop && !isExcluded
          });

          if (okPick && okDrop && !isExcluded) {
            eligible.push({ ag });
          }
        }

        console.log(`[Availability.Submit] ✅ Eligible agreements after filtering: ${eligible.length} out of ${agreements.length}`);

        if (eligible.length === 0) {
          console.log(`[Availability.Submit] ⚠️ No eligible agreements after location/health checks, marking job complete`);
          await prisma.availabilityJob.update({
            where: { id: jobId },
            data: { status: "COMPLETE" },
          });
          return cb(null, {
            request_id: jobId,
            expected_sources: 0,
            recommended_poll_ms: 1500,
          });
        }

        // 7) Parallel fan-out to adapters with health monitoring
        console.log(`[Availability.Submit] 🚀 Starting parallel fan-out to ${eligible.length} eligible agreements`);
        const TIMEOUT_MS = 10000;
        const SLA_TIMEOUT_MS = 120000; // 120 seconds overall SLA
        const limit = pLimit(10); // Max 10 concurrent

        const runOne = async (ag: any) => {
          console.log(`[Availability.Submit] 🎬 runOne() called for agreement ${ag.agreementRef} (source: ${ag.sourceId})`);
          const startTime = Date.now();
          console.log(`[Availability.Submit] 🔧 Getting adapter for source ${ag.sourceId} (agreement: ${ag.agreementRef})...`);
          
          const adapter = await getAdapterForSource(ag.sourceId);
          
          console.log(`[Availability.Submit] ✅ Adapter obtained for source ${ag.sourceId}:`, {
            adapterType: adapter?.constructor?.name || 'unknown',
            hasAvailabilityMethod: typeof adapter?.availability === 'function',
            adapter: adapter ? 'exists' : 'null/undefined'
          });
          
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          
          console.log(`[Availability.Submit] ⏱️ Timeout set to ${TIMEOUT_MS}ms for source ${ag.sourceId}`);

          let timedOut = false;
          try {
            console.log(`[Availability.Submit] 📞 Calling adapter.availability() for source ${ag.sourceId}:`, {
              sourceId: ag.sourceId,
              agreementRef: ag.agreementRef,
              pickup: c.pickup_unlocode,
              dropoff: c.dropoff_unlocode,
              pickupDate: c.pickup_iso,
              dropoffDate: c.dropoff_iso,
              driverAge: c.driver_age,
              residencyCountry: c.residency_country,
              vehicleClasses: c.vehicle_classes
            });
            
            console.log(`[Availability.Submit] 🔌 About to call adapter.availability() method...`);
            const offers = await adapter.availability({
              pickup_unlocode: c.pickup_unlocode,
              dropoff_unlocode: c.dropoff_unlocode,
              pickup_iso: c.pickup_iso,
              dropoff_iso: c.dropoff_iso,
              driver_age: Number(c.driver_age),
              residency_country: c.residency_country,
              vehicle_classes: c.vehicle_classes || [],
              agreement_ref: ag.agreementRef,
            });

            const latency = Date.now() - startTime;
            
            console.log(`[Availability.Submit] ✅ Adapter returned ${offers.length} offers for source ${ag.sourceId} (${latency}ms)`);

            // Record health metrics
            await SourceHealthService.recordMetric({
              latency,
              success: true,
              sourceId: ag.sourceId,
            });

            // Record adapter latency metric
            adapterLatency.observe(
              {
                source_id: ag.sourceId,
                operation: "availability",
                status: "success",
              },
              latency / 1000
            );

            console.log(`[Availability.Submit] 💾 Storing ${offers.length} offers for source ${ag.sourceId} in job ${jobId}`);
            await AvailabilityStore.appendPartial(jobId, ag.sourceId, offers);
            console.log(`[Availability.Submit] ✅ Successfully stored offers for source ${ag.sourceId}`);
          } catch (e) {
            const latency = Date.now() - startTime;
            const timedOut = controller.signal?.aborted || (e instanceof Error && e.name === "AbortError");
            
            console.error(`[Availability.Submit] ❌ Adapter error for source ${ag.sourceId} (${latency}ms):`, {
              error: e instanceof Error ? e.message : String(e),
              code: (e as any)?.code,
              details: (e as any)?.details,
              timedOut,
              sourceId: ag.sourceId,
              agreementRef: ag.agreementRef
            });
            
            // Record health metrics for failed requests
            await SourceHealthService.recordMetric({
              latency,
              success: false,
              sourceId: ag.sourceId,
            });

            // Record adapter latency metric for failed requests
            adapterLatency.observe(
              {
                source_id: ag.sourceId,
                operation: "availability",
                status: timedOut ? "timeout" : "error",
              },
              latency / 1000
            );

            await AvailabilityStore.appendPartial(jobId, ag.sourceId, [], timedOut);
            if (!timedOut) {
              // Only log non-timeout errors as explicit error entries
              await AvailabilityStore.appendPartial(jobId, ag.sourceId, [
                {
                  error: "SOURCE_ERROR",
                  message: e instanceof Error ? e.message : "Adapter failed",
                  agreement_ref: ag.agreementRef,
                },
              ]);
            }
          } finally {
            clearTimeout(timer);
          }
        };

        // Execute in parallel with SLA timeout
        const slaTimer = setTimeout(() => {
          logger.warn(
            { jobId, timeout: SLA_TIMEOUT_MS },
            "Availability SLA timeout reached"
          );
        }, SLA_TIMEOUT_MS);

        try {
          console.log(`[Availability.Submit] 📋 About to execute Promise.allSettled for ${eligible.length} agreements`);
          const promises = eligible.map(({ ag }, index) => {
            console.log(`[Availability.Submit] 📝 Creating promise ${index + 1}/${eligible.length} for agreement ${ag.agreementRef} (source: ${ag.sourceId})`);
            return limit(() => {
              console.log(`[Availability.Submit] 🔄 limit() callback executing for agreement ${ag.agreementRef}`);
              return runOne(ag);
            });
          });
          console.log(`[Availability.Submit] ⏳ Waiting for ${promises.length} promises to complete...`);
          const results = await Promise.allSettled(promises);
          console.log(`[Availability.Submit] ✅ All promises settled:`, results.map((r, i) => ({
            index: i,
            status: r.status,
            agreement: eligible[i].ag.agreementRef,
            value: r.status === 'fulfilled' ? 'success' : r.reason?.message || 'error'
          })));
        } finally {
          clearTimeout(slaTimer);
        }

        // 8) Mark job complete
        await AvailabilityStore.markJobComplete(jobId);

        cb(null, {
          request_id: jobId,
          expected_sources: eligible.length,
          recommended_poll_ms: 1500,
        });
      } catch (e: any) {
        cb(
          e.code
            ? e
            : {
                code: grpc.status.INTERNAL,
                message: e.message || "submit failed",
              }
        );
      }
    },

    Poll: async (call: any, cb: any) => {
      // mTLS infrastructure available but disabled by default
      try {
        const {
          request_id,
          since_seq = 0,
          wait_ms = 1000,
        } = call.request || {};
        if (!request_id) return cb({ code: 3, message: "Missing request_id" });
        const out = await AvailabilityStore.getJobSince(String(request_id), Number(since_seq), Number(wait_ms));
        
        // Get job to retrieve original criteria
        const job = await prisma.availabilityJob.findUnique({
          where: { id: request_id },
          select: { criteriaJson: true },
        });
        
        const criteria = (job?.criteriaJson as any) || {};
        
        // Add availability_request_id to each offer for booking context
        const offersWithRequestId = out.new_items.map((offer: any) => ({
          ...offer,
          availability_request_id: request_id, // Add request_id to each offer
        }));
        
        // Build OTA-compliant response structure
        const otaResponse = await buildAvailabilityResponse(criteria, offersWithRequestId);
        
        // gRPC proto expects: complete, last_seq, offers
        // For backward compatibility, also include flat offers array
        // But the OTA structure is now available in the response
        cb(null, {
          complete: out.status !== "IN_PROGRESS",
          last_seq: out.last_seq,
          offers: offersWithRequestId, // Keep flat array for backward compatibility
          ota_response: otaResponse, // Add OTA-compliant structure
        });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },
  });

  // Booking
  const bookingPkg = load("src/grpc/proto/booking.proto") as any;
  const BookingService = bookingPkg.core.booking.BookingService.service;
  server.addService(BookingService, {
    Create: async (call: any, cb: any) => {
      const t0 = Date.now();
      const req = call.request;
      try {
        console.log('[Booking.Create] 📥 Received gRPC booking request:', {
          hasRequest: !!req,
          requestKeys: req ? Object.keys(req) : [],
          idempotency_key: req?.idempotency_key ? `${req.idempotency_key.substring(0, 20)}...` : 'MISSING',
          agreement_ref: req?.agreement_ref,
          supplier_offer_ref: req?.supplier_offer_ref,
          source_id: req?.source_id
        });
        
        const {
          agent_id,
          source_id,
          agreement_ref,
          supplier_offer_ref,
          idempotency_key,
          agent_booking_ref,
          // New OTA fields
          availability_request_id,
          pickup_unlocode,
          dropoff_unlocode,
          pickup_iso,
          dropoff_iso,
          vehicle_class,
          vehicle_make_model,
          rate_plan_code,
          driver_age,
          residency_country,
          customer_info_json,
          payment_info_json,
        } = req;
        if (!source_id)
          return cb({ code: 3, message: "source_id is required" });
        if (!idempotency_key) {
          console.error('[Booking.Create] ❌ Missing idempotency_key in gRPC request:', {
            requestKeys: Object.keys(req),
            request: req
          });
          return cb({ code: 3, message: "idempotency_key is required" });
        }

        // Validate agreement ACTIVE for this agent + source
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: agent_id,
            sourceId: source_id,
            agreementRef: agreement_ref,
            status: "ACTIVE",
          },
        });
        if (!ag)
          return cb({ code: 9, message: "AGREEMENT_INACTIVE or not found" });

        // Idempotency check (scope booking:create)
        const scope = "booking:create";
        const existing = await prisma.idempotencyKey.findUnique({
          where: {
            agentId_scope_key: {
              agentId: agent_id,
              scope,
              key: idempotency_key,
            },
          },
        });
        if (existing) {
          // Return last known booking with that response (best effort)
          const last = await prisma.booking.findFirst({
            where: { agentId: agent_id, agreementRef: agreement_ref },
            orderBy: { createdAt: "desc" },
          });
          const resp = {
            supplier_booking_ref: last?.supplierBookingRef || "",
            status: last?.status || "REQUESTED",
            agreement_ref,
            source_id,
          };
          await auditLog({
            direction: "IN",
            endpoint: "booking.create",
            requestId: call.metadata?.get("x-request-id")?.[0] as any,
            companyId: agent_id,
            sourceId: source_id,
            grpcStatus: 0,
            request: req,
            response: resp,
            durationMs: Date.now() - t0,
          });
          return cb(null, resp);
        }

        // Route to adapter with health monitoring
        const adapter = await getAdapterForSource(source_id);
        const bookingStartTime = Date.now();

        // Get agent company info for POS element in OTA XML
        let agentCompanyName: string | undefined;
        try {
          const agentCompany = await prisma.company.findUnique({
            where: { id: agent_id },
            select: { companyName: true },
          });
          agentCompanyName = agentCompany?.companyName;
        } catch (e) {
          // If lookup fails, continue without company name
        }

        // Build full booking payload for adapter
        const bookingPayload: any = {
          agreement_ref,
          supplier_offer_ref: supplier_offer_ref || "",
          agent_booking_ref: agent_booking_ref || "",
          idempotency_key: idempotency_key, // REQUIRED: Pass idempotency_key to source backend
          agent_id, // Add agent ID for OTA XML POS element
          agent_company_name: agentCompanyName, // Add agent company name for OTA XML
        };
        
        console.log('[Booking.Create] 📦 Booking payload for adapter:', {
          agreement_ref: bookingPayload.agreement_ref,
          supplier_offer_ref: bookingPayload.supplier_offer_ref,
          idempotency_key: bookingPayload.idempotency_key ? `${bookingPayload.idempotency_key.substring(0, 20)}...` : 'MISSING',
          hasIdempotencyKey: !!bookingPayload.idempotency_key
        });
        
        // Add location details if provided
        if (pickup_unlocode) bookingPayload.pickup_unlocode = pickup_unlocode;
        if (dropoff_unlocode) bookingPayload.dropoff_unlocode = dropoff_unlocode;
        if (pickup_iso) bookingPayload.pickup_iso = pickup_iso;
        if (dropoff_iso) bookingPayload.dropoff_iso = dropoff_iso;
        
        // Add vehicle and driver details if provided
        if (vehicle_class) bookingPayload.vehicle_class = vehicle_class;
        if (vehicle_make_model) bookingPayload.vehicle_make_model = vehicle_make_model;
        if (rate_plan_code) bookingPayload.rate_plan_code = rate_plan_code;
        if (driver_age !== undefined) bookingPayload.driver_age = driver_age;
        if (residency_country) bookingPayload.residency_country = residency_country;
        
        // Parse customer and payment info JSON strings if provided
        let customerInfo = null;
        let paymentInfo = null;
        if (customer_info_json) {
          try {
            customerInfo = typeof customer_info_json === 'string' 
              ? JSON.parse(customer_info_json) 
              : customer_info_json;
            bookingPayload.customer_info = customerInfo;
          } catch (e) {
            // If parsing fails, keep as string
            bookingPayload.customer_info_json = customer_info_json;
          }
        }
        if (payment_info_json) {
          try {
            paymentInfo = typeof payment_info_json === 'string' 
              ? JSON.parse(payment_info_json) 
              : payment_info_json;
            bookingPayload.payment_info = paymentInfo;
          } catch (e) {
            // If parsing fails, keep as string
            bookingPayload.payment_info_json = payment_info_json;
          }
        }
        
        let supplierResp;
        try {
          supplierResp = await adapter.bookingCreate(bookingPayload);

          const bookingLatency = Date.now() - bookingStartTime;

          // Record successful booking health metric
          await SourceHealthService.recordMetric({
            latency: bookingLatency,
            success: true,
            sourceId: source_id,
          });

          // Record booking operation metric
          bookingOperationsTotal.inc({
            operation: "create",
            status: "success",
            source_id: source_id,
          });

          // Record adapter latency metric
          adapterLatency.observe(
            {
              source_id: source_id,
              operation: "booking_create",
              status: "success",
            },
            bookingLatency / 1000
          );
        } catch (error) {
          const bookingLatency = Date.now() - bookingStartTime;

          // Record failed booking health metric
          await SourceHealthService.recordMetric({
            latency: bookingLatency,
            success: false,
            sourceId: source_id,
          });

          // Record booking operation metric
          bookingOperationsTotal.inc({
            operation: "create",
            status: "error",
            source_id: source_id,
          });

          // Record adapter latency metric
          adapterLatency.observe(
            {
              source_id: source_id,
              operation: "booking_create",
              status: "error",
            },
            bookingLatency / 1000
          );

          throw error;
        }

        // Parse ISO datetime strings to DateTime objects if provided
        let pickupDateTime: Date | undefined;
        let dropoffDateTime: Date | undefined;
        if (pickup_iso) {
          pickupDateTime = new Date(pickup_iso);
          if (isNaN(pickupDateTime.getTime())) pickupDateTime = undefined;
        }
        if (dropoff_iso) {
          dropoffDateTime = new Date(dropoff_iso);
          if (isNaN(dropoffDateTime.getTime())) dropoffDateTime = undefined;
        }
        
        // Persist booking with full context
        const booking = await prisma.booking.create({
          data: {
            agentId: agent_id,
            sourceId: source_id,
            agreementRef: agreement_ref,
            supplierBookingRef: supplierResp.supplier_booking_ref,
            agentBookingRef: agent_booking_ref || null,
            idempotencyKey: idempotency_key || null,
            status: supplierResp.status || "REQUESTED",
            payloadJson: supplierResp as any,
            
            // Availability context
            availabilityRequestId: availability_request_id || null,
            
            // Location details
            pickupUnlocode: pickup_unlocode || null,
            dropoffUnlocode: dropoff_unlocode || null,
            pickupDateTime: pickupDateTime || null,
            dropoffDateTime: dropoffDateTime || null,
            
            // Vehicle and driver details
            vehicleClass: vehicle_class || null,
            vehicleMakeModel: vehicle_make_model || null,
            ratePlanCode: rate_plan_code || null,
            driverAge: driver_age || null,
            residencyCountry: residency_country || null,
            
            // Customer and payment info
            customerInfoJson: customerInfo || null,
            paymentInfoJson: paymentInfo || null,
          },
        });

        // Save idempotency record
        await prisma.idempotencyKey.create({
          data: {
            agentId: agent_id,
            scope,
            key: idempotency_key,
            responseHash: booking.id,
          },
        });

        // Record booking creation in history
        const { recordBookingCreated } = await import("../services/bookingHistory.js");
        await recordBookingCreated(booking, agent_id);

        // Build OTA-compliant booking response
        const bookingData = {
          supplier_booking_ref: booking.supplierBookingRef || "",
          agent_booking_ref: booking.agentBookingRef || "",
          agreement_ref: booking.agreementRef,
          source_id,
          status: booking.status,
          pickup_unlocode: booking.pickupUnlocode || pickup_unlocode,
          dropoff_unlocode: booking.dropoffUnlocode || dropoff_unlocode,
          pickup_iso: booking.pickupDateTime?.toISOString() || pickup_iso,
          dropoff_iso: booking.dropoffDateTime?.toISOString() || dropoff_iso,
          vehicle_class: booking.vehicleClass || vehicle_class,
          vehicle_make_model: booking.vehicleMakeModel || vehicle_make_model,
          rate_plan_code: booking.ratePlanCode || rate_plan_code,
          currency: (supplierResp as any).currency,
          total_price: (supplierResp as any).total_price,
          driver_age: booking.driverAge || driver_age,
          residency_country: booking.residencyCountry || residency_country,
          customer_info: customerInfo,
          payment_info: paymentInfo,
        };
        
        const otaResponse = await buildBookingResponse(bookingData, supplierResp);
        
        // For backward compatibility, also return flat structure
        const resp = {
          supplier_booking_ref: booking.supplierBookingRef || "",
          status: booking.status,
          agreement_ref: booking.agreementRef,
          source_id,
          ota_response: otaResponse, // Add OTA-compliant structure
        };

        await auditLog({
          direction: "IN",
          endpoint: "booking.create",
          requestId: call.metadata?.get("x-request-id")?.[0] as any,
          companyId: agent_id,
          sourceId: source_id,
          grpcStatus: 0,
          request: req,
          response: otaResponse,
          durationMs: Date.now() - t0,
        });
        cb(null, resp);
      } catch (e: any) {
        await auditLog({
          direction: "IN",
          endpoint: "booking.create",
          requestId: call.metadata?.get("x-request-id")?.[0] as any,
          companyId: call.request?.agent_id,
          sourceId: call.request?.source_id,
          grpcStatus: 13,
          request: req,
          response: { error: e.message },
          durationMs: Date.now() - t0,
        });
        cb({ code: 13, message: e.message });
      }
    },

    Modify: async (call: any, cb: any) => {
      const t0 = Date.now();
      const req = call.request;
      try {
        const { 
          supplier_booking_ref, 
          source_id, 
          agreement_ref,
          // Modification fields
          pickup_unlocode,
          dropoff_unlocode,
          pickup_iso,
          dropoff_iso,
          vehicle_class,
          vehicle_make_model,
          rate_plan_code,
          driver_age,
          residency_country,
          customer_info_json,
          payment_info_json,
          special_equip_prefs,
          option_change_indicator,
        } = req;
        if (!supplier_booking_ref || !source_id) {
          return cb({ code: 3, message: "supplier_booking_ref and source_id are required" });
        }

        // Use agreement_ref from request if provided, otherwise lookup from booking
        let agreementRef = agreement_ref;
        let agentId: string | undefined;
        
        if (!agreementRef) {
          // Lookup booking to get agreement_ref
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
            },
            select: { agreementRef: true, agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found" });
          }
          
          agreementRef = booking.agreementRef;
          agentId = booking.agentId;
        }

        // Lookup booking to get agentId if not already known
        if (!agentId) {
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
              agreementRef: agreementRef,
            },
            select: { agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found for this agreement" });
          }
          
          agentId = booking.agentId;
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: agentId,
            sourceId: source_id,
            agreementRef: agreementRef,
            status: "ACTIVE",
          },
        });

        if (!ag) {
          return cb({ code: 9, message: "AGREEMENT_INACTIVE or not found" });
        }

        // Build modification payload with all fields
        const modifyPayload: any = {
          supplier_booking_ref,
          agreement_ref: agreementRef,
        };
        
        // Add modification fields if provided
        if (pickup_unlocode) modifyPayload.pickup_unlocode = pickup_unlocode;
        if (dropoff_unlocode) modifyPayload.dropoff_unlocode = dropoff_unlocode;
        if (pickup_iso) modifyPayload.pickup_iso = pickup_iso;
        if (dropoff_iso) modifyPayload.dropoff_iso = dropoff_iso;
        if (vehicle_class) modifyPayload.vehicle_class = vehicle_class;
        if (vehicle_make_model) modifyPayload.vehicle_make_model = vehicle_make_model;
        if (rate_plan_code) modifyPayload.rate_plan_code = rate_plan_code;
        if (driver_age !== undefined) modifyPayload.driver_age = driver_age;
        if (residency_country) modifyPayload.residency_country = residency_country;
        if (customer_info_json) modifyPayload.customer_info_json = customer_info_json;
        if (payment_info_json) modifyPayload.payment_info_json = payment_info_json;
        if (special_equip_prefs) modifyPayload.special_equip_prefs = special_equip_prefs;
        if (option_change_indicator !== undefined) modifyPayload.option_change_indicator = option_change_indicator;

        // Get booking before modification for history
        const bookingBefore = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
            agreementRef: agreementRef,
          },
        });
        
        if (!bookingBefore) {
          return cb({ code: 5, message: "BOOKING_NOT_FOUND" });
        }

        const adapter = await getAdapterForSource(source_id);
        const resp = await adapter.bookingModify(modifyPayload);
        
        // Update booking with modification data if provided
        const updateData: any = { status: resp.status, payloadJson: resp as any };
        if (pickup_unlocode) updateData.pickupUnlocode = pickup_unlocode;
        if (dropoff_unlocode) updateData.dropoffUnlocode = dropoff_unlocode;
        if (pickup_iso) updateData.pickupDateTime = new Date(pickup_iso);
        if (dropoff_iso) updateData.dropoffDateTime = new Date(dropoff_iso);
        if (vehicle_class) updateData.vehicleClass = vehicle_class;
        if (vehicle_make_model) updateData.vehicleMakeModel = vehicle_make_model;
        if (rate_plan_code) updateData.ratePlanCode = rate_plan_code;
        if (driver_age !== undefined) updateData.driverAge = driver_age;
        if (residency_country) updateData.residencyCountry = residency_country;
        if (customer_info_json) {
          try {
            updateData.customerInfoJson = typeof customer_info_json === 'string' 
              ? JSON.parse(customer_info_json) 
              : customer_info_json;
          } catch (e) {
            updateData.customerInfoJson = customer_info_json;
          }
        }
        if (payment_info_json) {
          try {
            updateData.paymentInfoJson = typeof payment_info_json === 'string' 
              ? JSON.parse(payment_info_json) 
              : payment_info_json;
          } catch (e) {
            updateData.paymentInfoJson = payment_info_json;
          }
        }
        
        await prisma.booking.updateMany({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
          },
          data: updateData,
        });
        
        // Build OTA-compliant response
        const booking = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
            agreementRef: agreementRef,
          },
        });
        
        // Record booking modification in history
        if (booking && agentId) {
          const { recordBookingModified } = await import("../services/bookingHistory.js");
          const modifiedFields = Object.keys(updateData).filter(k => k !== 'status' && k !== 'payloadJson');
          await recordBookingModified(bookingBefore, booking, agentId, modifiedFields);
        }
        
        let finalResp: any = {
          supplier_booking_ref,
          agreement_ref: agreementRef,
          status: resp.status,
          source_id,
        };
        
        if (booking) {
          const bookingData = {
            supplier_booking_ref: booking.supplierBookingRef || "",
            agent_booking_ref: booking.agentBookingRef || "",
            agreement_ref: booking.agreementRef,
            source_id,
            status: booking.status,
            pickup_unlocode: booking.pickupUnlocode || undefined,
            dropoff_unlocode: booking.dropoffUnlocode || undefined,
            pickup_iso: booking.pickupDateTime?.toISOString(),
            dropoff_iso: booking.dropoffDateTime?.toISOString(),
            vehicle_class: booking.vehicleClass || undefined,
            vehicle_make_model: booking.vehicleMakeModel || undefined,
            rate_plan_code: booking.ratePlanCode || undefined,
            driver_age: booking.driverAge || undefined,
            residency_country: booking.residencyCountry || undefined,
            customer_info: booking.customerInfoJson,
            payment_info: booking.paymentInfoJson,
          };
          
          const otaResponse = await buildBookingResponse(bookingData, resp);
          finalResp.ota_response = otaResponse;
        }
        
        await auditLog({
          direction: "IN",
          endpoint: "booking.modify",
          companyId: agentId,
          sourceId: source_id,
          agreementRef: agreementRef,
          grpcStatus: 0,
          request: req,
          response: finalResp.ota_response || finalResp,
          durationMs: Date.now() - t0,
        });
        cb(null, finalResp);
      } catch (e: any) {
        await auditLog({
          direction: "IN",
          endpoint: "booking.modify",
          sourceId: call.request?.source_id,
          grpcStatus: 13,
          request: req,
          response: { error: e.message },
          durationMs: Date.now() - t0,
        });
        cb({ code: 13, message: e.message });
      }
    },

    Cancel: async (call: any, cb: any) => {
      const t0 = Date.now();
      const req = call.request;
      try {
        const { supplier_booking_ref, source_id, agreement_ref } = req;
        if (!supplier_booking_ref || !source_id) {
          return cb({ code: 3, message: "supplier_booking_ref and source_id are required" });
        }

        // Use agreement_ref from request if provided, otherwise lookup from booking
        let agreementRef = agreement_ref;
        let agentId: string | undefined;
        
        if (!agreementRef) {
          // Lookup booking to get agreement_ref
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
            },
            select: { agreementRef: true, agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found" });
          }
          
          agreementRef = booking.agreementRef;
          agentId = booking.agentId;
        }

        // Lookup booking to get agentId if not already known
        if (!agentId) {
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
              agreementRef: agreementRef,
            },
            select: { agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found for this agreement" });
          }
          
          agentId = booking.agentId;
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: agentId,
            sourceId: source_id,
            agreementRef: agreementRef,
            status: "ACTIVE",
          },
        });

        if (!ag) {
          return cb({ code: 9, message: "AGREEMENT_INACTIVE or not found" });
        }

        // Get booking before cancellation for history
        const bookingBefore = await prisma.booking.findFirst({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
            agreementRef: agreementRef,
          },
        });
        
        if (!bookingBefore) {
          return cb({ code: 5, message: "BOOKING_NOT_FOUND" });
        }

        const adapter = await getAdapterForSource(source_id);
        const resp = await adapter.bookingCancel(supplier_booking_ref, agreementRef);
        await prisma.booking.updateMany({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
          },
          data: { status: resp.status, payloadJson: resp as any },
        });
        
        // Record booking cancellation in history
        const { recordBookingCancelled } = await import("../services/bookingHistory.js");
        await recordBookingCancelled(bookingBefore, agentId, req.cancellation_reason);
        
        await auditLog({
          direction: "IN",
          endpoint: "booking.cancel",
          companyId: agentId,
          sourceId: source_id,
          agreementRef: agreementRef,
          grpcStatus: 0,
          request: req,
          response: resp,
          durationMs: Date.now() - t0,
        });
        cb(null, {
          supplier_booking_ref,
          agreement_ref: agreementRef,
          status: resp.status,
          source_id,
        });
      } catch (e: any) {
        await auditLog({
          direction: "IN",
          endpoint: "booking.cancel",
          sourceId: call.request?.source_id,
          grpcStatus: 13,
          request: req,
          response: { error: e.message },
          durationMs: Date.now() - t0,
        });
        cb({ code: 13, message: e.message });
      }
    },

    Check: async (call: any, cb: any) => {
      const t0 = Date.now();
      const req = call.request;
      try {
        const { supplier_booking_ref, source_id, agreement_ref } = req;
        if (!supplier_booking_ref || !source_id) {
          return cb({ code: 3, message: "supplier_booking_ref and source_id are required" });
        }

        // Use agreement_ref from request if provided, otherwise lookup from booking
        let agreementRef = agreement_ref;
        let agentId: string | undefined;
        
        if (!agreementRef) {
          // Lookup booking to get agreement_ref
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
            },
            select: { agreementRef: true, agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found" });
          }
          
          agreementRef = booking.agreementRef;
          agentId = booking.agentId;
        }

        // Lookup booking to get agentId if not already known
        if (!agentId) {
          const booking = await prisma.booking.findFirst({
            where: {
              supplierBookingRef: supplier_booking_ref,
              sourceId: source_id,
              agreementRef: agreementRef,
            },
            select: { agentId: true },
          });

          if (!booking) {
            return cb({ code: 5, message: "Booking not found for this agreement" });
          }
          
          agentId = booking.agentId;
        }

        // Validate agreement is ACTIVE
        const ag = await prisma.agreement.findFirst({
          where: {
            agentId: agentId,
            sourceId: source_id,
            agreementRef: agreementRef,
            status: "ACTIVE",
          },
        });

        if (!ag) {
          return cb({ code: 9, message: "AGREEMENT_INACTIVE or not found" });
        }

        const adapter = await getAdapterForSource(source_id);
        const resp = await adapter.bookingCheck(supplier_booking_ref, agreementRef);
        
        // Get booking(s) from database - handle single or multiple matches
        const bookings = await prisma.booking.findMany({
          where: {
            supplierBookingRef: supplier_booking_ref,
            sourceId: source_id,
            agreementRef: agreementRef,
          },
          select: {
            supplierBookingRef: true,
            agentBookingRef: true,
            agreementRef: true,
            status: true,
            pickupUnlocode: true,
            dropoffUnlocode: true,
            pickupDateTime: true,
            dropoffDateTime: true,
            vehicleClass: true,
            vehicleMakeModel: true,
            ratePlanCode: true,
            driverAge: true,
            residencyCountry: true,
            customerInfoJson: true,
            paymentInfoJson: true,
          },
        });
        
        // Build booking data array
        const bookingDataArray = bookings.map(booking => ({
          supplier_booking_ref: booking.supplierBookingRef || "",
          agent_booking_ref: booking.agentBookingRef || "",
          agreement_ref: booking.agreementRef,
          source_id,
          status: booking.status,
          pickup_unlocode: booking.pickupUnlocode || undefined,
          dropoff_unlocode: booking.dropoffUnlocode || undefined,
          pickup_iso: booking.pickupDateTime?.toISOString(),
          dropoff_iso: booking.dropoffDateTime?.toISOString(),
          vehicle_class: booking.vehicleClass || undefined,
          vehicle_make_model: booking.vehicleMakeModel || undefined,
          rate_plan_code: booking.ratePlanCode || undefined,
          driver_age: booking.driverAge || undefined,
          residency_country: booking.residencyCountry || undefined,
          customer_info: booking.customerInfoJson,
          payment_info: booking.paymentInfoJson,
        }));
        
        // Build OTA-compliant check response (single or multiple matches)
        const isSingleMatch = bookingDataArray.length === 1;
        const otaResponse = await buildCheckBookingResponse(bookingDataArray, isSingleMatch);
        
        const finalResp = {
          supplier_booking_ref,
          agreement_ref: agreementRef,
          status: resp.status,
          source_id,
          ota_response: otaResponse,
        };
        
        await auditLog({
          direction: "IN",
          endpoint: "booking.check",
          companyId: agentId,
          sourceId: source_id,
          agreementRef: agreementRef,
          grpcStatus: 0,
          request: req,
          response: otaResponse,
          durationMs: Date.now() - t0,
        });
        cb(null, finalResp);
      } catch (e: any) {
        await auditLog({
          direction: "IN",
          endpoint: "booking.check",
          sourceId: call.request?.source_id,
          grpcStatus: 13,
          request: req,
          response: { error: e.message },
          durationMs: Date.now() - t0,
        });
        cb({ code: 13, message: e.message });
      }
    },
  });

  // Agreement
  const agreementPkg = load("src/grpc/proto/agreement.proto") as any;
  const AgreementService = agreementPkg.core.agreement.AgreementService.service;

  server.addService(AgreementService, {
    CreateDraft: async (call: any, cb: any) => {
      try {
        const {
          agent_id,
          source_id,
          agreement_ref,
          valid_from,
          valid_to,
        } = call.request;
        // Simplified company validation with error handling
        let agentRow, sourceRow;
        try {
          console.log(`🔍 gRPC Debug - Looking for Agent: ${agent_id}`);
          agentRow = await prisma.company.findFirst({
            where: { id: String(agent_id).trim() },
            select: { id: true, type: true, status: true },
          });
          console.log(`🔍 gRPC Debug - Agent result: ${JSON.stringify(agentRow)}`);
          
          console.log(`🔍 gRPC Debug - Looking for Source: ${source_id}`);
          sourceRow = await prisma.company.findFirst({
            where: { id: String(source_id).trim() },
            select: { id: true, type: true, status: true },
          });
          console.log(`🔍 gRPC Debug - Source result: ${JSON.stringify(sourceRow)}`);
        } catch (error) {
          console.error('❌ gRPC Debug - Database error:', error);
          return cb({ code: 13, message: `Database error: ${error instanceof Error ? error.message : String(error)}` });
        }
        console.log('🔍 gRPC Debug - Initial Company Check:');
        console.log(`Agent Row: ${JSON.stringify(agentRow)}`);
        console.log(`Source Row: ${JSON.stringify(sourceRow)}`);
        
        if (!agentRow || !sourceRow)
          return cb({ code: 3, message: "Invalid agent or source" });
        if (agentRow.type !== "AGENT" || sourceRow.type !== "SOURCE") {
          return cb({ code: 3, message: "Invalid agent or source type" });
        }
        
        // Check company status - both must be ACTIVE
        console.log('🔍 gRPC Debug - Company Status Check:');
        console.log(`Agent ID: ${agent_id}, Status: ${agentRow.status}`);
        console.log(`Source ID: ${source_id}, Status: ${sourceRow.status}`);
        
        if (agentRow.status !== "ACTIVE" || sourceRow.status !== "ACTIVE") {
          return cb({ 
            code: 3, 
            message: `Companies must be ACTIVE. Agent: ${agentRow.status}, Source: ${sourceRow.status}` 
          });
        }
        const ag = await prisma.agreement.create({
          data: {
            agentId: agent_id,
            sourceId: source_id,
            agreementRef: agreement_ref,
            status: "DRAFT",
            validFrom: valid_from ? new Date(valid_from) : null,
            validTo: valid_to ? new Date(valid_to) : null,
          },
        });
        cb(null, toAgreementDTO(ag));
      } catch (e: any) {
        console.error('❌ gRPC CreateDraft Error:', e);
        console.error('❌ Error details:', {
          code: e.code,
          message: e.message,
          meta: e.meta,
          stack: e.stack
        });
        
        // Handle specific Prisma errors with better messages
        if (e.code === 'P2002') {
          // Unique constraint violation
          if (e.meta?.target?.includes('sourceId_agreementRef')) {
            return cb({ 
              code: 6, 
              message: `Agreement with reference '${call.request.agreement_ref}' already exists for this source. Please use a different agreement_ref or update the existing agreement.` 
            });
          }
          return cb({ 
            code: 6, 
            message: `Duplicate entry: ${e.meta?.target?.join(', ') || 'unique constraint violation'}` 
          });
        }
        
        // Handle other Prisma errors
        if (e.code && e.code.startsWith('P')) {
          return cb({ 
            code: 3, 
            message: `Database error: ${e.message}` 
          });
        }
        
        // Generic error
        return cb({ code: 13, message: e.message });
      }
    },

    Offer: async (call: any, cb: any) => {
      try {
        const { agreement_id } = call.request;
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Not found" });
        if (ag.status !== "DRAFT")
          return cb({ code: 9, message: "Only DRAFT can be offered" });
        const upd = await prisma.agreement.update({
          where: { id: agreement_id },
          data: { status: "OFFERED" },
        });
        // async notify
        notifyAgreementOffered(agreement_id).catch(() => {});
        cb(null, toAgreementDTO(upd));
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    Accept: async (call: any, cb: any) => {
      try {
        const { agreement_id } = call.request;
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Not found" });
        if (ag.status !== "OFFERED")
          return cb({ code: 9, message: "Only OFFERED can be accepted" });
        const upd = await prisma.agreement.update({
          where: { id: agreement_id },
          data: { status: "ACCEPTED" },
        });
        notifyAgreementAccepted(agreement_id).catch(() => {});
        cb(null, toAgreementDTO(upd));
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    SetStatus: async (call: any, cb: any) => {
      try {
        const { agreement_id, status } = call.request;
        const allowed = ["ACTIVE", "SUSPENDED", "EXPIRED"];
        if (!allowed.includes(status))
          return cb({ code: 3, message: "Invalid target status" });
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Not found" });

        // minimal transition guard
        const from = ag.status;
        const ok =
          (from === "ACCEPTED" && status === "ACTIVE") ||
          (from === "ACTIVE" &&
            (status === "SUSPENDED" || status === "EXPIRED")) ||
          (from === "SUSPENDED" && status === "ACTIVE");
        if (!ok)
          return cb({
            code: 9,
            message: `Invalid transition from ${from} to ${status}. Current status: ${from}. Allowed transitions: ${getAllowedTransitions(
              from
            )}`,
          });

        const upd = await prisma.agreement.update({
          where: { id: agreement_id },
          data: { status },
        });
        notifyAgreementStatus(agreement_id, status).catch(() => {});
        cb(null, toAgreementDTO(upd));
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    ListByAgent: async (call: any, cb: any) => {
      try {
        const { agent_id, status } = call.request;
        const where: any = { agentId: agent_id };
        if (status) where.status = status;
        
        // Debug logging
        // console.log('🔍 [gRPC ListByAgent] Query:', { agent_id, status: status || 'all', where });
        
        const rows = await prisma.agreement.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        
        // console.log('✅ [gRPC ListByAgent] Found:', { count: rows.length, statuses: rows.map(r => r.status) });
        
        cb(null, { items: rows.map(toAgreementDTO) });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    ListBySource: async (call: any, cb: any) => {
      try {
        const { source_id, status } = call.request;
        const where: any = { sourceId: source_id };
        if (status) where.status = status;
        const rows = await prisma.agreement.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        cb(null, { items: rows.map(toAgreementDTO) });
      } catch (e: any) {
        const sourceIdParam = call.request?.source_id || 'unknown';
        logger.error({ error: e, source_id: sourceIdParam }, "ListBySource error");
        
        // Handle database errors
        if (e?.message?.includes('DATABASE_URL') || e?.message?.includes('Environment variable not found')) {
          cb({ 
            code: 13, 
            message: "Database configuration error: DATABASE_URL not found. Please check your .env file and restart the server." 
          });
        } else if (e?.message?.includes('Access denied')) {
          cb({ 
            code: 13, 
            message: "Database authentication failed. Please check your DATABASE_URL in .env file and restart the server." 
          });
        } else {
          cb({ code: 13, message: e.message || "Internal server error" });
        }
      }
    },

    Get: async (call: any, cb: any) => {
      try {
        const { agreement_id } = call.request;
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Not found" });
        cb(null, toAgreementDTO(ag));
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },
  });

  // Location
  const locationPkg = load("src/grpc/proto/location.proto") as any;
  const LocationService = locationPkg.core.location.LocationService.service;

  server.addService(LocationService, {
    ListUNLocodes: async (call: any, cb: any) => {
      try {
        const { query = "", limit = 25, cursor = "" } = call.request || {};
        const take = Math.max(1, Math.min(100, Number(limit || 25)));
        const where: any = query
          ? {
              OR: [
                { unlocode: { contains: query } },
                { country: { contains: query } },
                { place: { contains: query } },
                { iataCode: { contains: query } },
              ],
            }
          : {};
        const rows = await prisma.uNLocode.findMany({
          where,
          take: take + 1,
          ...(cursor ? { cursor: { unlocode: cursor }, skip: 1 } : {}),
          orderBy: { unlocode: "asc" },
        });
        const hasMore = rows.length > take;
        const items = rows.slice(0, take).map((r: any) => ({
          unlocode: r.unlocode,
          country: r.country,
          place: r.place,
          iata_code: r.iataCode || "",
          latitude: r.latitude || 0,
          longitude: r.longitude || 0,
        }));
        const next_cursor = hasMore ? rows[take].unlocode : "";
        cb(null, { items, next_cursor });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    SyncSourceCoverage: async (call: any, cb: any) => {
      try {
        const { source_id } = call.request;
        const sid = String(source_id || "").trim();
        if (!sid) return cb({ code: 3, message: "source_id is required" });

        // Lookup SOURCE company (case-safe)
        let src: any = await prisma.company
          .findFirst({ where: { id: sid }, select: { id: true, type: true } })
          .catch(() => null);

        if (!src) {
          const anyUpper: any =
            await prisma.$queryRaw`SELECT id, type FROM Company WHERE id = ${sid} LIMIT 1`;
          src = Array.isArray(anyUpper) ? anyUpper[0] : null;
          if (!src) {
            const anyLower: any = await prisma.$queryRawUnsafe(
              "SELECT id, type FROM company WHERE id = ? LIMIT 1",
              sid
            );
            src = Array.isArray(anyLower) ? anyLower[0] : null;
          }
        }
        if (!src || src.type !== "SOURCE") {
          return cb({ code: 3, message: "Invalid source" });
        }

        // Pull fresh list from adapter (USE sid consistently)
        const adapter = await getAdapterForSource(sid);
        const latest: string[] = await adapter.locations(); // array of UN/LOCODEs (strings)

        // Filter to known UN/LOCODEs
        const known = await prisma.uNLocode.findMany({
          where: { unlocode: { in: latest } },
          select: { unlocode: true },
        });
        const validSet = new Set(known.map((k: any) => k.unlocode));

        // Count before
        const before = await prisma.sourceLocation.count({
          where: { sourceId: sid },
        });

        // Remove obsolete
        await prisma.sourceLocation.deleteMany({
          where: {
            sourceId: sid,
            NOT: { unlocode: { in: Array.from(validSet) } },
          },
        });
        const afterDelete = await prisma.sourceLocation.count({
          where: { sourceId: sid },
        });
        const removed = Math.max(0, before - afterDelete);

        // Insert new (skip duplicates)
        const toAdd = Array.from(validSet).map((u) => ({
          sourceId: sid,
          unlocode: u,
        }));
        if (toAdd.length) {
          await prisma.sourceLocation.createMany({
            data: toAdd,
            skipDuplicates: true,
          });
        }
        const total = await prisma.sourceLocation.count({
          where: { sourceId: sid },
        });
        const added = Math.max(0, total - afterDelete);

        cb(null, { added, removed, total });
      } catch (e: any) {
        cb({ code: 13, message: e?.message || "internal error" });
      }
    },

    ListCoverageByAgreement: async (call: any, cb: any) => {
      try {
        const { agreement_id } = call.request;
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Agreement not found" });

        const base = await prisma.sourceLocation.findMany({
          where: { sourceId: ag.sourceId },
          select: { unlocode: true },
        });
        const baseSet = new Set<string>(
          base.map((b: any) => b.unlocode as string)
        );

        const overrides = await prisma.agreementLocationOverride.findMany({
          where: { agreementId: agreement_id },
        });

        const allowItems = overrides
          .filter((o: any) => o.allowed)
          .map((o: any) => o.unlocode as string);
        const denyItems = overrides
          .filter((o: any) => !o.allowed)
          .map((o: any) => o.unlocode as string);

        // Final = (base ∪ allow) \ deny
        const finalSet = new Set<string>(baseSet);
        for (const item of allowItems) {
          finalSet.add(item);
        }
        for (const item of denyItems) {
          finalSet.delete(item);
        }

        const items = Array.from(finalSet)
          .sort()
          .map((u) => ({ unlocode: u, allowed: true }));
        cb(null, { items });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    UpsertAgreementOverride: async (call: any, cb: any) => {
      try {
        const { agreement_id, unlocode, allowed } = call.request;
        const ag = await prisma.agreement.findUnique({
          where: { id: agreement_id },
        });
        if (!ag) return cb({ code: 5, message: "Agreement not found" });
        await prisma.agreementLocationOverride.upsert({
          where: {
            agreementId_unlocode: { agreementId: agreement_id, unlocode },
          },
          update: { allowed },
          create: { agreementId: agreement_id, unlocode, allowed },
        });
        cb(null, { ok: true });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    RemoveAgreementOverride: async (call: any, cb: any) => {
      try {
        const { agreement_id, unlocode } = call.request;
        await prisma.agreementLocationOverride
          .delete({
            where: {
              agreementId_unlocode: { agreementId: agreement_id, unlocode },
            },
          })
          .catch(() => {});
        cb(null, { ok: true });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },
  });

  // Verification
  const verificationPkg = load("src/grpc/proto/verification.proto") as any;
  const VerificationService =
    verificationPkg.core.verification.VerificationService.service;

  server.addService(VerificationService, {
    RunSourceVerification: async (call: any, cb: any) => {
      try {
        const { source_id, test_agreement_ref } = call.request;
        const sid = String(source_id || "").trim();
        if (!sid) return cb({ code: 3, message: "source_id is required" });

        // Validate source exists and is correct type
        let src: any = await prisma.company
          .findFirst({ where: { id: sid }, select: { id: true, type: true } })
          .catch(() => null);
        if (!src) {
          const anyUpper: any =
            await prisma.$queryRaw`SELECT id, type FROM Company WHERE id = ${sid} LIMIT 1`;
          src = Array.isArray(anyUpper) ? anyUpper[0] : null;
          if (!src) {
            const anyLower: any = await prisma.$queryRawUnsafe(
              "SELECT id, type FROM company WHERE id = ? LIMIT 1",
              sid
            );
            src = Array.isArray(anyLower) ? anyLower[0] : null;
          }
        }
        if (!src || src.type !== "SOURCE")
          return cb({ code: 3, message: "Invalid source" });

        // Run comprehensive verification
        const result = await VerificationRunner.runSourceVerification(
          sid,
          test_agreement_ref
        );

        // Record verification metric
        verificationOperationsTotal.inc({
          type: "source",
          status: result.passed ? "success" : "failed",
        });

        // Transform steps from internal format to gRPC format
        const grpcSteps = result.steps.map((s) => ({
          name: s.step || '',
          passed: s.success || false,
          detail: s.message || '',
        }));

        cb(null, {
          company_id: result.companyId,
          kind: result.type,
          passed: result.passed,
          steps: grpcSteps,
          created_at: result.createdAt,
        });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    RunAgentVerification: async (call: any, cb: any) => {
      try {
        const {
          agent_id,
          source_id,
          test_agreement_ref,
        } = call.request;

        // Validate source_id is provided
        if (!source_id || source_id === "MOCK-SOURCE-ID") {
          return cb({
            code: grpc.status.INVALID_ARGUMENT,
            message: "source_id is required and cannot be MOCK-SOURCE-ID. Provide a real source company ID.",
          });
        }

        // Run comprehensive verification
        const result = await VerificationRunner.runAgentVerification(
          agent_id,
          source_id,
          test_agreement_ref
        );

        // Record verification metric
        verificationOperationsTotal.inc({
          type: "agent",
          status: result.passed ? "success" : "failed",
        });

        // Transform steps from internal format to gRPC format
        const grpcSteps = result.steps.map((s) => ({
          name: s.step || '',
          passed: s.success || false,
          detail: s.message || '',
        }));

        cb(null, {
          company_id: result.companyId,
          kind: result.type,
          passed: result.passed,
          steps: grpcSteps,
          created_at: result.createdAt,
        });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },

    GetVerificationStatus: async (call: any, cb: any) => {
      try {
        const { company_id } = call.request;
        const result = await VerificationRunner.getVerificationStatus(
          company_id
        );

        if (!result) {
          return cb(null, {
            company_id,
            kind: "",
            passed: false,
            steps: [],
            created_at: "",
          });
        }

        // Transform steps from internal format to gRPC format
        const grpcSteps = result.steps.map((s: any) => ({
          name: s.step || s.name || '',
          passed: s.success !== undefined ? s.success : (s.passed || false),
          detail: s.message || s.detail || '',
        }));

        cb(null, {
          company_id: result.companyId,
          kind: result.type,
          passed: result.passed,
          steps: grpcSteps,
          created_at: result.createdAt,
        });
      } catch (e: any) {
        cb({ code: 13, message: e.message });
      }
    },
  });

  function toAgreementDTO(ag: any) {
    return {
      id: ag.id,
      agent_id: ag.agentId,
      source_id: ag.sourceId,
      agreement_ref: ag.agreementRef,
      status: ag.status,
      valid_from: ag.validFrom ? ag.validFrom.toISOString() : "",
      valid_to: ag.validTo ? ag.validTo.toISOString() : "",
    };
  }

  // Echo Service
  const echoPkg = load("src/grpc/proto/echo.proto") as any;
  const MiddlewareService = echoPkg.middleware.MiddlewareService.service;
  server.addService(MiddlewareService, {
    SubmitEcho: async (call: any, cb: any) => {
      try {
        const { request_ref, pos, payload } = call.request;
        const { agent_id, agreement_ref } = pos || {};

        if (!agent_id || !agreement_ref) {
          return cb({ code: 3, message: "agent_id and agreement_ref required" });
        }

        const result = await submitEcho(request_ref || "", agent_id, agreement_ref, {
          message: payload?.message || "",
          attrs: (payload?.attrs as Record<string, string>) || {},
        });

        cb(null, {
          request_id: result.requestId,
          total_expected: result.totalExpected,
          expires_unix_ms: result.expiresUnixMs,
          recommended_poll_ms: result.recommendedPollMs,
        });
      } catch (error: any) {
        logger.error({ error: error.message }, "SubmitEcho error");
        cb({ code: 13, message: error.message || "Internal error" });
      }
    },
    GetEchoResults: async (call: any, cb: any) => {
      try {
        const { request_id, since_seq, wait_ms } = call.request;

        if (!request_id) {
          return cb({ code: 3, message: "request_id required" });
        }

        const result = await getEchoResults(
          request_id,
          BigInt(since_seq || 0),
          wait_ms || 1000
        );

        cb(null, {
          request_id: result.requestId,
          status: result.status === "COMPLETE" ? 1 : 0,
          new_items: result.newItems.map((item) => ({
            echoed_message: item.echoedMessage,
            echoed_attrs: item.echoedAttrs,
          })),
          last_seq: result.lastSeq.toString(),
          responses_received: result.responsesReceived,
          total_expected: result.totalExpected,
          timed_out_sources: result.timedOutSources,
          aggregate_etag: result.aggregateEtag,
        });
      } catch (error: any) {
        logger.error({ error: error.message }, "GetEchoResults error");
        cb({ code: 13, message: error.message || "Internal error" });
      }
    },
    WatchEchoResults: async (call: any) => {
      try {
        const { request_id } = call.request;
        
        if (!request_id) {
          call.emit('error', { code: 3, message: "request_id required" });
          call.end();
          return;
        }

        // Poll for updates and stream them
        let lastSeq = BigInt(0);
        const pollInterval = 1000; // Poll every 1 second
        const maxDuration = 300000; // 5 minutes max stream duration
        const startTime = Date.now();

        const pollAndStream = async () => {
          try {
            const result = await getEchoResults(request_id, lastSeq, 1000);
            
            // Send update if we have new items or status changed
            if (result.newItems.length > 0 || result.status === "COMPLETE") {
              const echoResponse = {
                request_id: result.requestId,
                status: result.status === "COMPLETE" ? 1 : 0,
                responses_received: result.responsesReceived,
                total_expected: result.totalExpected,
                aggregate: {
                  items: result.newItems.map((item) => ({
                    echoed_message: item.echoedMessage,
                    echoed_attrs: item.echoedAttrs,
                  })),
                },
                progress: {
                  started_unix_ms: Date.now() - (Date.now() - startTime),
                  last_update_unix_ms: Date.now(),
                  timed_out_sources: result.timedOutSources,
                },
              };
              
              call.write(echoResponse);
              lastSeq = result.lastSeq;
            }

            // Continue polling if not complete and within time limit
            if (result.status === "IN_PROGRESS" && (Date.now() - startTime) < maxDuration) {
              setTimeout(pollAndStream, pollInterval);
            } else {
              call.end();
            }
          } catch (error: any) {
            logger.error({ error: error.message, request_id }, "WatchEchoResults poll error");
            call.emit('error', { code: 13, message: error.message || "Internal error" });
            call.end();
          }
        };

        // Start polling
        pollAndStream();
      } catch (error: any) {
        logger.error({ error: error.message }, "WatchEchoResults error");
        call.emit('error', { code: 13, message: error.message || "Internal error" });
        call.end();
      }
    },
  });

  // mTLS infrastructure available but disabled by default
  // To enable: set GRPC_TLS_ENABLED=true and use createServerCredentials()
  server.bindAsync(
    `0.0.0.0:${CORE_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error({ error: err.message, port: CORE_PORT }, "gRPC core server bind error (non-fatal)");
        return;
      }
      server.start();
      logger.info({ port }, "gRPC core server started");
    }
  );
}
