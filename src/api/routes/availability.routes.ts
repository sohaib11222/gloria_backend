import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyStatus } from "../../infra/policies.js";
import { z } from "zod";
import { availabilityClient } from "../../grpc/clients/core.js";
import { metaFromReq } from "../../grpc/meta.js";
import { auditLog } from "../../services/audit.js";
import { AvailabilityStore } from "../../services/availabilityStore.js";
import { prisma } from "../../data/prisma.js";
import { LocationsService } from "../../services/locations.js";

export const availabilityRouter = Router();

// [AUTO-AUDIT] agreement_refs required; downstream will validate ACTIVE set per agent
// For admins, agent_id and agreement_refs are optional (for testing purposes)
const submitSchema = z.object({
  pickup_unlocode: z.string(),
  dropoff_unlocode: z.string(),
  pickup_iso: z.string(),
  dropoff_iso: z.string(),
  driver_age: z.number().int().min(18).optional().default(30),
  residency_country: z.string().length(2).optional().default("US"),
  vehicle_classes: z.array(z.string()).optional().default([]),
  agreement_refs: z.array(z.string()).optional(), // Optional for admins, required for agents
  agent_id: z.string().optional(), // For admin testing - allows specifying which agent to test as
});

/**
 * @openapi
 * /availability/submit:
 *   post:
 *     tags: [Availability]
 *     summary: Submit availability search (fan-out internally)
 *     description: |
 *       Submit availability search using OTA-aligned field names:
 *       - pickup_unlocode: OTA PickupLocation (UN/LOCODE)
 *       - dropoff_unlocode: OTA DropOffLocation (UN/LOCODE)
 *       - pickup_iso: OTA PickupDateTime (ISO-8601)
 *       - dropoff_iso: OTA ReturnDateTime (ISO-8601)
 *       - driver_age: OTA DriverType/Age
 *       - residency_country: ISO-3166 alpha-2
 *       - vehicle_classes: OTA VehicleClass codes
 */
availabilityRouter.post(
  "/submit",
  requireAuth(),
  requireCompanyStatus("ACTIVE"),
  async (req: any, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    
    try {
      const body = submitSchema.parse(req.body);
      const userRole = req.user?.role;
      
      // For admins, allow specifying agent_id for testing, otherwise use their companyId
      let agent_id: string;
      if (userRole === "ADMIN" && body.agent_id) {
        // Admin testing with specific agent
        agent_id = body.agent_id;
        // Verify the agent exists and is ACTIVE
        const agent = await prisma.company.findUnique({
          where: { id: agent_id },
          select: { id: true, type: true, status: true },
        });
        if (!agent || agent.type !== "AGENT") {
          return res.status(400).json({ 
            error: "INVALID_AGENT", 
            message: "Specified agent_id is not a valid agent company" 
          });
        }
        if (agent.status !== "ACTIVE") {
          return res.status(400).json({ 
            error: "AGENT_NOT_ACTIVE", 
            message: "Specified agent must be ACTIVE" 
          });
        }
      } else if (userRole === "ADMIN") {
        // Admin testing without agent_id - find any active agent for testing
        const testAgent = await prisma.company.findFirst({
          where: { type: "AGENT", status: "ACTIVE" },
          select: { id: true },
        });
        if (!testAgent) {
          return res.status(400).json({ 
            error: "NO_ACTIVE_AGENT", 
            message: "No active agent found for testing. Please specify an agent_id or ensure at least one agent is ACTIVE." 
          });
        }
        agent_id = testAgent.id;
      } else {
        // Regular agent user - use their companyId
        agent_id = req.user.companyId as string;
      }
      
      // For admins, if agreement_refs not provided, find any agreement for the test agent
      let agreementRefs = body.agreement_refs;
      if (userRole === "ADMIN" && (!agreementRefs || agreementRefs.length === 0)) {
        const testAgreement = await prisma.agreement.findFirst({
          where: { agentId: agent_id, status: "ACCEPTED" },
          select: { agreementRef: true },
          orderBy: { createdAt: "desc" },
        });
        if (testAgreement) {
          agreementRefs = [testAgreement.agreementRef];
        } else {
          // If no agreement found, create a test agreement ref for admin testing
          // This allows admins to test availability even without real agreements
          agreementRefs = ["TEST-ADMIN"];
        }
      }
      
      // For non-admins, agreement_refs is required
      if (userRole !== "ADMIN" && (!agreementRefs || agreementRefs.length === 0)) {
        return res.status(400).json({ 
          error: "AGREEMENT_REFS_REQUIRED", 
          message: "agreement_refs is required for agent users" 
        });
      }
      
      // Update body with resolved agreement_refs for downstream processing
      body.agreement_refs = agreementRefs;
      
      // Validate locations per agreement if provided
      if (Array.isArray(body.agreement_refs) && body.agreement_refs.length > 0) {
        // Resolve agreement id by ref for this agent
        const ag = await prisma.agreement.findFirst({
          where: { agentId: agent_id, agreementRef: body.agreement_refs[0] },
          select: { id: true },
        });
        if (ag) {
          const ok = await LocationsService.validateAgreementCoverage(
            ag.id,
            body.pickup_unlocode,
            body.dropoff_unlocode
          );
          if (!ok) {
            const msg = "Location not supported under this agreement";
            await auditLog({
              direction: "IN",
              endpoint: "availability.submit",
              requestId,
              companyId: agent_id,
              httpStatus: 400,
              request: body,
              response: { error: msg },
              durationMs: Date.now() - startTime,
            });
            return res.status(400).json({ error: "AGREEMENT_LOCATION_DENIED", message: msg });
          }
        } else if (userRole !== "ADMIN") {
          // For non-admins, agreement must exist
          return res.status(400).json({ 
            error: "AGREEMENT_NOT_FOUND", 
            message: `Agreement ${body.agreement_refs[0]} not found for this agent` 
          });
        }
        // For admins, allow testing even if agreement doesn't exist (skip validation)
      }
      const client = availabilityClient();
      
      client.Submit(
        { criteria: body, agent_id, request_id: req.requestId },
        metaFromReq(req),
        async (err: any, resp: any) => {
          const duration = Date.now() - startTime;
          
          if (err) {
            // Log error
            await auditLog({
              direction: "IN",
              endpoint: "availability.submit",
              requestId,
              companyId: agent_id,
              agreementRef: Array.isArray(body.agreement_refs) ? body.agreement_refs[0] : undefined, // [AUTO-AUDIT]
              grpcStatus: err.code || 13,
              request: body,
              response: { error: err.message },
              durationMs: duration,
            });
            
            return next(err);
          } else {
            // Log success
            await auditLog({
              direction: "IN",
              endpoint: "availability.submit",
              requestId,
              companyId: agent_id,
              agreementRef: Array.isArray(body.agreement_refs) ? body.agreement_refs[0] : undefined, // [AUTO-AUDIT]
              httpStatus: 200,
              request: body,
              response: resp,
              durationMs: duration,
            });
            
            res.json(resp);
          }
        }
      );
    } catch (e) {
      // Log validation errors
      await auditLog({
        direction: "IN",
        endpoint: "availability.submit",
        requestId,
        companyId: req.user?.companyId,
        httpStatus: 400,
        request: req.body,
        response: { error: e instanceof Error ? e.message : String(e) },
        durationMs: Date.now() - startTime,
      });
      
      next(e);
    }
  }
);

/**
 * @openapi
 * /availability/poll:
 *   get:
 *     tags: [Availability]
 *     summary: Poll availability deltas
 */
availabilityRouter.get(
  "/poll",
  requireAuth(),
  requireCompanyStatus("ACTIVE"),
  async (req: any, res, next) => {
    const startTime = Date.now();
    const requestId = req.requestId;
    
    try {
      const { requestId: pollRequestId, sinceSeq = "0", waitMs = "1000" } = req.query as any;
      const client = availabilityClient();
      
      client.Poll(
        {
          request_id: String(pollRequestId),
          since_seq: Number(sinceSeq),
          wait_ms: Number(waitMs),
        },
        metaFromReq(req),
        async (err: any, resp: any) => {
          const duration = Date.now() - startTime;
          
          if (err) {
            // Log error
            await auditLog({
              direction: "IN",
              endpoint: "availability.poll",
              requestId,
              companyId: req.user.companyId,
              grpcStatus: err.code || 13,
              request: { requestId: pollRequestId, sinceSeq, waitMs },
              response: { error: err.message },
              durationMs: duration,
            });
            
            return next(err);
          } else {
            // Log success
            await auditLog({
              direction: "IN",
              endpoint: "availability.poll",
              requestId,
              companyId: req.user.companyId,
              httpStatus: 200,
              request: { requestId: pollRequestId, sinceSeq, waitMs },
              response: resp,
              durationMs: duration,
            });
            
            res.json(resp);
          }
        }
      );
    } catch (e) {
      // Log validation errors
      await auditLog({
        direction: "IN",
        endpoint: "availability.poll",
        requestId,
        companyId: req.user?.companyId,
        httpStatus: 400,
        request: req.query,
        response: { error: e instanceof Error ? e.message : String(e) },
        durationMs: Date.now() - startTime,
      });
      
      next(e);
    }
  }
);
