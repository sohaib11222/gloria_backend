import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType, requireRole } from "../../infra/policies.js";
import { agreementClient } from "../../grpc/clients/agreement.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { notifyAgreementDrafted, notifyAgreementOffered, notifyAgreementAccepted, notifyAgreementStatus } from "../../services/notifications.js";
import { auditLog } from "../../services/audit.js";
import { sourceIdsWithActiveSubscription } from "../../services/subscriptionCheck.js";
export const agreementsRouter = Router();
const prismaAny = prisma;
function externalManagedResponse(res) {
    return res.status(403).json({
        error: "EXTERNAL_MANAGED",
        message: "Agreements are managed externally. Contact the listed company by email, sign the agreement outside the platform, then use the registered account/agreement reference for operational calls.",
    });
}
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
    return externalManagedResponse(res);
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
            (agent?.type ?? "") !== "AGENT" ||
            (source?.type ?? "") !== "SOURCE" ||
            (agent?.status ?? "") !== "ACTIVE" ||
            (source?.status ?? "") !== "ACTIVE") {
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
            warnings.push(`Duplicate agreement reference detected: "${body.agreement_ref}" already exists for this agent/source pair (existing agreement ID: ${existing?.id}, status: ${existing?.status}).`);
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
        const allSourceIds = [...new Set(agents.flatMap((a) => (a.agentAgreements || []).map((ag) => ag.sourceId)))];
        const activeSourceIds = await sourceIdsWithActiveSubscription(allSourceIds);
        const agentsFiltered = agents.map((a) => ({
            ...a,
            agentAgreements: (a.agentAgreements || []).filter((ag) => activeSourceIds.has(ag.sourceId)),
        }));
        res.json({
            items: agentsFiltered,
            total: agentsFiltered.length,
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
 * Read-only helper for external-agreement mode:
 * resolve contact details for an agreement id/reference and provide guidance.
 */
agreementsRouter.get("/agreements/external-contact", requireAuth(), async (req, res, next) => {
    try {
        const agreementId = String(req.query.agreement_id || "").trim();
        const agreementRef = String(req.query.agreement_ref || "").trim();
        if (!agreementId && !agreementRef) {
            return res.status(400).json({
                error: "BAD_REQUEST",
                message: "agreement_id or agreement_ref is required",
            });
        }
        const scopeWhere = req.user?.role === "ADMIN"
            ? {}
            : req.user?.type === "AGENT"
                ? { agentId: req.user.companyId }
                : req.user?.type === "SOURCE"
                    ? { sourceId: req.user.companyId }
                    : {};
        const items = await prisma.agreement.findMany({
            where: {
                ...scopeWhere,
                ...(agreementId ? { id: agreementId } : {}),
                ...(agreementRef ? { agreementRef } : {}),
            },
            include: {
                source: { select: { id: true, companyName: true, email: true, companyCode: true, status: true } },
                agent: { select: { id: true, companyName: true, email: true, companyCode: true, status: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
        if (items.length > 0) {
            return res.json({
                found: true,
                items: items.map((a) => ({
                    id: a.id,
                    agreementRef: a.agreementRef,
                    status: a.status,
                    source: a.source,
                    agent: a.agent,
                })),
                guidance: "Agreement details found. Agreements are externally managed; ensure account/agreement details are signed and provisioned before operational calls.",
            });
        }
        let suggestedContacts = [];
        if (req.user?.type === "AGENT") {
            const agreements = await prisma.agreement.findMany({
                where: { agentId: req.user.companyId },
                select: { sourceId: true },
                distinct: ["sourceId"],
                take: 10,
            });
            const sourceIds = agreements.map((a) => a.sourceId);
            if (sourceIds.length > 0) {
                const sources = await prisma.company.findMany({
                    where: { id: { in: sourceIds }, type: "SOURCE" },
                    select: { id: true, companyName: true, companyCode: true, email: true },
                    orderBy: { companyName: "asc" },
                    take: 10,
                });
                suggestedContacts = sources;
            }
        }
        return res.json({
            found: false,
            message: "Agreement reference is not registered internally. Contact the source company externally, sign the agreement, and confirm the provisioned account/agreement reference before retrying.",
            suggestedContacts,
        });
    }
    catch (e) {
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
        // Allow static notifications routes declared later to handle this path.
        if (id === "notifications") {
            return next();
        }
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
    return externalManagedResponse(res);
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
    return externalManagedResponse(res);
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
    return externalManagedResponse(res);
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
    return externalManagedResponse(res);
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
    return externalManagedResponse(res);
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
    return externalManagedResponse(res);
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
    // console.log("This is the agreements router");
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
            // Set timeout for gRPC call (10 seconds)
            const deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + 10);
            const call = client.ListBySource({ source_id: req.user.companyId, status }, metaFromReq(req), { deadline: deadline.getTime() }, (err, resp) => {
                if (err) {
                    // Handle gRPC errors
                    const errorMessage = err.message || String(err);
                    // Check for timeout errors
                    if (err.code === 4 || errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('timeout')) {
                        return res.status(504).json({
                            error: "GATEWAY_TIMEOUT",
                            message: "Request timed out. The gRPC service did not respond in time.",
                            code: err.code || 4,
                            requestId: req.requestId,
                            hint: "The backend service may be overloaded or the gRPC server is not responding."
                        });
                    }
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
            // Handle call cancellation on timeout (if call supports it)
            const timeoutId1 = setTimeout(() => {
                try {
                    if (call && typeof call.cancel === 'function') {
                        call.cancel();
                    }
                }
                catch (e) {
                    // Ignore cancellation errors
                }
            }, 10000);
            // Clear timeout if response comes back
            if (call && typeof call.on === 'function') {
                call.on('status', () => {
                    clearTimeout(timeoutId1);
                });
            }
        }
        else {
            // Debug logging for agent agreements
            // Set timeout for gRPC call (10 seconds)
            const deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + 10);
            const call = client.ListByAgent({ agent_id: req.user.companyId, status }, metaFromReq(req), { deadline: deadline.getTime() }, (err, resp) => {
                if (err) {
                    // Handle gRPC errors
                    const errorMessage = err.message || String(err);
                    // Check for timeout errors
                    if (err.code === 4 || errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('timeout')) {
                        return res.status(504).json({
                            error: "GATEWAY_TIMEOUT",
                            message: "Request timed out. The gRPC service did not respond in time.",
                            code: err.code || 4,
                            requestId: req.requestId,
                            hint: "The backend service may be overloaded or the gRPC server is not responding."
                        });
                    }
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
            // Handle call cancellation on timeout (if call supports it)
            const timeoutId2 = setTimeout(() => {
                try {
                    if (call && typeof call.cancel === 'function') {
                        call.cancel();
                    }
                }
                catch (e) {
                    // Ignore cancellation errors
                }
            }, 10000);
            // Clear timeout if response comes back
            if (call && typeof call.on === 'function') {
                call.on('status', () => {
                    clearTimeout(timeoutId2);
                });
            }
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
        const client = agreementClient();
        client.ListByAgent({ agent_id: req.user.companyId, status }, metaFromReq(req), (err, resp) => {
            if (err) {
                return next(err);
            }
            res.json({ items: resp.items.map(toAgreementCamelCase), total: resp.items.length });
        });
    }
    catch (e) {
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
    return externalManagedResponse(res);
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
        if (!agent || (agent?.type ?? "") !== "AGENT" || (agent?.status ?? "") !== "ACTIVE") {
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
// ============================================================================
// Agent Companies + Source Groups
// ============================================================================
const createSourceGroupSchema = z.object({
    name: z.string().min(1).max(100),
});
const updateSourceGroupSchema = z.object({
    name: z.string().min(1).max(100),
});
const attachGroupAgreementSchema = z.object({
    agreementId: z.string().min(1),
});
/**
 * GET /agent/companies
 * List source companies reachable by the current agent via agreements,
 * including agreement refs and basic coverage/branch counts.
 */
agreementsRouter.get("/agent/companies", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const search = String(req.query.search || "").trim();
        const agreements = await prisma.agreement.findMany({
            where: {
                agentId,
                status: { in: ["ACTIVE", "ACCEPTED", "OFFERED"] },
            },
            select: {
                id: true,
                agreementRef: true,
                status: true,
                validFrom: true,
                validTo: true,
                sourceId: true,
            },
            orderBy: { createdAt: "desc" },
        });
        const sourceIds = [...new Set(agreements.map((a) => a.sourceId))];
        if (sourceIds.length === 0) {
            return res.json({ items: [], total: 0 });
        }
        const [sources, branchCounts, locationCounts] = await Promise.all([
            prisma.company.findMany({
                where: {
                    id: { in: sourceIds },
                    type: "SOURCE",
                    ...(search
                        ? {
                            OR: [
                                { companyName: { contains: search } },
                                { companyCode: { contains: search } },
                                { email: { contains: search } },
                            ],
                        }
                        : {}),
                },
                select: {
                    id: true,
                    companyName: true,
                    companyCode: true,
                    email: true,
                    status: true,
                    adapterType: true,
                    lastLocationSyncAt: true,
                },
            }),
            prisma.branch.groupBy({
                by: ["sourceId"],
                where: { sourceId: { in: sourceIds } },
                _count: true,
            }),
            prisma.sourceLocation.groupBy({
                by: ["sourceId"],
                where: { sourceId: { in: sourceIds } },
                _count: true,
            }),
        ]);
        const branchCountMap = new Map(branchCounts.map((b) => [b.sourceId, b._count]));
        const locationCountMap = new Map(locationCounts.map((l) => [l.sourceId, l._count]));
        const agreementsBySource = agreements.reduce((acc, ag) => {
            if (!acc[ag.sourceId])
                acc[ag.sourceId] = [];
            acc[ag.sourceId].push({
                id: ag.id,
                agreementRef: ag.agreementRef,
                status: ag.status,
                validFrom: ag.validFrom,
                validTo: ag.validTo,
            });
            return acc;
        }, {});
        const items = sources.map((src) => ({
            id: src.id,
            companyName: src.companyName,
            companyCode: src.companyCode,
            email: src.email,
            status: src.status,
            adapterType: src.adapterType,
            lastLocationSyncAt: src.lastLocationSyncAt,
            branchCount: Number(branchCountMap.get(src.id) ?? 0),
            locationCount: Number(locationCountMap.get(src.id) ?? 0),
            agreements: agreementsBySource[src.id] || [],
        }));
        res.json({ items, total: items.length });
    }
    catch (e) {
        next(e);
    }
});
/** GET /agent/source-groups */
agreementsRouter.get("/agent/source-groups", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        if (sourceGroupDelegate?.findMany) {
            const groups = await sourceGroupDelegate.findMany({
                where: { agentId },
                include: {
                    agreements: {
                        include: {
                            agreement: {
                                select: {
                                    id: true,
                                    agreementRef: true,
                                    status: true,
                                    sourceId: true,
                                    source: {
                                        select: { id: true, companyName: true, companyCode: true },
                                    },
                                },
                            },
                        },
                        orderBy: { createdAt: "desc" },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
            const items = groups.map((g) => ({
                id: g.id,
                name: g.name,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
                agreements: g.agreements.map((ga) => ({
                    id: ga.agreement.id,
                    agreementRef: ga.agreement.agreementRef,
                    status: ga.agreement.status,
                    sourceId: ga.agreement.sourceId,
                    source: ga.agreement.source,
                })),
            }));
            return res.json({ items, total: items.length });
        }
        // Fallback when Prisma delegate is unavailable (stale generated client in runtime).
        const groups = await prisma.$queryRaw `
      SELECT id, name, createdAt, updatedAt
      FROM \`AgentSourceGroup\`
      WHERE BINARY agentId = BINARY ${agentId}
      ORDER BY createdAt DESC
    `;
        const items = [];
        for (const g of groups) {
            const rows = await prisma.$queryRaw `
        SELECT
          a.id AS agreementId,
          a.agreementRef AS agreementRef,
          a.status AS status,
          a.sourceId AS sourceId,
          s.id AS source_id,
          s.companyName AS source_companyName,
          s.companyCode AS source_companyCode
        FROM \`AgentSourceGroupAgreement\` ga
        INNER JOIN \`Agreement\` a ON BINARY a.id = BINARY ga.agreementId
        LEFT JOIN \`Company\` s ON BINARY s.id = BINARY a.sourceId
        WHERE BINARY ga.groupId = BINARY ${g.id}
        ORDER BY ga.createdAt DESC
      `;
            items.push({
                id: g.id,
                name: g.name,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
                agreements: rows.map((r) => ({
                    id: r.agreementId,
                    agreementRef: r.agreementRef,
                    status: r.status,
                    sourceId: r.sourceId,
                    source: r.source_id
                        ? { id: r.source_id, companyName: r.source_companyName, companyCode: r.source_companyCode }
                        : null,
                })),
            });
        }
        return res.json({ items, total: items.length });
    }
    catch (e) {
        next(e);
    }
});
/** POST /agent/source-groups */
agreementsRouter.post("/agent/source-groups", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const body = createSourceGroupSchema.parse(req.body);
        const name = body.name.trim();
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        if (sourceGroupDelegate?.create) {
            const group = await sourceGroupDelegate.create({
                data: {
                    agentId,
                    name,
                },
            });
            return res.status(201).json(group);
        }
        const exists = await prisma.$queryRaw `
      SELECT id FROM \`AgentSourceGroup\`
      WHERE BINARY agentId = BINARY ${agentId} AND BINARY name = BINARY ${name}
      LIMIT 1
    `;
        if (exists.length > 0) {
            return res.status(409).json({ error: "GROUP_NAME_EXISTS", message: "A group with this name already exists" });
        }
        const id = `asg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await prisma.$executeRaw `
      INSERT INTO \`AgentSourceGroup\` (id, agentId, name, createdAt, updatedAt)
      VALUES (${id}, ${agentId}, ${name}, NOW(3), NOW(3))
    `;
        const created = await prisma.$queryRaw `
      SELECT id, agentId, name, createdAt, updatedAt
      FROM \`AgentSourceGroup\`
      WHERE BINARY id = BINARY ${id}
      LIMIT 1
    `;
        return res.status(201).json(created[0]);
    }
    catch (e) {
        if (e?.code === "P2002") {
            return res.status(409).json({ error: "GROUP_NAME_EXISTS", message: "A group with this name already exists" });
        }
        next(e);
    }
});
/** PATCH /agent/source-groups/:id */
agreementsRouter.patch("/agent/source-groups/:id", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const id = String(req.params.id || "");
        const body = updateSourceGroupSchema.parse(req.body);
        const name = body.name.trim();
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        if (sourceGroupDelegate?.findUnique && sourceGroupDelegate?.update) {
            const group = await sourceGroupDelegate.findUnique({ where: { id } });
            if (!group || group.agentId !== agentId) {
                return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
            }
            const updated = await sourceGroupDelegate.update({
                where: { id },
                data: { name },
            });
            return res.json(updated);
        }
        const rows = await prisma.$queryRaw `
      SELECT id, agentId FROM \`AgentSourceGroup\`
      WHERE BINARY id = BINARY ${id}
      LIMIT 1
    `;
        const group = rows[0];
        if (!group || group.agentId !== agentId) {
            return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
        }
        const dup = await prisma.$queryRaw `
      SELECT id FROM \`AgentSourceGroup\`
      WHERE BINARY agentId = BINARY ${agentId} AND BINARY name = BINARY ${name} AND BINARY id <> BINARY ${id}
      LIMIT 1
    `;
        if (dup.length > 0) {
            return res.status(409).json({ error: "GROUP_NAME_EXISTS", message: "A group with this name already exists" });
        }
        await prisma.$executeRaw `
      UPDATE \`AgentSourceGroup\`
      SET name = ${name}, updatedAt = NOW(3)
      WHERE BINARY id = BINARY ${id}
    `;
        const updated = await prisma.$queryRaw `
      SELECT id, agentId, name, createdAt, updatedAt
      FROM \`AgentSourceGroup\`
      WHERE BINARY id = BINARY ${id}
      LIMIT 1
    `;
        return res.json(updated[0]);
    }
    catch (e) {
        if (e?.code === "P2002") {
            return res.status(409).json({ error: "GROUP_NAME_EXISTS", message: "A group with this name already exists" });
        }
        next(e);
    }
});
/** DELETE /agent/source-groups/:id */
agreementsRouter.delete("/agent/source-groups/:id", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const id = String(req.params.id || "");
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        if (sourceGroupDelegate?.findUnique && sourceGroupDelegate?.delete) {
            const group = await sourceGroupDelegate.findUnique({ where: { id } });
            if (!group || group.agentId !== agentId) {
                return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
            }
            await sourceGroupDelegate.delete({ where: { id } });
            return res.json({ success: true });
        }
        const rows = await prisma.$queryRaw `
      SELECT id, agentId FROM \`AgentSourceGroup\`
      WHERE BINARY id = BINARY ${id}
      LIMIT 1
    `;
        const group = rows[0];
        if (!group || group.agentId !== agentId) {
            return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
        }
        await prisma.$executeRaw `DELETE FROM \`AgentSourceGroupAgreement\` WHERE BINARY groupId = BINARY ${id}`;
        await prisma.$executeRaw `DELETE FROM \`AgentSourceGroup\` WHERE BINARY id = BINARY ${id}`;
        return res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
/** POST /agent/source-groups/:id/agreements */
agreementsRouter.post("/agent/source-groups/:id/agreements", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const groupId = String(req.params.id || "");
        const body = attachGroupAgreementSchema.parse(req.body);
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        const sourceGroupAgreementDelegate = prismaAny.agentSourceGroupAgreement;
        let group;
        if (sourceGroupDelegate?.findUnique) {
            group = await sourceGroupDelegate.findUnique({ where: { id: groupId } });
        }
        else {
            const rows = await prisma.$queryRaw `
        SELECT id, agentId FROM \`AgentSourceGroup\`
        WHERE BINARY id = BINARY ${groupId}
        LIMIT 1
      `;
            group = rows[0];
        }
        if (!group || group.agentId !== agentId) {
            return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
        }
        const agreement = await prisma.agreement.findUnique({
            where: { id: body.agreementId },
            select: { id: true, agentId: true },
        });
        if (!agreement || agreement.agentId !== agentId) {
            return res.status(404).json({ error: "AGREEMENT_NOT_FOUND", message: "Agreement not found for this agent" });
        }
        if (sourceGroupAgreementDelegate?.create) {
            const row = await sourceGroupAgreementDelegate.create({
                data: {
                    groupId,
                    agreementId: body.agreementId,
                },
            });
            return res.status(201).json(row);
        }
        const existing = await prisma.$queryRaw `
      SELECT id FROM \`AgentSourceGroupAgreement\`
      WHERE BINARY groupId = BINARY ${groupId} AND BINARY agreementId = BINARY ${body.agreementId}
      LIMIT 1
    `;
        if (existing.length > 0) {
            return res.status(409).json({ error: "AGREEMENT_ALREADY_ATTACHED", message: "Agreement already attached to group" });
        }
        const id = `asga_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await prisma.$executeRaw `
      INSERT INTO \`AgentSourceGroupAgreement\` (id, groupId, agreementId, createdAt)
      VALUES (${id}, ${groupId}, ${body.agreementId}, NOW(3))
    `;
        const row = await prisma.$queryRaw `
      SELECT id, groupId, agreementId, createdAt
      FROM \`AgentSourceGroupAgreement\`
      WHERE BINARY id = BINARY ${id}
      LIMIT 1
    `;
        return res.status(201).json(row[0]);
    }
    catch (e) {
        if (e?.code === "P2002") {
            return res.status(409).json({ error: "AGREEMENT_ALREADY_ATTACHED", message: "Agreement already attached to group" });
        }
        next(e);
    }
});
/** DELETE /agent/source-groups/:id/agreements/:agreementId */
agreementsRouter.delete("/agent/source-groups/:id/agreements/:agreementId", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const agentId = req.user.companyId;
        const groupId = String(req.params.id || "");
        const agreementId = String(req.params.agreementId || "");
        const sourceGroupDelegate = prismaAny.agentSourceGroup;
        const sourceGroupAgreementDelegate = prismaAny.agentSourceGroupAgreement;
        const group = sourceGroupDelegate?.findUnique
            ? await sourceGroupDelegate.findUnique({ where: { id: groupId } })
            : (await prisma.$queryRaw `
          SELECT id, agentId FROM \`AgentSourceGroup\`
          WHERE BINARY id = BINARY ${groupId}
          LIMIT 1
        `)[0];
        if (!group || group.agentId !== agentId) {
            return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Group not found" });
        }
        if (sourceGroupAgreementDelegate?.deleteMany) {
            await sourceGroupAgreementDelegate.deleteMany({
                where: { groupId, agreementId },
            });
        }
        else {
            await prisma.$executeRaw `
        DELETE FROM \`AgentSourceGroupAgreement\`
        WHERE BINARY groupId = BINARY ${groupId} AND BINARY agreementId = BINARY ${agreementId}
      `;
        }
        return res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
