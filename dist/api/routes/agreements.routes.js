import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType, requireRole } from "../../infra/policies.js";
import { agreementClient } from "../../grpc/clients/agreement.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { notifyAgreementDrafted, notifyAgreementOffered, notifyAgreementAccepted, notifyAgreementStatus } from "../../services/notifications.js";
import { auditLog } from "../../services/audit.js";
export const agreementsRouter = Router();
// Helper function to convert snake_case to camelCase for agreement responses
function toAgreementCamelCase(ag) {
    return {
        id: ag.id,
        agentId: ag.agent_id,
        sourceId: ag.source_id,
        agreementRef: ag.agreement_ref,
        status: ag.status,
        validFrom: ag.valid_from,
        validTo: ag.valid_to,
        createdAt: ag.createdAt,
        updatedAt: ag.updatedAt,
        agent: ag.agent,
        source: ag.source,
    };
}
// Duplicate agreement check (GET - query params)
agreementsRouter.get("/agreements/check-duplicate", requireAuth(), async (req, res, next) => {
    try {
        const source_id = String(req.query.source_id || "").trim();
        const agent_id = String(req.query.agent_id || "").trim();
        const agreement_ref = String(req.query.agreement_ref || "").trim();
        if (!source_id || !agent_id || !agreement_ref) {
            return res.status(400).json({ error: "BAD_REQUEST", message: "source_id, agent_id, agreement_ref are required" });
        }
        const existing = await prisma.agreement.findFirst({
            where: { sourceId: source_id, agentId: agent_id, agreementRef: agreement_ref },
            select: { id: true },
        });
        if (existing)
            return res.json({ duplicate: true, existingAgreementId: existing.id });
        return res.json({ duplicate: false });
    }
    catch (e) {
        next(e);
    }
});
// Duplicate agreement check (POST - body)
agreementsRouter.post("/agreements/check-duplicate", requireAuth(), async (req, res, next) => {
    try {
        const { sourceId, agentId, agreementRef } = req.body;
        const source_id = String(sourceId || "").trim();
        const agent_id = String(agentId || "").trim();
        const agreement_ref = String(agreementRef || "").trim();
        if (!source_id || !agent_id || !agreement_ref) {
            return res.status(400).json({ error: "BAD_REQUEST", message: "sourceId, agentId, agreementRef are required in body" });
        }
        const existing = await prisma.agreement.findFirst({
            where: { sourceId: source_id, agentId: agent_id, agreementRef: agreement_ref },
            select: { id: true },
        });
        if (existing)
            return res.json({ duplicate: true, existingId: existing.id });
        return res.json({ duplicate: false });
    }
    catch (e) {
        next(e);
    }
});
const draftSchema = z.object({
    agent_id: z.string(),
    source_id: z.string(),
    agreement_ref: z.string().min(2),
    valid_from: z.string().optional(),
    valid_to: z.string().optional(),
});
/**
 * @openapi
 * /agreements:
 *   post:
 *     tags: [Agreements]
 *     summary: Source creates draft agreement targeting an Agent
 */
agreementsRouter.post("/agreements", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const body = draftSchema.parse(req.body);
        // Guard: source can only create for itself
        // Debug log removed
        if (body.source_id !== req.user.companyId) {
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Can only create agreements for your own source company",
            });
        }
        // Optional: validate both companies exist (and types) to avoid opaque gRPC errors
        const wantAgentId = String(body.agent_id || "").trim();
        const wantSourceId = String(body.source_id || "").trim();
        const [agent, source] = await Promise.all([
            prisma.company.findFirst({
                where: { id: wantAgentId },
                select: { id: true, type: true, status: true },
            }),
            prisma.company.findFirst({
                where: { id: wantSourceId },
                select: { id: true, type: true, status: true },
            }),
        ]);
        if (!agent ||
            !source ||
            agent.type !== "AGENT" ||
            source.type !== "SOURCE" ||
            agent.status !== "ACTIVE" ||
            source.status !== "ACTIVE") {
            return res.status(400).json({
                error: "SCHEMA_ERROR",
                message: "Invalid agent_id or source_id - companies must exist, have correct types, and be ACTIVE",
                details: {
                    agent_id: wantAgentId,
                    agentFound: !!agent,
                    agentType: agent?.type || "",
                    agentStatus: agent?.status || "",
                    source_id: wantSourceId,
                    sourceFound: !!source,
                    sourceType: source?.type || "",
                    sourceStatus: source?.status || "",
                },
            });
        }
        // Check for duplicate agreement reference before creating
        const existing = await prisma.agreement.findFirst({
            where: {
                sourceId: body.source_id,
                agentId: body.agent_id,
                agreementRef: body.agreement_ref
            },
            select: { id: true, status: true },
        });
        const warnings = [];
        if (existing) {
            warnings.push(`Duplicate agreement reference detected: "${body.agreement_ref}" already exists for this agent/source pair (existing agreement ID: ${existing.id}, status: ${existing.status}).`);
        }
        const startTime = Date.now();
        const requestId = req.requestId;
        const client = agreementClient();
        client.CreateDraft(body, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            if (err) {
                await auditLog({
                    direction: "IN",
                    endpoint: "agreements.create",
                    requestId,
                    companyId: body.source_id,
                    sourceId: body.source_id,
                    agreementRef: body.agreement_ref,
                    grpcStatus: err.code || 13,
                    request: body,
                    response: { error: err.message },
                    durationMs: duration,
                });
                if (err.code === 3) {
                    return res.status(400).json({
                        error: "INVALID_ARGUMENT",
                        message: err.message || "Invalid agent or source",
                        agent_id: body.agent_id,
                        source_id: body.source_id,
                        requestId,
                    });
                }
                if (err.code === 6) {
                    return res.status(409).json({
                        error: "CONFLICT",
                        message: err.message || "Agreement already exists",
                        agent_id: body.agent_id,
                        source_id: body.source_id,
                        agreement_ref: body.agreement_ref,
                        requestId,
                    });
                }
                return next(err);
            }
            // Log successful agreement creation
            await auditLog({
                direction: "IN",
                endpoint: "agreements.create",
                requestId,
                companyId: body.source_id,
                sourceId: body.source_id,
                agreementRef: body.agreement_ref,
                httpStatus: 200,
                request: body,
                response: resp,
                durationMs: duration,
            });
            // Send email notification for draft creation
            try {
                await notifyAgreementDrafted(resp.id);
            }
            catch (emailErr) {
                console.error("Failed to send draft notification:", emailErr);
                // Don't fail the request if email fails
            }
            // Include warnings in response if duplicate detected
            const response = toAgreementCamelCase(resp);
            if (warnings.length > 0) {
                response.warnings = warnings;
            }
            res.json(response);
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/all:
 *   get:
 *     tags: [Agreements]
 *     summary: Get all agents with their agreements (for sources and admins)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter agreements by status
 *       - in: query
 *         name: agent_id
 *         schema: { type: string }
 *         description: Filter by specific agent ID
 *       - in: query
 *         name: source_id
 *         schema: { type: string }
 *         description: Filter by specific source ID
 */
agreementsRouter.get("/agreements/all", requireAuth(), async (req, res, next) => {
    try {
        const status = req.query.status ? String(req.query.status) : "ACTIVE";
        // If user is a SOURCE, filter agreements by sourceId
        // If user is ADMIN, show all agents
        // If user is AGENT, show only their own agreements
        let where = {
            type: "AGENT",
            status: status
        };
        // For sources, only show agents that have agreements with this source
        let agentAgreementsFilter = {};
        if (req.user.type === "SOURCE" || req.user.role === "ADMIN") {
            // Show all agents, but filter agreements if source
            if (req.user.type === "SOURCE" && req.user.companyId) {
                agentAgreementsFilter = {
                    sourceId: req.user.companyId
                };
            }
        }
        else if (req.user.type === "AGENT") {
            // Agents should use /agreements/offers endpoint instead
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Agents should use /agreements/offers endpoint"
            });
        }
        // Get all agent companies with their agreements
        const agents = await prisma.company.findMany({
            where,
            select: {
                id: true,
                companyName: true,
                email: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                adapterType: true,
                grpcEndpoint: true,
                // Include user count and agreements for each agent
                _count: {
                    select: {
                        users: true,
                        agentAgreements: true
                    }
                },
                // Include actual agreements with their IDs (filtered by source if applicable)
                agentAgreements: {
                    where: agentAgreementsFilter,
                    select: {
                        id: true,
                        agreementRef: true,
                        status: true,
                        validFrom: true,
                        validTo: true,
                        sourceId: true,
                        source: {
                            select: {
                                id: true,
                                companyName: true,
                                status: true
                            }
                        }
                    },
                    orderBy: { createdAt: "desc" }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        res.json({
            items: agents,
            total: agents.length,
            filters: {
                status: status,
                type: "AGENT"
            }
        });
    }
    catch (e) {
        // Handle database errors
        if (e?.code && e.code.startsWith('P')) {
            return res.status(500).json({
                error: "DATABASE_ERROR",
                message: "Database query failed",
                code: e.code
            });
        }
        // Handle MySQL authentication errors
        if (e?.message && e.message.includes('Access denied')) {
            return res.status(503).json({
                error: "DATABASE_AUTH_ERROR",
                message: "Database authentication failed. Please check your DATABASE_URL in .env file."
            });
        }
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}:
 *   get:
 *     tags: [Agreements]
 *     summary: Get agreement details by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agreement details
 *       404:
 *         description: Agreement not found
 */
agreementsRouter.get("/agreements/:id", requireAuth(), async (req, res, next) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) {
            return res.status(400).json({ error: "BAD_REQUEST", message: "Agreement ID is required" });
        }
        // Check if agreement exists and user has access
        const agreement = await prisma.agreement.findUnique({
            where: { id },
            include: {
                agent: {
                    select: {
                        id: true,
                        companyName: true,
                        email: true,
                        type: true,
                        status: true,
                        companyCode: true,
                    },
                },
                source: {
                    select: {
                        id: true,
                        companyName: true,
                        email: true,
                        type: true,
                        status: true,
                        companyCode: true,
                    },
                },
            },
        });
        if (!agreement) {
            return res.status(404).json({ error: "NOT_FOUND", message: "Agreement not found" });
        }
        // Check access: user must be admin, or the agreement's agent, or the agreement's source
        const hasAccess = req.user.role === "ADMIN" ||
            agreement.agentId === req.user.companyId ||
            agreement.sourceId === req.user.companyId;
        if (!hasAccess) {
            return res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
        }
        res.json(toAgreementCamelCase(agreement));
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/offer:
 *   post:
 *     tags: [Agreements]
 *     summary: Source offers a draft agreement
 */
agreementsRouter.post("/agreements/:id/offer", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const startTime = Date.now();
        const requestId = req.requestId;
        // Get agreement details for logging
        const agreement = await prisma.agreement.findUnique({
            where: { id: req.params.id },
            select: { id: true, agentId: true, sourceId: true, agreementRef: true }
        });
        const client = agreementClient();
        client.Offer({ agreement_id: req.params.id }, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            // Log agreement offer
            await auditLog({
                direction: "IN",
                endpoint: "agreements.offer",
                requestId,
                companyId: req.user.companyId,
                sourceId: agreement?.sourceId || req.user.companyId,
                agreementRef: agreement?.agreementRef,
                httpStatus: err ? 500 : 200,
                grpcStatus: err?.code,
                request: { agreement_id: req.params.id },
                response: err ? { error: err.message } : resp,
                durationMs: duration,
            });
            if (err)
                return next(err);
            // Send email notification for offer
            try {
                await notifyAgreementOffered(req.params.id);
            }
            catch (emailErr) {
                console.error("Failed to send offer notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/accept:
 *   post:
 *     tags: [Agreements]
 *     summary: Agent accepts an offered agreement
 */
agreementsRouter.post("/agreements/:id/accept", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const startTime = Date.now();
        const requestId = req.requestId;
        // Get agreement details for logging
        const agreement = await prisma.agreement.findUnique({
            where: { id: req.params.id },
            select: { id: true, agentId: true, sourceId: true, agreementRef: true }
        });
        const client = agreementClient();
        client.Accept({ agreement_id: req.params.id }, metaFromReq(req), async (err, resp) => {
            const duration = Date.now() - startTime;
            // Log agreement acceptance
            await auditLog({
                direction: "IN",
                endpoint: "agreements.accept",
                requestId,
                companyId: req.user.companyId,
                sourceId: agreement?.sourceId,
                agreementRef: agreement?.agreementRef,
                httpStatus: err ? 500 : 200,
                grpcStatus: err?.code,
                request: { agreement_id: req.params.id },
                response: err ? { error: err.message } : resp,
                durationMs: duration,
            });
            if (err)
                return next(err);
            // Send email notification for acceptance
            try {
                await notifyAgreementAccepted(req.params.id);
            }
            catch (emailErr) {
                console.error("Failed to send acceptance notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/activate:
 *   post:
 *     tags: [Agreements]
 *     summary: Activate an agreement (set status to ACTIVE)
 */
agreementsRouter.post("/agreements/:id/activate", requireAuth(), async (req, res, next) => {
    // Debug log removed
    try {
        const client = agreementClient();
        client.SetStatus({ agreement_id: req.params.id, status: "ACTIVE" }, metaFromReq(req), async (err, resp) => {
            if (err)
                return next(err);
            // Send email notification for status change
            try {
                await notifyAgreementStatus(req.params.id, "ACTIVE");
            }
            catch (emailErr) {
                console.error("Failed to send status notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/suspend:
 *   post:
 *     tags: [Agreements]
 *     summary: Suspend an agreement (set status to SUSPENDED)
 */
agreementsRouter.post("/agreements/:id/suspend", requireAuth(), requireRole("ADMIN", "SOURCE_USER"), async (req, res, next) => {
    try {
        const client = agreementClient();
        client.SetStatus({ agreement_id: req.params.id, status: "SUSPENDED" }, metaFromReq(req), async (err, resp) => {
            if (err)
                return next(err);
            // Send email notification for status change
            try {
                await notifyAgreementStatus(req.params.id, "SUSPENDED");
            }
            catch (emailErr) {
                console.error("Failed to send status notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/expire:
 *   post:
 *     tags: [Agreements]
 *     summary: Expire an agreement (set status to EXPIRED)
 */
agreementsRouter.post("/agreements/:id/expire", requireAuth(), requireRole("ADMIN", "SOURCE_USER"), async (req, res, next) => {
    try {
        const client = agreementClient();
        client.SetStatus({ agreement_id: req.params.id, status: "EXPIRED" }, metaFromReq(req), async (err, resp) => {
            if (err)
                return next(err);
            // Send email notification for status change
            try {
                await notifyAgreementStatus(req.params.id, "EXPIRED");
            }
            catch (emailErr) {
                console.error("Failed to send status notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/{id}/{action}:
 *   post:
 *     tags: [Agreements]
 *     summary: Set status (ACTIVE|SUSPENDED|EXPIRED) - generic endpoint
 */
agreementsRouter.post("/agreements/:id/:action", requireAuth(), requireRole("ADMIN", "SOURCE_USER"), async (req, res, next) => {
    try {
        const status = String(req.params.action || "").toUpperCase();
        const allowedStatuses = ["ACTIVE", "SUSPENDED", "EXPIRED"];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error: "INVALID_STATUS",
                message: `Status must be one of: ${allowedStatuses.join(", ")}`,
            });
        }
        const client = agreementClient();
        client.SetStatus({ agreement_id: req.params.id, status }, metaFromReq(req), async (err, resp) => {
            if (err)
                return next(err);
            // Send email notification for status change
            try {
                await notifyAgreementStatus(req.params.id, status);
            }
            catch (emailErr) {
                console.error("Failed to send status notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements:
 *   get:
 *     tags: [Agreements]
 *     summary: List agreements by scope
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [agent, source] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 */
agreementsRouter.get("/agreements", requireAuth(), async (req, res, next) => {
    console.log("This is the agreements router");
    try {
        const scope = req.query.scope ? String(req.query.scope) : "";
        const status = req.query.status ? String(req.query.status) : "";
        // If no scope is specified and user is ADMIN, show all agreements
        if (!scope && req.user.role === "ADMIN") {
            const where = {};
            if (status)
                where.status = status;
            const agreements = await prisma.agreement.findMany({
                where,
                include: {
                    agent: {
                        select: {
                            id: true,
                            companyName: true,
                            type: true,
                            status: true,
                            email: true
                        }
                    },
                    source: {
                        select: {
                            id: true,
                            companyName: true,
                            type: true,
                            status: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: "desc" }
            });
            return res.json({
                items: agreements,
                total: agreements.length,
                scope: "all",
                status: status || "all"
            });
        }
        // Default behavior for non-admin users or when scope is specified
        const defaultScope = scope || "agent";
        const client = agreementClient();
        if (defaultScope === "source") {
            client.ListBySource({ source_id: req.user.companyId, status }, metaFromReq(req), (err, resp) => {
                if (err) {
                    // Handle gRPC errors
                    const errorMessage = err.message || String(err);
                    // Check for database configuration errors
                    if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('Environment variable not found')) {
                        return res.status(503).json({
                            error: "DATABASE_CONFIG_ERROR",
                            message: "Database configuration error: DATABASE_URL not found. Please check your .env file and restart the server.",
                            hint: "Format: mysql://username:password@host:port/database_name",
                            solution: "1. Check your .env file has correct DATABASE_URL\n2. Restart the server: npm run dev\n3. Verify connection: npm run test:db",
                            requestId: req.requestId
                        });
                    }
                    // Check for database authentication errors
                    if (errorMessage.includes('Access denied')) {
                        return res.status(503).json({
                            error: "DATABASE_AUTH_ERROR",
                            message: "Database authentication failed. Please check your DATABASE_URL in .env file and restart the server.",
                            requestId: req.requestId
                        });
                    }
                    // Generic gRPC error
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: errorMessage,
                        code: err.code || 13,
                        requestId: req.requestId
                    });
                }
                res.json({ items: resp.items.map(toAgreementCamelCase), total: resp.items.length });
            });
        }
        else {
            // Debug logging for agent agreements
            client.ListByAgent({ agent_id: req.user.companyId, status }, metaFromReq(req), (err, resp) => {
                if (err) {
                    // Handle gRPC errors
                    const errorMessage = err.message || String(err);
                    // Check for database configuration errors
                    if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('Environment variable not found')) {
                        return res.status(503).json({
                            error: "DATABASE_CONFIG_ERROR",
                            message: "Database configuration error: DATABASE_URL not found. Please check your .env file and restart the server.",
                            hint: "Format: mysql://username:password@host:port/database_name",
                            solution: "1. Check your .env file has correct DATABASE_URL\n2. Restart the server: npm run dev\n3. Verify connection: npm run test:db",
                            requestId: req.requestId
                        });
                    }
                    // Check for database authentication errors
                    if (errorMessage.includes('Access denied')) {
                        return res.status(503).json({
                            error: "DATABASE_AUTH_ERROR",
                            message: "Database authentication failed. Please check your DATABASE_URL in .env file and restart the server.",
                            requestId: req.requestId
                        });
                    }
                    // Generic gRPC error
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: errorMessage,
                        code: err.code || 13,
                        requestId: req.requestId
                    });
                }
                res.json({ items: resp.items.map(toAgreementCamelCase), total: resp.items.length });
            });
        }
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/offers:
 *   get:
 *     tags: [Agreements]
 *     summary: Agent gets all offers from sources
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 */
agreementsRouter.get("/agreements/offers", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const status = req.query.status ? String(req.query.status) : "";
        // Debug logging
        console.log('🔍 Agent Offers Debug:');
        console.log(`- User companyId: ${req.user.companyId}`);
        console.log(`- Status filter: ${status}`);
        console.log(`- User type: ${req.user.type}`);
        const client = agreementClient();
        client.ListByAgent({ agent_id: req.user.companyId, status }, metaFromReq(req), (err, resp) => {
            if (err) {
                console.log('❌ gRPC Error:', err);
                return next(err);
            }
            console.log('✅ gRPC Response:', resp);
            res.json({ items: resp.items.map(toAgreementCamelCase), total: resp.items.length });
        });
    }
    catch (e) {
        console.log('❌ Route Error:', e);
        next(e);
    }
});
/**
 * @openapi
 * /agreements/agents:
 *   get:
 *     tags: [Agreements]
 *     summary: Source gets all available agents
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PENDING_VERIFICATION] }
 *         description: Filter agents by status
 */
agreementsRouter.get("/agreements/agents", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const status = req.query.status ? String(req.query.status) : "ACTIVE";
        // Get all agent companies
        const agents = await prisma.company.findMany({
            where: {
                type: "AGENT",
                status: status
            },
            select: {
                id: true,
                companyName: true,
                email: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                // Include user count for each agent
                _count: {
                    select: { users: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        res.json({
            items: agents,
            total: agents.length,
            status: status
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/offers:
 *   post:
 *     tags: [Agreements]
 *     summary: Source offers an agreement to an agent
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agent_id, agreement_ref]
 *             properties:
 *               agent_id:
 *                 type: string
 *                 description: Target agent company ID
 *               agreement_ref:
 *                 type: string
 *                 description: Agreement reference
 *               valid_from:
 *                 type: string
 *                 format: date-time
 *                 description: Agreement valid from date
 *               valid_to:
 *                 type: string
 *                 format: date-time
 *                 description: Agreement valid to date
 */
agreementsRouter.post("/agreements/offers", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const offerSchema = z.object({
            agent_id: z.string(),
            agreement_ref: z.string().min(2),
            valid_from: z.string().optional(),
            valid_to: z.string().optional(),
        });
        const body = offerSchema.parse(req.body);
        // Validate agent exists and is correct type
        const agent = await prisma.company.findFirst({
            where: { id: body.agent_id },
            select: { id: true, type: true, status: true },
        });
        if (!agent || agent.type !== "AGENT" || agent.status !== "ACTIVE") {
            return res.status(400).json({
                error: "INVALID_AGENT",
                message: "Invalid or inactive agent",
                details: {
                    agent_id: body.agent_id,
                    agentFound: !!agent,
                    agentType: agent?.type || "",
                    agentStatus: agent?.status || "",
                },
            });
        }
        const client = agreementClient();
        client.CreateDraft({
            agent_id: body.agent_id,
            source_id: req.user.companyId,
            agreement_ref: body.agreement_ref,
            valid_from: body.valid_from,
            valid_to: body.valid_to,
        }, metaFromReq(req), async (err, resp) => {
            if (err) {
                if (err.code === 3) {
                    return res.status(400).json({
                        error: "INVALID_ARGUMENT",
                        message: err.message || "Invalid agent or source",
                        agent_id: body.agent_id,
                        source_id: req.user.companyId,
                        requestId: req.requestId,
                    });
                }
                return next(err);
            }
            // Send email notification for draft creation
            try {
                await notifyAgreementDrafted(resp.id);
            }
            catch (emailErr) {
                console.error("Failed to send draft notification:", emailErr);
                // Don't fail the request if email fails
            }
            res.json(toAgreementCamelCase(resp));
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/notifications:
 *   get:
 *     tags: [Agreements]
 *     summary: Get agent notifications
 *     description: Retrieve notifications for the authenticated agent company
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of notifications to return
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return only unread notifications
 *     responses:
 *       200:
 *         description: List of notifications
 */
agreementsRouter.get("/agreements/notifications", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
        const unreadOnly = req.query.unreadOnly === 'true';
        const notifications = [];
        // 1. Get new agreement offers
        const offeredAgreements = await prisma.agreement.findMany({
            where: {
                agentId: companyId,
                status: 'OFFERED',
            },
            include: {
                source: {
                    select: {
                        companyName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
        offeredAgreements.forEach(agreement => {
            notifications.push({
                id: `agreement-offered-${agreement.id}`,
                type: 'agreement',
                title: 'New agreement offer',
                message: `${agreement.source.companyName} has offered you an agreement: ${agreement.agreementRef}`,
                timestamp: agreement.createdAt.toISOString(),
                read: false,
                actionUrl: '/agreements',
            });
        });
        // 2. Get database notifications for this company
        const dbNotifications = await prisma.notification.findMany({
            where: {
                companyId: companyId,
                ...(unreadOnly && { readAt: null }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        dbNotifications.forEach(notif => {
            let frontendType = 'system';
            if (notif.type.includes('AGREEMENT')) {
                frontendType = 'agreement';
            }
            else if (notif.type.includes('HEALTH')) {
                frontendType = 'health';
            }
            else if (notif.type.includes('COMPANY')) {
                frontendType = 'company';
            }
            notifications.push({
                id: notif.id,
                type: frontendType,
                title: notif.title,
                message: notif.message,
                timestamp: notif.createdAt.toISOString(),
                read: !!notif.readAt,
                actionUrl: frontendType === 'agreement' ? '/agreements' : '/agent',
            });
        });
        // Sort by timestamp (newest first) and limit
        const sortedNotifications = notifications
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
        res.json({
            items: sortedNotifications,
            total: sortedNotifications.length,
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /agreements/notifications/{id}/read:
 *   post:
 *     tags: [Agreements]
 *     summary: Mark agent notification as read
 *     security:
 *       - bearerAuth: []
 */
agreementsRouter.post("/agreements/notifications/:id/read", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        // If it's a database notification, update it
        if (id.startsWith('cl')) {
            await prisma.notification.updateMany({
                where: {
                    id,
                    companyId: companyId, // Ensure it belongs to this company
                },
                data: { readAt: new Date() },
            });
        }
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
