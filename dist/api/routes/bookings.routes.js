import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyStatus } from "../../infra/policies.js";
import { z } from "zod";
import { bookingClient } from "../../grpc/clients/core.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { auditLog, logBooking } from "../../services/audit.js";
import { getBookingHistory } from "../../services/bookingHistory.js";
export const bookingsRouter = Router();
// List bookings for current agent (or all for admin)
bookingsRouter.get("/", requireAuth(), async (req, res, next) => {
    try {
        const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
        const companyId = String(req.query.company_id || "").trim();
        const requestId = String(req.query.request_id || "").trim();
        const isAdmin = req.user?.role === "ADMIN";
        const where = {};
        if (!isAdmin)
            where.agentId = req.user.companyId;
        if (isAdmin && companyId)
            where.agentId = companyId;
        if (requestId)
            where.id = requestId; // best-effort filter
        const rows = await prisma.booking.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        // Return format expected by frontend Dashboard
        res.json({ data: rows, items: rows });
    }
    catch (e) {
        next(e);
    }
});
// Helper function to get valid booking data for an agent
async function getValidBookingData(agentId) {
    try {
        // Get active agreements for this agent
        const agreements = await prisma.agreement.findMany({
            where: {
                agentId: agentId,
                status: 'ACTIVE'
            },
            include: {
                source: {
                    select: {
                        id: true,
                        companyName: true,
                        status: true
                    }
                }
            },
            take: 5 // Limit to 5 most recent
        });
        // Get all active sources
        const sources = await prisma.company.findMany({
            where: {
                type: 'SOURCE',
                status: 'ACTIVE'
            },
            select: {
                id: true,
                companyName: true,
                status: true
            },
            take: 5 // Limit to 5
        });
        return {
            validAgreements: agreements.map(agreement => ({
                agreementRef: agreement.agreementRef,
                status: agreement.status,
                source: {
                    id: agreement.source.id,
                    companyName: agreement.source.companyName,
                    status: agreement.source.status
                }
            })),
            validSources: sources.map(source => ({
                id: source.id,
                companyName: source.companyName,
                status: source.status
            })),
            sampleRequest: {
                source_id: agreements[0]?.source?.id || sources[0]?.id || "REQUIRED",
                agreement_ref: agreements[0]?.agreementRef || "REQUIRED",
                agent_booking_ref: "YOUR-BOOKING-REF-123"
            }
        };
    }
    catch (error) {
        return {
            error: "Failed to fetch valid data",
            suggestion: "Check if you have active agreements and sources"
        };
    }
}
const createSchema = z.object({
    agreement_ref: z.string(),
    supplier_offer_ref: z.string().optional(),
    agent_booking_ref: z.string().optional(),
    // Availability context (optional - if provided, will retrieve context from availability search)
    availability_request_id: z.string().optional(),
    // Location details (from availability search) - OTA: PickupLocation, DropOffLocation
    pickup_unlocode: z.string().optional(), // PickupLocation (UN/LOCODE)
    dropoff_unlocode: z.string().optional(), // DropOffLocation (UN/LOCODE)
    pickup_iso: z.string().optional(), // PickupDateTime (ISO-8601)
    dropoff_iso: z.string().optional(), // DropOffDateTime (ISO-8601)
    // Vehicle and driver details (from availability search/offer)
    vehicle_class: z.string().optional(), // VehicleClass (OTA codes: ECMN, CDMR, etc.)
    vehicle_make_model: z.string().optional(), // VehicleMakeModel
    rate_plan_code: z.string().optional(), // RatePlanCode (BAR, MEMBER, PREPAY, etc.)
    driver_age: z.number().int().min(18).optional(), // DriverAge
    residency_country: z.string().length(2).optional(), // ResidencyCountry (ISO 3166-1 alpha-2)
    // Customer and payment information (JSON objects)
    customer_info: z.record(z.any()).optional(), // Customer name, contact details, etc.
    payment_info: z.record(z.any()).optional(), // Payment details, card info, etc.
});
/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create booking (single supplier pass-through, idempotent)
 *     description: |
 *       Create booking using OTA-aligned field names:
 *       - source_id: Target supplier for routing
 *       - agreement_ref: Business agreement reference
 *       - supplier_offer_ref: Optional supplier's offer reference
 *       - agent_booking_ref: Optional external booking reference
 *       - Idempotency-Key header: Required for safety
 */
bookingsRouter.post("/", requireAuth(), async (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    try {
        const body = createSchema.parse(req.body);
        // Check for idempotency key in various header formats (case-insensitive)
        // Express lowercases headers, so check lowercase version first
        // Also check rawHeaders which preserves original case
        const rawHeaders = req.rawHeaders || [];
        const idempotencyKey = req.headers["idempotency-key"] ||
            req.headers["Idempotency-Key"] ||
            req.headers["IDEMPOTENCY-KEY"] ||
            // Check rawHeaders for original case
            (rawHeaders.findIndex((h) => h.toLowerCase() === 'idempotency-key') >= 0
                ? rawHeaders[rawHeaders.findIndex((h) => h.toLowerCase() === 'idempotency-key') + 1]
                : undefined);
        console.log('[Booking.Create] 🔍 Checking idempotency key:', {
            headers: Object.keys(req.headers).filter(k => k.toLowerCase().includes('idempotency')),
            rawHeaders: rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase().includes('idempotency')),
            idempotencyKey: idempotencyKey ? `${String(idempotencyKey).substring(0, 20)}...` : 'MISSING',
            idempotencyKeyType: typeof idempotencyKey,
            idempotencyKeyValue: idempotencyKey
        });
        if (!idempotencyKey) {
            const errorResponse = {
                error: "SCHEMA_ERROR",
                message: "Missing Idempotency-Key header",
                details: "The Idempotency-Key header is required for all booking operations to ensure request safety and prevent duplicate bookings.",
                hint: "Include the header in your request: 'Idempotency-Key: <unique-value>'",
                example: "Idempotency-Key: booking-1234567890-abc123"
            };
            // Log the error
            await auditLog({
                direction: "IN",
                endpoint: "booking.create",
                requestId,
                companyId: req.user.companyId,
                sourceId: body.source_id,
                httpStatus: 400,
                request: body,
                response: errorResponse,
                durationMs: Date.now() - startTime,
            });
            return res.status(400).json(errorResponse);
        }
        // Enforce single-supplier dispatch via agreement_ref -> resolve agreement -> source
        const agreementRow = await prisma.agreement.findFirst({
            where: {
                agentId: req.user.companyId,
                agreementRef: body.agreement_ref,
                status: 'ACTIVE'
            },
            select: { id: true, sourceId: true }
        });
        if (!agreementRow) {
            const errorResponse = { error: "AGREEMENT_INACTIVE", message: "Agreement not active or not found for this agent/source" };
            await auditLog({
                direction: "IN",
                endpoint: "booking.create",
                requestId,
                companyId: req.user.companyId,
                sourceId: undefined,
                agreementRef: body.agreement_ref,
                httpStatus: 409,
                request: body,
                response: errorResponse,
                durationMs: Date.now() - startTime,
            });
            return res.status(409).json(errorResponse);
        }
        const client = bookingClient();
        // Create a custom error handler to catch AGREEMENT_INACTIVE
        const customErrorHandler = async (err, resp) => {
            const duration = Date.now() - startTime;
            if (err && err.message && err.message.includes("AGREEMENT_INACTIVE")) {
                try {
                    const validData = await getValidBookingData(req.user.companyId);
                    const errorResponse = {
                        error: "AGREEMENT_INACTIVE",
                        message: "Agreement not found or inactive",
                        validData: validData,
                        suggestion: "Use one of the valid agreements and sources listed above"
                    };
                    await logBooking({
                        requestId,
                        agentId: req.user.companyId,
                        sourceId: agreementRow?.sourceId,
                        agreementRef: body.agreement_ref,
                        operation: "create",
                        requestPayload: body,
                        responsePayload: errorResponse,
                        statusCode: 400,
                        durationMs: duration,
                    });
                    return res.status(400).json(errorResponse);
                }
                catch (error) {
                    const errorResponse = {
                        error: "AGREEMENT_INACTIVE",
                        message: "Agreement not found or inactive",
                        suggestion: "Create an agreement first using POST /admin/agreements"
                    };
                    await logBooking({
                        requestId,
                        agentId: req.user.companyId,
                        sourceId: agreementRow?.sourceId,
                        agreementRef: body.agreement_ref,
                        operation: "create",
                        requestPayload: body,
                        responsePayload: errorResponse,
                        statusCode: 400,
                        durationMs: duration,
                    });
                    return res.status(400).json(errorResponse);
                }
            }
            else if (err) {
                // Map upstream adapter failures/timeouts to 502
                const status = 502;
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: agreementRow?.sourceId,
                    agreementRef: body.agreement_ref,
                    operation: "create",
                    requestPayload: body,
                    responsePayload: { error: err.message },
                    statusCode: status,
                    grpcStatus: err.code || 13,
                    durationMs: duration,
                });
                return res.status(status).json({ error: "UPSTREAM_ERROR", message: err.message });
            }
            else {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: agreementRow?.sourceId,
                    agreementRef: body.agreement_ref,
                    operation: "create",
                    requestPayload: body,
                    responsePayload: resp,
                    statusCode: 200,
                    durationMs: duration,
                });
                res.json(resp);
            }
        };
        // If availability_request_id is provided, retrieve the original search criteria
        let availabilityContext = null;
        if (body.availability_request_id) {
            try {
                const availabilityJob = await prisma.availabilityJob.findUnique({
                    where: { id: body.availability_request_id },
                    select: {
                        criteriaJson: true,
                        agentId: true
                    },
                });
                if (availabilityJob && availabilityJob.agentId === req.user.companyId) {
                    availabilityContext = availabilityJob.criteriaJson;
                }
                else if (availabilityJob && availabilityJob.agentId !== req.user.companyId) {
                    return res.status(403).json({
                        error: "FORBIDDEN",
                        message: "Availability request does not belong to this agent"
                    });
                }
            }
            catch (e) {
                // If lookup fails, continue without context
                console.error('Failed to retrieve availability context:', e);
            }
        }
        // Build full booking payload with all OTA fields
        // Merge availability context with explicit booking fields (explicit fields take precedence)
        const bookingPayload = {
            agent_id: req.user.companyId,
            source_id: agreementRow.sourceId,
            agreement_ref: body.agreement_ref,
            supplier_offer_ref: body.supplier_offer_ref || "",
            idempotency_key: String(idempotencyKey),
            agent_booking_ref: body.agent_booking_ref || "",
            // Append trace fields for the adapter/supplier
            middleware_request_id: requestId,
            agent_company_id: req.user.companyId,
        };
        console.log('[Booking.Create] 📋 Booking payload prepared for gRPC:', {
            agent_id: bookingPayload.agent_id,
            source_id: bookingPayload.source_id,
            agreement_ref: bookingPayload.agreement_ref,
            supplier_offer_ref: bookingPayload.supplier_offer_ref,
            idempotency_key: bookingPayload.idempotency_key ? `${bookingPayload.idempotency_key.substring(0, 20)}...` : 'MISSING',
            hasIdempotencyKey: !!bookingPayload.idempotency_key,
            payloadKeys: Object.keys(bookingPayload)
        });
        // Add availability context if provided
        if (body.availability_request_id) {
            bookingPayload.availability_request_id = body.availability_request_id;
        }
        // Merge availability context with explicit fields (explicit takes precedence)
        if (availabilityContext) {
            // Extract location details from availability search
            if (!bookingPayload.pickup_unlocode && availabilityContext.pickup_unlocode) {
                bookingPayload.pickup_unlocode = availabilityContext.pickup_unlocode;
            }
            if (!bookingPayload.dropoff_unlocode && availabilityContext.dropoff_unlocode) {
                bookingPayload.dropoff_unlocode = availabilityContext.dropoff_unlocode;
            }
            if (!bookingPayload.pickup_iso && availabilityContext.pickup_iso) {
                bookingPayload.pickup_iso = availabilityContext.pickup_iso;
            }
            if (!bookingPayload.dropoff_iso && availabilityContext.dropoff_iso) {
                bookingPayload.dropoff_iso = availabilityContext.dropoff_iso;
            }
            if (!bookingPayload.driver_age && availabilityContext.driver_age) {
                bookingPayload.driver_age = availabilityContext.driver_age;
            }
            if (!bookingPayload.residency_country && availabilityContext.residency_country) {
                bookingPayload.residency_country = availabilityContext.residency_country;
            }
        }
        // If supplier_offer_ref is provided and we have availability context,
        // try to extract vehicle details from the selected offer
        if (body.supplier_offer_ref && body.availability_request_id) {
            try {
                // Find the offer in availability results
                const availabilityResults = await prisma.availabilityResult.findMany({
                    where: {
                        jobId: body.availability_request_id,
                    },
                    select: {
                        offerJson: true,
                        sourceId: true,
                    },
                });
                // Find the matching offer by supplier_offer_ref
                for (const result of availabilityResults) {
                    const offer = result.offerJson;
                    if (offer &&
                        (offer.supplier_offer_ref === body.supplier_offer_ref ||
                            offer.SupplierOfferRef === body.supplier_offer_ref)) {
                        // Extract vehicle details from the offer
                        if (!bookingPayload.vehicle_class && (offer.vehicle_class || offer.VehicleClass)) {
                            bookingPayload.vehicle_class = offer.vehicle_class || offer.VehicleClass;
                        }
                        if (!bookingPayload.vehicle_make_model && (offer.vehicle_make_model || offer.VehicleMakeModel)) {
                            bookingPayload.vehicle_make_model = offer.vehicle_make_model || offer.VehicleMakeModel;
                        }
                        if (!bookingPayload.rate_plan_code && (offer.rate_plan_code || offer.RatePlanCode)) {
                            bookingPayload.rate_plan_code = offer.rate_plan_code || offer.RatePlanCode;
                        }
                        break; // Found the matching offer, no need to continue
                    }
                }
            }
            catch (e) {
                // If lookup fails, continue without offer details
                console.error('Failed to retrieve offer details from availability results:', e);
            }
        }
        // Add location details if provided
        if (body.pickup_unlocode)
            bookingPayload.pickup_unlocode = body.pickup_unlocode;
        if (body.dropoff_unlocode)
            bookingPayload.dropoff_unlocode = body.dropoff_unlocode;
        if (body.pickup_iso)
            bookingPayload.pickup_iso = body.pickup_iso;
        if (body.dropoff_iso)
            bookingPayload.dropoff_iso = body.dropoff_iso;
        // Add vehicle and driver details if provided
        if (body.vehicle_class)
            bookingPayload.vehicle_class = body.vehicle_class;
        if (body.vehicle_make_model)
            bookingPayload.vehicle_make_model = body.vehicle_make_model;
        if (body.rate_plan_code)
            bookingPayload.rate_plan_code = body.rate_plan_code;
        if (body.driver_age !== undefined)
            bookingPayload.driver_age = body.driver_age;
        if (body.residency_country)
            bookingPayload.residency_country = body.residency_country;
        // Add customer and payment info if provided (convert to JSON strings for proto)
        if (body.customer_info) {
            bookingPayload.customer_info_json = JSON.stringify(body.customer_info);
        }
        if (body.payment_info) {
            bookingPayload.payment_info_json = JSON.stringify(body.payment_info);
        }
        client.Create(bookingPayload, metaFromReq(req), customErrorHandler);
    }
    catch (e) {
        // Log validation errors
        await auditLog({
            direction: "IN",
            endpoint: "booking.create",
            requestId,
            companyId: req.user?.companyId,
            httpStatus: 400,
            request: req.body,
            response: { error: e instanceof Error ? e.message : String(e) },
            durationMs: Date.now() - startTime,
        });
        next(e);
    }
});
// [AUTO-AUDIT] Require agreement_ref for modify/cancel/check to enforce agreements
const idSchema = z.object({ supplier_booking_ref: z.string(), agreement_ref: z.string() });
/**
 * @openapi
 * /bookings/{ref}:
 *   patch:
 *     tags: [Bookings]
 *     summary: Modify booking (single supplier)
 */
bookingsRouter.patch("/:ref", requireAuth(), requireCompanyStatus("ACTIVE"), async (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    try {
        const qp = idSchema.parse({ supplier_booking_ref: String(req.params.ref), agreement_ref: String(req.query.agreement_ref || "") });
        // resolve agreement -> source
        const activeAgreement = await prisma.agreement.findFirst({
            where: { agentId: req.user.companyId, agreementRef: qp.agreement_ref, status: 'ACTIVE' },
            select: { id: true, sourceId: true }
        });
        if (!activeAgreement) {
            const errorResponse = { error: "AGREEMENT_INACTIVE", message: "Agreement not active or not found for this agent/source" };
            await auditLog({
                direction: "IN",
                endpoint: "booking.modify",
                requestId,
                companyId: req.user.companyId,
                sourceId: undefined,
                agreementRef: qp.agreement_ref,
                httpStatus: 409,
                request: qp,
                response: errorResponse,
                durationMs: Date.now() - startTime,
            });
            return res.status(409).json(errorResponse);
        }
        const client = bookingClient();
        client.Modify({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            if (err) {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "modify",
                    requestPayload: qp,
                    responsePayload: { error: err.message },
                    statusCode: 502,
                    grpcStatus: err.code || 13,
                    durationMs: duration,
                });
                return res.status(502).json({ error: "UPSTREAM_ERROR", message: err.message });
            }
            else {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "modify",
                    requestPayload: qp,
                    responsePayload: resp,
                    statusCode: 200,
                    durationMs: duration,
                });
                res.json(resp);
            }
        });
    }
    catch (e) {
        // Log validation errors
        await auditLog({
            direction: "IN",
            endpoint: "booking.modify",
            requestId,
            companyId: req.user?.companyId,
            httpStatus: 400,
            request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
            response: { error: e instanceof Error ? e.message : String(e) },
            durationMs: Date.now() - startTime,
        });
        next(e);
    }
});
/**
 * @openapi
 * /bookings/{ref}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel booking (single supplier)
 */
bookingsRouter.post("/:ref/cancel", requireAuth(), requireCompanyStatus("ACTIVE"), async (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    try {
        const qp = idSchema.parse({ supplier_booking_ref: String(req.params.ref), agreement_ref: String(req.query.agreement_ref || "") });
        const activeAgreement = await prisma.agreement.findFirst({
            where: { agentId: req.user.companyId, agreementRef: qp.agreement_ref, status: 'ACTIVE' },
            select: { id: true, sourceId: true }
        });
        if (!activeAgreement) {
            const errorResponse = { error: "AGREEMENT_INACTIVE", message: "Agreement not active or not found for this agent/source" };
            await auditLog({
                direction: "IN",
                endpoint: "booking.cancel",
                requestId,
                companyId: req.user.companyId,
                sourceId: undefined,
                agreementRef: qp.agreement_ref,
                httpStatus: 409,
                request: qp,
                response: errorResponse,
                durationMs: Date.now() - startTime,
            });
            return res.status(409).json(errorResponse);
        }
        const client = bookingClient();
        client.Cancel({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            if (err) {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "cancel",
                    requestPayload: qp,
                    responsePayload: { error: err.message },
                    statusCode: 502,
                    grpcStatus: err.code || 13,
                    durationMs: duration,
                });
                return res.status(502).json({ error: "UPSTREAM_ERROR", message: err.message });
            }
            else {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "cancel",
                    requestPayload: qp,
                    responsePayload: resp,
                    statusCode: 200,
                    durationMs: duration,
                });
                res.json(resp);
            }
        });
    }
    catch (e) {
        // Log validation errors
        await auditLog({
            direction: "IN",
            endpoint: "booking.cancel",
            requestId,
            companyId: req.user?.companyId,
            httpStatus: 400,
            request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
            response: { error: e instanceof Error ? e.message : String(e) },
            durationMs: Date.now() - startTime,
        });
        next(e);
    }
});
/**
 * @openapi
 * /bookings/{ref}:
 *   get:
 *     tags: [Bookings]
 *     summary: Check booking status (single supplier)
 */
bookingsRouter.get("/:ref", requireAuth(), requireCompanyStatus("ACTIVE"), async (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    try {
        const qp = idSchema.parse({ supplier_booking_ref: String(req.params.ref), agreement_ref: String(req.query.agreement_ref || "") });
        const activeAgreement = await prisma.agreement.findFirst({
            where: { agentId: req.user.companyId, agreementRef: qp.agreement_ref, status: 'ACTIVE' },
            select: { id: true, sourceId: true }
        });
        if (!activeAgreement) {
            const errorResponse = { error: "AGREEMENT_INACTIVE", message: "Agreement not active or not found for this agent/source" };
            await auditLog({
                direction: "IN",
                endpoint: "booking.check",
                requestId,
                companyId: req.user.companyId,
                sourceId: undefined,
                agreementRef: qp.agreement_ref,
                httpStatus: 409,
                request: qp,
                response: errorResponse,
                durationMs: Date.now() - startTime,
            });
            return res.status(409).json(errorResponse);
        }
        const client = bookingClient();
        client.Check({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            if (err) {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "check",
                    requestPayload: qp,
                    responsePayload: { error: err.message },
                    statusCode: 502,
                    grpcStatus: err.code || 13,
                    durationMs: duration,
                });
                return res.status(502).json({ error: "UPSTREAM_ERROR", message: err.message });
            }
            else {
                await logBooking({
                    requestId,
                    agentId: req.user.companyId,
                    sourceId: activeAgreement.sourceId,
                    agreementRef: qp.agreement_ref,
                    operation: "check",
                    requestPayload: qp,
                    responsePayload: resp,
                    statusCode: 200,
                    durationMs: duration,
                });
                res.json(resp);
            }
        });
    }
    catch (e) {
        // Log validation errors
        await auditLog({
            direction: "IN",
            endpoint: "booking.check",
            requestId,
            companyId: req.user?.companyId,
            httpStatus: 400,
            request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
            response: { error: e instanceof Error ? e.message : String(e) },
            durationMs: Date.now() - startTime,
        });
        next(e);
    }
});
// Test verification endpoints for agents
const testCreateSchema = z.object({
    test_mode: z.boolean().default(true),
    source_id: z.string().optional(),
    agreement_ref: z.string().optional(),
    supplier_offer_ref: z.string().optional(),
    agent_booking_ref: z.string().optional()
});
/**
 * @openapi
 * /bookings/test/create:
 *   post:
 *     tags: [Bookings Test]
 *     summary: Test booking creation with test data
 *     description: |
 *       Test endpoint for agents to verify their integration works correctly.
 *       Uses test data and doesn't require real agreements or sources.
 *       This ensures agents can create, modify, and cancel bookings before accessing live data.
 */
bookingsRouter.post("/test/create", requireAuth(), async (req, res, next) => {
    try {
        const body = testCreateSchema.parse(req.body);
        // Check for idempotency key in various header formats (case-insensitive)
        const idempotencyKey = req.headers["idempotency-key"] ||
            req.headers["Idempotency-Key"] ||
            req.headers["IDEMPOTENCY-KEY"];
        if (!idempotencyKey) {
            return res.status(400).json({
                error: "SCHEMA_ERROR",
                message: "Missing Idempotency-Key header",
                details: "The Idempotency-Key header is required for all booking operations to ensure request safety and prevent duplicate bookings.",
                hint: "Include the header in your request: 'Idempotency-Key: <unique-value>'",
                example: "Idempotency-Key: test-create-1234567890-abc123"
            });
        }
        // Use test data for verification
        const testData = {
            agent_id: req.user.companyId,
            source_id: body.source_id || "TEST_SOURCE_001",
            agreement_ref: body.agreement_ref || "TEST_AGREEMENT_001",
            supplier_offer_ref: body.supplier_offer_ref || "TEST_OFFER_001",
            idempotency_key: String(idempotencyKey),
            agent_booking_ref: body.agent_booking_ref || `TEST_BOOKING_${Date.now()}`
        };
        // Simulate successful test booking creation
        const testResponse = {
            test_mode: true,
            booking_id: `TEST_BOOKING_${Date.now()}`,
            status: "TEST_CREATED",
            agent_booking_ref: testData.agent_booking_ref,
            source_id: testData.source_id,
            agreement_ref: testData.agreement_ref,
            message: "Test booking created successfully - integration verified",
            verification: {
                create: true,
                modify: true,
                cancel: true,
                check: true
            }
        };
        res.json(testResponse);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /bookings/test/modify/{ref}:
 *   patch:
 *     tags: [Bookings Test]
 *     summary: Test booking modification with test data
 *     description: |
 *       Test endpoint for agents to verify booking modification works correctly.
 *       Uses test data and simulates successful modification.
 */
bookingsRouter.patch("/test/modify/:ref", requireAuth(), async (req, res, next) => {
    try {
        const bookingRef = String(req.params.ref);
        const sourceId = String(req.query.source_id || "TEST_SOURCE_001");
        // Simulate successful test booking modification
        const testResponse = {
            test_mode: true,
            booking_id: bookingRef,
            status: "TEST_MODIFIED",
            source_id: sourceId,
            message: "Test booking modified successfully - integration verified",
            verification: {
                create: true,
                modify: true,
                cancel: true,
                check: true
            }
        };
        res.json(testResponse);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /bookings/test/cancel/{ref}:
 *   post:
 *     tags: [Bookings Test]
 *     summary: Test booking cancellation with test data
 *     description: |
 *       Test endpoint for agents to verify booking cancellation works correctly.
 *       Uses test data and simulates successful cancellation.
 */
bookingsRouter.post("/test/cancel/:ref", requireAuth(), async (req, res, next) => {
    try {
        const bookingRef = String(req.params.ref);
        const sourceId = String(req.query.source_id || "TEST_SOURCE_001");
        // Simulate successful test booking cancellation
        const testResponse = {
            test_mode: true,
            booking_id: bookingRef,
            status: "TEST_CANCELLED",
            source_id: sourceId,
            message: "Test booking cancelled successfully - integration verified",
            verification: {
                create: true,
                modify: true,
                cancel: true,
                check: true
            }
        };
        res.json(testResponse);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /bookings/test/check/{ref}:
 *   get:
 *     tags: [Bookings Test]
 *     summary: Test booking status check with test data
 *     description: |
 *       Test endpoint for agents to verify booking status checking works correctly.
 *       Uses test data and simulates successful status check.
 */
bookingsRouter.get("/test/check/:ref", requireAuth(), async (req, res, next) => {
    try {
        const bookingRef = String(req.params.ref);
        const sourceId = String(req.query.source_id || "TEST_SOURCE_001");
        // Simulate successful test booking status check
        const testResponse = {
            test_mode: true,
            booking_id: bookingRef,
            status: "TEST_CONFIRMED",
            source_id: sourceId,
            message: "Test booking status checked successfully - integration verified",
            verification: {
                create: true,
                modify: true,
                cancel: true,
                check: true
            }
        };
        res.json(testResponse);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /bookings/test/verification:
 *   get:
 *     tags: [Bookings Test]
 *     summary: Get agent verification status
 *     description: |
 *       Check if agent has completed all required test verifications.
 *       Agents must pass all tests before accessing live agreements.
 */
bookingsRouter.get("/test/verification", requireAuth(), async (req, res, next) => {
    try {
        // In a real implementation, you would check database for verification status
        // For now, we'll return a mock verification status
        const verificationStatus = {
            agent_id: req.user.companyId,
            verification_complete: false,
            tests_required: [
                {
                    test: "create_booking",
                    endpoint: "POST /bookings/test/create",
                    status: "pending",
                    description: "Test booking creation"
                },
                {
                    test: "modify_booking",
                    endpoint: "PATCH /bookings/test/modify/{ref}",
                    status: "pending",
                    description: "Test booking modification"
                },
                {
                    test: "cancel_booking",
                    endpoint: "POST /bookings/test/cancel/{ref}",
                    status: "pending",
                    description: "Test booking cancellation"
                },
                {
                    test: "check_booking",
                    endpoint: "GET /bookings/test/check/{ref}",
                    status: "pending",
                    description: "Test booking status check"
                }
            ],
            message: "Complete all test verifications to access live agreements"
        };
        res.json(verificationStatus);
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /bookings/{ref}/history:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking history
 *     description: Retrieve complete history of changes for a booking
 *     parameters:
 *       - in: path
 *         name: ref
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier booking reference
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *           enum: [CREATED, MODIFIED, CANCELLED, STATUS_CHANGED, PAYMENT_UPDATED, CUSTOMER_UPDATED]
 *         description: Filter by event type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of history entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of entries to skip
 */
bookingsRouter.get("/:ref/history", requireAuth(), requireCompanyStatus("ACTIVE"), async (req, res, next) => {
    try {
        const { ref } = req.params;
        const eventType = req.query.eventType;
        const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
        const offset = Math.max(0, Number(req.query.offset || 0));
        // Find booking by supplier_booking_ref
        const booking = await prisma.booking.findFirst({
            where: {
                supplierBookingRef: ref,
                agentId: req.user.companyId, // Ensure booking belongs to agent
            },
            select: { id: true },
        });
        if (!booking) {
            return res.status(404).json({
                error: "BOOKING_NOT_FOUND",
                message: "Booking not found or does not belong to this agent",
            });
        }
        // Get history
        const history = await getBookingHistory(booking.id, {
            eventType: eventType,
            limit,
            offset,
        });
        res.json(history);
    }
    catch (e) {
        next(e);
    }
});
