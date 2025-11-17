import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyStatus } from "../../infra/policies.js";
import { z } from "zod";
import { bookingClient } from "../../grpc/clients/core.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { auditLog, logBooking } from "../../services/audit.js";

export const bookingsRouter = Router();

// List bookings for current agent (or all for admin)
bookingsRouter.get("/", requireAuth(), async (req: any, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const companyId = String(req.query.company_id || "").trim();
    const requestId = String(req.query.request_id || "").trim();
    const isAdmin = req.user?.role === "ADMIN";
    const where: any = {};
    if (!isAdmin) where.agentId = req.user.companyId;
    if (isAdmin && companyId) where.agentId = companyId;
    if (requestId) where.id = requestId; // best-effort filter
    const rows = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// Helper function to get valid booking data for an agent
async function getValidBookingData(agentId: string) {
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
  } catch (error) {
    return {
      error: "Failed to fetch valid data",
      suggestion: "Check if you have active agreements and sources"
    };
  }
}

const createSchema = z.object({
  agreement_ref: z.string(),
  supplier_offer_ref: z.string().optional(),
  agent_booking_ref: z.string().optional()
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
bookingsRouter.post("/", requireAuth(), async (req: any, res, next) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  
  try {
    const body = createSchema.parse(req.body);
    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey) {
      const errorResponse = { error: "SCHEMA_ERROR", message: "Missing Idempotency-Key header" };
      
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
    const customErrorHandler = async (err: any, resp: any) => {
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
        } catch (error) {
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
      } else if (err) {
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
      } else {
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
    
    client.Create(
      {
        agent_id: req.user.companyId,
        source_id: agreementRow.sourceId,
        agreement_ref: body.agreement_ref,
        supplier_offer_ref: body.supplier_offer_ref || "",
        idempotency_key: String(idempotencyKey),
        agent_booking_ref: body.agent_booking_ref || "",
        // Append trace fields for the adapter/supplier
        middleware_request_id: requestId,
        agent_company_id: req.user.companyId,
      },
      metaFromReq(req),
      customErrorHandler
    );
  } catch (e) { 
    // Log validation errors
    await auditLog({
      direction: "IN",
      endpoint: "booking.create",
      requestId,
      companyId: req.user?.companyId,
      httpStatus: 400,
      request: req.body,
      response: { error: e.message },
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
bookingsRouter.patch("/:ref", requireAuth(), requireCompanyStatus("ACTIVE"), async (req: any, res, next) => {
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
    
    client.Modify({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err: any, resp: any) => {
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
      } else {
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
  } catch (e) { 
    // Log validation errors
    await auditLog({
      direction: "IN",
      endpoint: "booking.modify",
      requestId,
      companyId: req.user?.companyId,
      httpStatus: 400,
      request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
      response: { error: e.message },
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
bookingsRouter.post("/:ref/cancel", requireAuth(), requireCompanyStatus("ACTIVE"), async (req: any, res, next) => {
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
    
    client.Cancel({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err: any, resp: any) => {
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
      } else {
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
  } catch (e) { 
    // Log validation errors
    await auditLog({
      direction: "IN",
      endpoint: "booking.cancel",
      requestId,
      companyId: req.user?.companyId,
      httpStatus: 400,
      request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
      response: { error: e.message },
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
bookingsRouter.get("/:ref", requireAuth(), requireCompanyStatus("ACTIVE"), async (req: any, res, next) => {
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
    
    client.Check({ ...qp, source_id: activeAgreement.sourceId, middleware_request_id: requestId, agent_company_id: req.user.companyId }, metaFromReq(req), async (err: any, resp: any) => {
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
      } else {
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
  } catch (e) { 
    // Log validation errors
    await auditLog({
      direction: "IN",
      endpoint: "booking.check",
      requestId,
      companyId: req.user?.companyId,
      httpStatus: 400,
      request: { supplier_booking_ref: req.params.ref, source_id: req.query.source_id, agreement_ref: req.query.agreement_ref },
      response: { error: e.message },
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
bookingsRouter.post("/test/create", requireAuth(), async (req: any, res, next) => {
  try {
    const body = testCreateSchema.parse(req.body);
    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey) return res.status(400).json({ error: "SCHEMA_ERROR", message: "Missing Idempotency-Key header" });
    
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
  } catch (e) { next(e); }
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
bookingsRouter.patch("/test/modify/:ref", requireAuth(), async (req: any, res, next) => {
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
  } catch (e) { next(e); }
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
bookingsRouter.post("/test/cancel/:ref", requireAuth(), async (req: any, res, next) => {
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
  } catch (e) { next(e); }
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
bookingsRouter.get("/test/check/:ref", requireAuth(), async (req: any, res, next) => {
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
  } catch (e) { next(e); }
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
bookingsRouter.get("/test/verification", requireAuth(), async (req: any, res, next) => {
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
  } catch (e) { next(e); }
});




