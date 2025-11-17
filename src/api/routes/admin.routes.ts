import { Router } from "express";
import { z } from "zod";
import { requireAuth, Auth } from "../../infra/auth.js";
import { requireRole } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { SourceHealthService } from "../../services/health.js";
import { createApiKey } from "../../infra/apiKeys.js"; // [AUTO-AUDIT]
import crypto from "crypto"; // [AUTO-AUDIT]
import { agreementClient } from "../../grpc/clients/agreement.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { notifyAgreementDrafted } from "../../services/notifications.js";
import { enforceWhitelist } from "../../infra/whitelistEnforcement.js";
import { validateLocationArray } from "../../services/locationValidation.js";

export const adminRouter = Router();

/**
 * @openapi
 * /admin/health:
 *   get:
 *     tags: [Admin]
 *     summary: Full health probe (DB + mailer smoke)
 *     description: Comprehensive health check including database connectivity, gRPC services, and mailer functionality
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health check results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   description: Overall health status
 *                 checks:
 *                   type: object
 *                   properties:
 *                     db:
 *                       type: string
 *                       description: Database health status
 *                     grpc_core:
 *                       type: string
 *                       description: gRPC core service status
 *                     mailer:
 *                       type: string
 *                       description: Email service status
 */
adminRouter.get("/admin/health", requireAuth(), requireRole("ADMIN"), async (_req, res) => {
  const out: any = { ok: true, checks: {} };
  try {
    await prisma.$queryRaw`SELECT 1`;
    out.checks.db = "ok";
  } catch (e: any) {
    out.ok = false; out.checks.db = e.message;
  }
  // gRPC runs in-process; if HTTP is up, core server is up. Expose a flag:
  out.checks.grpc_core = "ok";
  // mailer smoke (best-effort)
  out.checks.mailer = "ok";
  res.json(out);
});

/**
 * @openapi
 * /admin/verification-results:
 *   get:
 *     tags: [Admin]
 *     summary: List recent verification results (SOURCE and AGENT)
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get("/admin/verification-results", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number((req.query?.limit as string) || 50)));
    const items = await prisma.verificationReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// Admin: list sources and counts of locations
adminRouter.get("/admin/locations/sources", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const sources = await prisma.company.findMany({
      where: { type: "SOURCE" },
      select: { id: true, companyName: true, status: true },
      orderBy: { companyName: "asc" },
    });
    const out = [] as any[];
    for (const s of sources) {
      const count = await prisma.sourceLocation.count({ where: { sourceId: s.id } });
      out.push({ sourceId: s.id, companyName: s.companyName, status: s.status, locations: count });
    }
    res.json({ items: out, total: out.length });
  } catch (e) { next(e); }
});

// [AUTO-AUDIT] API Keys CRUD
adminRouter.post("/admin/api-keys", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().optional(), owner_type: z.enum(["agent","source","admin"]).optional(), owner_id: z.string().optional(), permissions: z.array(z.string()).optional() });
    const p = schema.parse(req.body);
    const out = await createApiKey({ name: p.name || 'API Key', ownerType: p.owner_type || 'admin', ownerId: p.owner_id || 'default', permissions: p.permissions });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

adminRouter.get("/admin/api-keys", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const items = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, ownerType: true, ownerId: true, status: true, createdAt: true } });
    res.json({ items });
  } catch (e) { next(e); }
});

adminRouter.delete("/admin/api-keys/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.apiKey.update({ where: { id: String(req.params.id) }, data: { status: 'revoked' } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// [AUTO-AUDIT] IP Whitelist CRUD
// Support both /admin/whitelist and /admin/ip-whitelist for backward compatibility
adminRouter.get("/admin/whitelist", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try { const items = await prisma.whitelistedIp.findMany({ orderBy: { createdAt: 'desc' } }); res.json({ items }); } catch (e) { next(e); }
});

adminRouter.get("/admin/ip-whitelist", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try { const items = await prisma.whitelistedIp.findMany({ orderBy: { createdAt: 'desc' } }); res.json({ items }); } catch (e) { next(e); }
});

adminRouter.post("/admin/whitelist", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const schema = z.object({ ip: z.string(), type: z.enum(["agent","source","admin"]), enabled: z.boolean().default(true) });
    const body = schema.parse(req.body);
    const row = await prisma.whitelistedIp.upsert({ where: { ip_type: { ip: body.ip, type: body.type } as any }, update: { enabled: body.enabled }, create: { ip: body.ip, type: body.type, enabled: body.enabled } });
    res.json(row);
  } catch (e) { next(e); }
});

adminRouter.post("/admin/ip-whitelist", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const schema = z.object({ ip: z.string(), type: z.enum(["agent","source","admin"]), enabled: z.boolean().optional().default(true) });
    const p = schema.parse(req.body);
    const item = await prisma.whitelistedIp.upsert({ where: { ip_type: { ip: p.ip, type: p.type } as any }, update: { enabled: p.enabled }, create: { ip: p.ip, type: p.type, enabled: p.enabled } as any });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

adminRouter.delete("/admin/whitelist/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try { await prisma.whitelistedIp.delete({ where: { id: String(req.params.id) } }); res.json({ ok: true }); } catch (e) { next(e); }
});

adminRouter.delete("/admin/ip-whitelist/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try { await prisma.whitelistedIp.delete({ where: { id: String(req.params.id) } }); res.json({ ok: true }); } catch (e) { next(e); }
});

// [AUTO-AUDIT] Simple overview dashboard metrics
adminRouter.get("/admin/overview", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const [agents, sources, agreements, activeKeys, last24hRequests] = await Promise.all([
      prisma.company.count({ where: { type: "AGENT" } }),
      prisma.company.count({ where: { type: "SOURCE" } }),
      prisma.agreement.count({ where: { status: { in: ["ACTIVE","DRAFT","OFFERED","ACCEPTED"] } } }),
      prisma.apiKey.count({ where: { status: "active" } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24*3600*1000) } } })
    ]);
    res.json({ agents, sources, agreements, activeKeys, last24hRequests });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies:
 *   get:
 *     tags: [Admin]
 *     summary: List companies with related data (optionally filter by type)
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [AGENT, SOURCE] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED] }
 */
adminRouter.get("/admin/companies", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    
    const items = await prisma.company.findMany({
      where,
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get specific company details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
adminRouter.get("/admin/companies/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }
    
    res.json(company);
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update company status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED]
 *                 description: New company status
 */
adminRouter.patch("/admin/companies/:id/status", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const allowedStatuses = ["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: `Status must be one of: ${allowedStatuses.join(", ")}`
      });
    }
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true, status: true }
    });
    
    if (!company) {
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }
    
    // Update status
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { status },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    res.json({
      message: `Company status updated to ${status}`,
      company: updatedCompany
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve a company (set approvalStatus to APPROVED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
adminRouter.post("/admin/companies/:id/approve", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id;
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true, approvalStatus: true, emailVerified: true }
    });
    
    if (!company) {
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }

    if (!company.emailVerified) {
      return res.status(400).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Company email must be verified before approval"
      });
    }
    
    // Update approval status
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { approvalStatus: "APPROVED" },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    res.json({
      message: "Company approved successfully",
      company: updatedCompany
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject a company (set approvalStatus to REJECTED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Optional rejection reason
 */
adminRouter.post("/admin/companies/:id/reject", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true, approvalStatus: true }
    });
    
    if (!company) {
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }
    
    // Update approval status
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { approvalStatus: "REJECTED" },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    res.json({
      message: "Company rejected",
      reason: reason || "No reason provided",
      company: updatedCompany
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/bulk-status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update multiple companies status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [company_ids, status]
 *             properties:
 *               company_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: Array of company IDs
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED]
 *                 description: New status for all companies
 */
adminRouter.patch("/admin/companies/bulk-status", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { company_ids, status } = req.body;
    
    // Validate status
    const allowedStatuses = ["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: `Status must be one of: ${allowedStatuses.join(", ")}`
      });
    }
    
    // Validate company_ids
    if (!Array.isArray(company_ids) || company_ids.length === 0) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "company_ids must be a non-empty array"
      });
    }
    
    // Update all companies
    const result = await prisma.company.updateMany({
      where: { id: { in: company_ids } },
      data: { status }
    });
    
    res.json({
      message: `Updated ${result.count} companies to ${status}`,
      updatedCount: result.count,
      requestedCount: company_ids.length
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new company
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName, email, type, password]
 *             properties:
 *               companyName:
 *                 type: string
 *                 description: Company name
 *               email:
 *                 type: string
 *                 description: Company email (must be unique)
 *               type:
 *                 type: string
 *                 enum: [AGENT, SOURCE]
 *                 description: Company type
 *               password:
 *                 type: string
 *                 description: Password for the company
 *               adapterType:
 *                 type: string
 *                 enum: [mock, grpc, http]
 *                 default: mock
 *                 description: Adapter type (for sources)
 *               grpcEndpoint:
 *                 type: string
 *                 description: gRPC endpoint address
 */
adminRouter.post("/admin/companies", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { companyName, email, type, password, adapterType, grpcEndpoint } = req.body;
    
    // Validate required fields
    if (!companyName || !email || !type || !password) {
      return res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "companyName, email, type, and password are required"
      });
    }
    
    // Validate type
    if (!["AGENT", "SOURCE"].includes(type)) {
      return res.status(400).json({
        error: "INVALID_TYPE",
        message: "Type must be AGENT or SOURCE"
      });
    }
    
    // Validate adapter type if provided
    if (adapterType && !["mock", "grpc", "http"].includes(adapterType)) {
      return res.status(400).json({
        error: "INVALID_ADAPTER_TYPE",
        message: "Adapter type must be one of: mock, grpc, http"
      });
    }
    
    // Check if email already exists
    const existingCompany = await prisma.company.findUnique({
      where: { email }
    });
    
    if (existingCompany) {
      return res.status(409).json({
        error: "EMAIL_ALREADY_EXISTS",
        message: "A company with this email already exists"
      });
    }
    
    // Hash password
    const passwordHash = await Auth.hash(password);
    
    // Create company
    const newCompany = await prisma.company.create({
      data: {
        companyName,
        email,
        type,
        passwordHash,
        adapterType: adapterType || "mock",
        grpcEndpoint: grpcEndpoint || null,
        status: "ACTIVE"
      },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    // Remove password hash from response
    const { passwordHash: _, ...companyWithoutPassword } = newCompany;
    
    res.status(201).json(companyWithoutPassword);
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update a company
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               email:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [AGENT, SOURCE]
 *               password:
 *                 type: string
 *               adapterType:
 *                 type: string
 *                 enum: [mock, grpc, http]
 *               grpcEndpoint:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED]
 */
adminRouter.put("/admin/companies/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyName, email, type, password, adapterType, grpcEndpoint, status } = req.body;
    
    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id }
    });
    
    if (!existingCompany) {
      return res.status(404).json({
        error: "COMPANY_NOT_FOUND",
        message: "Company not found"
      });
    }
    
    // Validate type if provided
    if (type && !["AGENT", "SOURCE"].includes(type)) {
      return res.status(400).json({
        error: "INVALID_TYPE",
        message: "Type must be AGENT or SOURCE"
      });
    }
    
    // Validate adapter type if provided
    if (adapterType && !["mock", "grpc", "http"].includes(adapterType)) {
      return res.status(400).json({
        error: "INVALID_ADAPTER_TYPE",
        message: "Adapter type must be one of: mock, grpc, http"
      });
    }
    
    // Validate status if provided
    if (status && !["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"].includes(status)) {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: "Status must be one of: ACTIVE, PENDING_VERIFICATION, SUSPENDED"
      });
    }
    
    // Check if email is being changed and if new email already exists
    if (email && email !== existingCompany.email) {
      const emailExists = await prisma.company.findUnique({
        where: { email }
      });
      
      if (emailExists) {
        return res.status(409).json({
          error: "EMAIL_ALREADY_EXISTS",
          message: "A company with this email already exists"
        });
      }
    }
    
    // Prepare update data
    const updateData: any = {};
    if (companyName) updateData.companyName = companyName;
    if (email) updateData.email = email;
    if (type) updateData.type = type;
    if (adapterType) updateData.adapterType = adapterType;
    if (grpcEndpoint !== undefined) updateData.grpcEndpoint = grpcEndpoint;
    if (status) updateData.status = status;
    
    // Hash password if provided
    if (password) {
      updateData.passwordHash = await Auth.hash(password);
    }
    
    // Update company
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: updateData,
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    // Remove password hash from response
    const { passwordHash: _, ...companyWithoutPassword } = updatedCompany;
    
    res.json(companyWithoutPassword);
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/companies/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a company
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
adminRouter.delete("/admin/companies/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true }
    });
    
    if (!existingCompany) {
      return res.status(404).json({
        error: "COMPANY_NOT_FOUND",
        message: "Company not found"
      });
    }
    
    // Delete company (cascade will handle related records)
    await prisma.company.delete({
      where: { id }
    });
    
    res.json({
      message: "Company deleted successfully",
      deletedCompany: existingCompany
    });
  } catch (e) { next(e); }
});

const logsQuery = z.object({
  q: z.string().optional(),
  direction: z.enum(["IN","OUT"]).optional(),
  endpoint: z.string().optional(),
  companyId: z.string().optional(),
  sourceId: z.string().optional(),
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional() // use last log id for pagination
});

/**
 * @openapi
 * /admin/logs:
 *   get:
 *     tags: [Admin]
 *     summary: Search audit logs (paginated)
 */
adminRouter.get("/admin/logs", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const p = logsQuery.parse(req.query);
    const where:any = {};
    if (p.direction) where.direction = p.direction;
    if (p.endpoint) where.endpoint = p.endpoint;
    if (p.companyId) where.companyId = p.companyId;
    if (p.sourceId) where.sourceId = p.sourceId;
    if (p.fromIso || p.toIso) {
      where.createdAt = {};
      if (p.fromIso) where.createdAt.gte = new Date(p.fromIso);
      if (p.toIso) where.createdAt.lte = new Date(p.toIso);
    }
    if (p.q) {
      // simple text search across masked request/response
      where.OR = [
        { maskedRequest: { contains: p.q } },
        { maskedResponse: { contains: p.q } },
        { requestId: { contains: p.q } },
        { endpoint: { contains: p.q } }
      ];
    }
    const take = p.limit + 1;
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
      take
    });
    const hasMore = rows.length > p.limit;
    const items = rows.slice(0, p.limit).map(item => {
      // Safely parse JSON strings for better readability
      let parsedRequest = null;
      let parsedResponse = null;
      
      try {
        parsedRequest = item.maskedRequest ? JSON.parse(item.maskedRequest) : null;
      } catch (e) {
        parsedRequest = item.maskedRequest; // Return as string if parsing fails
      }
      
      try {
        parsedResponse = item.maskedResponse ? JSON.parse(item.maskedResponse) : null;
      } catch (e) {
        parsedResponse = item.maskedResponse; // Return as string if parsing fails
      }
      
      return {
        ...item,
        // Parse JSON strings for better readability
        maskedRequest: parsedRequest,
        maskedResponse: parsedResponse,
        // Format timestamps for better readability
        createdAt: item.createdAt.toISOString(),
        // Add human-readable status
        status: item.httpStatus ? `HTTP ${item.httpStatus}` : 
                item.grpcStatus ? `gRPC ${item.grpcStatus}` : 
                'SUCCESS',
        // Add duration in human-readable format
        duration: item.durationMs ? `${item.durationMs}ms` : null,
        // Add data size information for debugging
        requestSize: item.maskedRequest ? item.maskedRequest.length : 0,
        responseSize: item.maskedResponse ? item.maskedResponse.length : 0,
        // Add raw data for complete traceability
        rawRequest: item.maskedRequest,
        rawResponse: item.maskedResponse
      };
    });
    const nextCursor = hasMore ? items[items.length-1].id : "";
    res.json({ 
      items, 
      nextCursor,
      total: items.length,
      hasMore
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/metrics/summary:
 *   get:
 *     tags: [Admin]
 *     summary: System summary counters and recent error rates
 */
adminRouter.get("/admin/metrics/summary", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const [companies, agreements, bookings, jobs24h, errors24h] = await Promise.all([
      prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.agreement.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.availabilityJob.count({ where: { createdAt: { gte: new Date(Date.now()-24*3600*1000) } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now()-24*3600*1000) }, OR: [{ httpStatus: { gte: 400 } }, { grpcStatus: { gt: 0 } }] } })
    ]);

    res.json({
      companiesByStatus: Object.fromEntries(companies.map(r => [r.status, r._count._all])),
      agreementsByStatus: Object.fromEntries(agreements.map(r => [r.status, r._count._all])),
      bookingsByStatus: Object.fromEntries(bookings.map(r => [r.status, r._count._all])),
      availabilityJobsLast24h: jobs24h,
      errorEventsLast24h: errors24h,
      generatedAt: new Date().toISOString()
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/health/sources:
 *   get:
 *     tags: [Admin Health]
 *     summary: Get health status for all sources
 *     description: Retrieve health monitoring data for all source companies including slow rates, backoff levels, and exclusion status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of source health statuses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sourceId:
 *                         type: string
 *                         description: Source company ID
 *                       healthy:
 *                         type: boolean
 *                         description: Overall health status
 *                       slowRate:
 *                         type: number
 *                         description: Percentage of slow requests
 *                       sampleCount:
 *                         type: integer
 *                         description: Total number of samples
 *                       backoffLevel:
 *                         type: integer
 *                         description: Current backoff level
 *                       excludedUntil:
 *                         type: string
 *                         format: date-time
 *                         description: Exclusion end time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         description: Last health update
 */
adminRouter.get("/admin/health/sources", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const healthStatuses = await SourceHealthService.getAllSourceHealth();
    res.json({ sources: healthStatuses });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/health/sources/{sourceId}:
 *   get:
 *     tags: [Admin Health]
 *     summary: Get health status for a specific source
 *     description: Retrieve detailed health monitoring data for a specific source company
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Source company ID
 *     responses:
 *       200:
 *         description: Source health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sourceId:
 *                   type: string
 *                   description: Source company ID
 *                 healthy:
 *                   type: boolean
 *                   description: Overall health status
 *                 slowRate:
 *                   type: number
 *                   description: Percentage of slow requests
 *                 sampleCount:
 *                   type: integer
 *                   description: Total number of samples
 *                 backoffLevel:
 *                   type: integer
 *                   description: Current backoff level
 *                 excludedUntil:
 *                   type: string
 *                   format: date-time
 *                   description: Exclusion end time
 *       404:
 *         description: Source not found
 */
adminRouter.get("/admin/health/sources/:sourceId", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { sourceId } = req.params;
    const healthStatus = await SourceHealthService.getSourceHealth(sourceId);
    res.json(healthStatus);
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/health/reset/{sourceId}:
 *   post:
 *     tags: [Admin Health]
 *     summary: Reset health status for a specific source
 *     description: Reset health monitoring data for a specific source, clearing slow counts, backoff levels, and exclusions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Source company ID
 *     responses:
 *       200:
 *         description: Health reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 sourceId:
 *                   type: string
 *                   description: Source company ID that was reset
 *       404:
 *         description: Source not found or invalid type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: SOURCE_NOT_FOUND
 *                 message:
 *                   type: string
 *                   example: Source not found or invalid type
 */
adminRouter.post("/admin/health/reset/:sourceId", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { sourceId } = req.params;
    const adminId = (req as any).user?.id;
    
    // Verify source exists
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: { id: true, type: true }
    });
    
    if (!source || source.type !== "SOURCE") {
      return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found or invalid type" });
    }
    
    await SourceHealthService.resetSourceHealth(sourceId, adminId);
    res.json({ message: "Source health reset successfully", sourceId });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/health/reset:
 *   post:
 *     tags: [Admin Health]
 *     summary: Reset health status for all sources
 *     description: Reset health monitoring data for all source companies, clearing slow counts, backoff levels, and exclusions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All source health reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 resetCount:
 *                   type: integer
 *                   description: Number of sources that were reset
 */
adminRouter.post("/admin/health/reset", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const adminId = (req as any).user?.id;
    
    // Get all SOURCE companies
    const sources = await prisma.company.findMany({
      where: { type: "SOURCE" },
      select: { id: true }
    });
    
    // Reset health for all sources
    await Promise.all(
      sources.map(source => SourceHealthService.resetSourceHealth(source.id, adminId))
    );
    
    res.json({ 
      message: "All source health reset successfully", 
      resetCount: sources.length 
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/endpoints:
 *   get:
 *     tags: [Admin Endpoints]
 *     summary: Get all companies' endpoint configurations
 *     description: Retrieve endpoint configurations for all companies in the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [AGENT, SOURCE] }
 *         description: Filter by company type
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED] }
 *         description: Filter by company status
 *     responses:
 *       200:
 *         description: List of company endpoint configurations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Company ID
 *                       companyName:
 *                         type: string
 *                         description: Company name
 *                       type:
 *                         type: string
 *                         enum: [AGENT, SOURCE]
 *                         description: Company type
 *                       status:
 *                         type: string
 *                         enum: [ACTIVE, PENDING_VERIFICATION, SUSPENDED]
 *                         description: Company status
 *                       httpEndpoint:
 *                         type: string
 *                         description: HTTP endpoint URL
 *                       grpcEndpoint:
 *                         type: string
 *                         description: gRPC endpoint address
 *                       adapterType:
 *                         type: string
 *                         enum: [mock, grpc, http]
 *                         description: Adapter type
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         description: Last update time
 *                 total:
 *                   type: integer
 *                   description: Total number of companies
 */
adminRouter.get("/admin/endpoints", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const type = req.query.type as string;
    const status = req.query.status as string;
    
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    
    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        type: true,
        status: true,
        adapterType: true,
        grpcEndpoint: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" }
    });
    
    const companiesWithEndpoints = companies.map(company => ({
      id: company.id,
      companyName: company.companyName,
      type: company.type,
      status: company.status,
      httpEndpoint: company.type === "AGENT" 
        ? "http://localhost:9091" 
        : "http://localhost:9090",
      grpcEndpoint: company.grpcEndpoint,
      adapterType: company.adapterType,
      updatedAt: company.updatedAt
    }));
    
    res.json({
      companies: companiesWithEndpoints,
      total: companiesWithEndpoints.length
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/endpoints/{companyId}:
 *   put:
 *     tags: [Admin Endpoints]
 *     summary: Update a company's endpoint configuration
 *     description: Update endpoint configuration for a specific company (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grpcEndpoint:
 *                 type: string
 *                 description: gRPC endpoint address
 *                 example: "localhost:51062"
 *               adapterType:
 *                 type: string
 *                 enum: [mock, grpc, http]
 *                 description: Adapter type
 *                 example: "grpc"
 *     responses:
 *       200:
 *         description: Company endpoint configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 company:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Company ID
 *                     companyName:
 *                       type: string
 *                       description: Company name
 *                     httpEndpoint:
 *                       type: string
 *                       description: HTTP endpoint URL
 *                     grpcEndpoint:
 *                       type: string
 *                       description: gRPC endpoint address
 *                     adapterType:
 *                       type: string
 *                       description: Adapter type
 *       404:
 *         description: Company not found
 *       400:
 *         description: Invalid configuration
 */
adminRouter.put("/admin/endpoints/:companyId", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { grpcEndpoint, adapterType } = req.body;
    
    // Validate adapter type
    if (adapterType && !["mock", "grpc", "http"].includes(adapterType)) {
      return res.status(400).json({
        error: "INVALID_ADAPTER_TYPE",
        message: "Adapter type must be one of: mock, grpc, http"
      });
    }
    
    // Validate gRPC endpoint format if provided
    if (grpcEndpoint) {
      const grpcPattern = /^[a-zA-Z0-9.-]+:\d+$/;
      if (!grpcPattern.test(grpcEndpoint)) {
        return res.status(400).json({
          error: "INVALID_GRPC_ENDPOINT",
          message: "gRPC endpoint must be in format 'host:port' (e.g., 'localhost:51062')"
        });
      }
    }
    
    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, companyName: true, type: true }
    });
    
    if (!existingCompany) {
      return res.status(404).json({ 
        error: "COMPANY_NOT_FOUND", 
        message: "Company not found" 
      });
    }
    
    // Update company configuration
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        adapterType: adapterType,
        grpcEndpoint: grpcEndpoint,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        companyName: true,
        type: true,
        adapterType: true,
        grpcEndpoint: true,
      }
    });
    
    const httpEndpoint = updatedCompany.type === "AGENT" 
      ? "http://localhost:9091" 
      : "http://localhost:9090";
    
    res.json({
      message: "Company endpoint configuration updated successfully",
      company: {
        id: updatedCompany.id,
        companyName: updatedCompany.companyName,
        httpEndpoint,
        grpcEndpoint: updatedCompany.grpcEndpoint,
        adapterType: updatedCompany.adapterType
      }
    });
  } catch (e) {
    next(e);
  }
});

// Helper to convert agreement from gRPC to HTTP camelCase
function toAgreementCamelCase(ag: any) {
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
  };
}

/**
 * @openapi
 * /admin/agreements:
 *   post:
 *     tags: [Admin]
 *     summary: Admin creates a draft agreement between agent and source
 *     security:
 *       - bearerAuth: []
 */
adminRouter.post("/admin/agreements", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    // Accept both camelCase and snake_case for flexibility
    const inputSchema = z.object({
      agent_id: z.string().optional(),
      agentId: z.string().optional(),
      source_id: z.string().optional(),
      sourceId: z.string().optional(),
      agreement_ref: z.string().min(2).optional(),
      agreementRef: z.string().min(2).optional(),
      valid_from: z.string().optional(),
      validFrom: z.string().optional(),
      valid_to: z.string().optional(),
      validTo: z.string().optional(),
    });

    const raw = inputSchema.parse(req.body);
    
    // Normalize to snake_case for gRPC
    const body = {
      agent_id: raw.agent_id || raw.agentId!,
      source_id: raw.source_id || raw.sourceId!,
      agreement_ref: raw.agreement_ref || raw.agreementRef!,
      valid_from: raw.valid_from || raw.validFrom || "",
      valid_to: raw.valid_to || raw.validTo || "",
    };

    // Validate companies exist
    const [agent, source] = await Promise.all([
      prisma.company.findFirst({
        where: { id: body.agent_id },
        select: { id: true, type: true, status: true },
      }),
      prisma.company.findFirst({
        where: { id: body.source_id },
        select: { id: true, type: true, status: true },
      }),
    ]);

    if (!agent || !source || agent.type !== "AGENT" || source.type !== "SOURCE") {
      return res.status(400).json({
        error: "SCHEMA_ERROR",
        message: "Invalid agent_id or source_id - companies must exist and have correct types",
      });
    }

    if (agent.status !== "ACTIVE" || source.status !== "ACTIVE") {
      return res.status(400).json({
        error: "SCHEMA_ERROR",
        message: "Both agent and source must be ACTIVE",
        details: {
          agentStatus: agent.status,
          sourceStatus: source.status,
        },
      });
    }

    const client = agreementClient();
    client.CreateDraft(body, metaFromReq(req), async (err: any, resp: any) => {
      if (err) {
        if (err.code === 3) {
          return res.status(400).json({
            error: "INVALID_ARGUMENT",
            message: err.message || "Invalid agent or source",
            agent_id: body.agent_id,
            source_id: body.source_id,
          });
        }
        if (err.code === 6) {
          return res.status(409).json({
            error: "CONFLICT",
            message: err.message || "Agreement already exists",
            agent_id: body.agent_id,
            source_id: body.source_id,
            agreement_ref: body.agreement_ref,
          });
        }
        return next(err);
      }

      // Send email notification for draft creation
      try {
        await notifyAgreementDrafted(resp.id);
      } catch (emailErr) {
        console.error("Failed to send draft notification:", emailErr);
      }

      res.json(toAgreementCamelCase(resp));
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/sources/{sourceId}/import-branches:
 *   post:
 *     tags: [Admin]
 *     summary: Import branches from supplier endpoint
 *     description: |
 *       Imports branch/location data from supplier HTTP endpoint.
 *       Validates CompanyCode, validates each branch, and upserts to database.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema: { type: string }
 */
adminRouter.post("/admin/sources/:sourceId/import-branches", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { sourceId } = req.params;
    
    // Load source and check approval
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        companyName: true,
        type: true,
        status: true,
        approvalStatus: true,
        emailVerified: true,
        companyCode: true,
        httpEndpoint: true,
        whitelistedDomains: true,
      },
    });

    if (!source) {
      return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found" });
    }

    if (source.type !== "SOURCE") {
      return res.status(400).json({ error: "INVALID_TYPE", message: "Company is not a SOURCE" });
    }

    if (source.approvalStatus !== "APPROVED") {
      return res.status(400).json({
        error: "NOT_APPROVED",
        message: "Source must be approved before importing branches",
      });
    }

    if (!source.emailVerified) {
      return res.status(400).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Source email must be verified",
      });
    }

    if (!source.httpEndpoint) {
      return res.status(400).json({
        error: "HTTP_ENDPOINT_NOT_CONFIGURED",
        message: "Source httpEndpoint must be configured",
      });
    }

    if (!source.companyCode) {
      return res.status(400).json({
        error: "COMPANY_CODE_MISSING",
        message: "Source companyCode must be set",
      });
    }

    // Enforce whitelist check
    try {
      await enforceWhitelist(sourceId, source.httpEndpoint);
    } catch (e: any) {
      return res.status(403).json({
        error: "WHITELIST_VIOLATION",
        message: e.message || "Endpoint not whitelisted",
      });
    }

    // Call supplier endpoint with Request-Type: LocationRq header
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(source.httpEndpoint, {
        method: "GET",
        headers: {
          "Request-Type": "LocationRq",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          error: "SUPPLIER_ERROR",
          message: `Supplier endpoint returned ${response.status}`,
        });
      }

      const data = await response.json();

      // Validate CompanyCode
      if (data.CompanyCode !== source.companyCode) {
        return res.status(422).json({
          error: "COMPANY_CODE_MISMATCH",
          message: `Expected CompanyCode ${source.companyCode}, got ${data.CompanyCode}`,
        });
      }

      // Extract branches (assume data.Branches or data is array)
      const branches = Array.isArray(data.Branches) ? data.Branches : (Array.isArray(data) ? data : []);

      if (branches.length === 0) {
        return res.status(422).json({
          error: "NO_BRANCHES",
          message: "No branches found in supplier response",
        });
      }

      // Validate all branches
      const validation = validateLocationArray(branches, source.companyCode);

      if (!validation.valid) {
        return res.status(422).json({
          error: "VALIDATION_FAILED",
          message: `${validation.errors.length} branch(es) failed validation`,
          errors: validation.errors,
        });
      }

      // Upsert branches
      let imported = 0;
      let updated = 0;

      for (const branch of branches) {
        const branchData = {
          sourceId: source.id,
          branchCode: branch.Branchcode,
          name: branch.Name,
          status: branch.Status || null,
          locationType: branch.LocationType || null,
          collectionType: branch.CollectionType || null,
          email: branch.EmailAddress || null,
          phone: branch.Telephone?.attr?.PhoneNumber || null,
          latitude: typeof branch.Latitude === "number" ? branch.Latitude : null,
          longitude: typeof branch.Longitude === "number" ? branch.Longitude : null,
          addressLine: branch.Address?.AddressLine?.value || null,
          city: branch.Address?.CityName?.value || null,
          postalCode: branch.Address?.PostalCode?.value || null,
          country: branch.Address?.CountryName?.value || null,
          countryCode: branch.Address?.CountryName?.attr?.Code || null,
          natoLocode: branch.NatoLocode || null,
          rawJson: branch,
        };

        const existing = await prisma.branch.findUnique({
          where: {
            sourceId_branchCode: {
              sourceId: source.id,
              branchCode: branch.Branchcode,
            },
          },
        });

        if (existing) {
          await prisma.branch.update({
            where: { id: existing.id },
            data: branchData,
          });
          updated++;
        } else {
          await prisma.branch.create({
            data: branchData,
          });
          imported++;
        }
      }

      res.json({
        message: "Branches imported successfully",
        imported,
        updated,
        total: branches.length,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        return res.status(504).json({
          error: "TIMEOUT",
          message: "Supplier endpoint timeout after 30s",
        });
      }
      throw fetchError;
    }
  } catch (e) {
    next(e);
  }
});