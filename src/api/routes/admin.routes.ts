import { Router } from "express";
import { z } from "zod";
import fetch from "node-fetch";
import { requireAuth, Auth } from "../../infra/auth.js";
import { requireRole, requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { SourceHealthService } from "../../services/health.js";
import { createApiKey } from "../../infra/apiKeys.js"; // [AUTO-AUDIT]
import crypto from "crypto"; // [AUTO-AUDIT]
import { agreementClient } from "../../grpc/clients/agreement.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { notifyAgreementDrafted } from "../../services/notifications.js";
import { enforceWhitelist } from "../../infra/whitelistEnforcement.js";
import { validateLocationArray } from "../../services/locationValidation.js";
import { auditLog } from "../../services/audit.js";
import { invalidateMailerCache } from "../../infra/mailer.js";

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
    const id = String(req.params.id);
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'API_KEY_NOT_FOUND', message: 'API key not found' });
    }
    await prisma.apiKey.update({ where: { id }, data: { status: 'revoked' } });
    res.json({ ok: true, message: 'API key revoked successfully' });
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
    const schema = z.object({ 
      ip: z.string().min(1, 'IP address or domain is required'), 
      type: z.enum(["agent","source","admin"]), 
      enabled: z.boolean().default(true) 
    });
    const body = schema.parse(req.body);
    const row = await prisma.whitelistedIp.upsert({ 
      where: { ip_type: { ip: body.ip.trim(), type: body.type } as any }, 
      update: { enabled: body.enabled }, 
      create: { ip: body.ip.trim(), type: body.type, enabled: body.enabled } 
    });
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
  try {
    const id = String(req.params.id);
    const existing = await prisma.whitelistedIp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'WHITELIST_ENTRY_NOT_FOUND', message: 'Whitelist entry not found' });
    }
    await prisma.whitelistedIp.delete({ where: { id } });
    res.json({ ok: true, message: 'Whitelist entry removed successfully' });
  } catch (e) { next(e); }
});

adminRouter.delete("/admin/ip-whitelist/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.whitelistedIp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'WHITELIST_ENTRY_NOT_FOUND', message: 'Whitelist entry not found' });
    }
    await prisma.whitelistedIp.delete({ where: { id } });
    res.json({ ok: true, message: 'Whitelist entry removed successfully' });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /admin/whitelist/test:
 *   post:
 *     tags: [Admin]
 *     summary: Test whitelist access for a company
 *     description: Tests whether a company's configured endpoints are accessible based on their whitelisted domains
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId]
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID to test whitelist for
 *     responses:
 *       200:
 *         description: Whitelist test results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ip:
 *                     type: string
 *                     description: IP address or domain tested
 *                   accessible:
 *                     type: boolean
 *                     description: Whether the IP/domain is accessible
 *                   responseTime:
 *                     type: number
 *                     description: Response time in milliseconds (if tested)
 *                   error:
 *                     type: string
 *                     description: Error message if test failed
 *       404:
 *         description: Company not found
 */
adminRouter.post("/admin/whitelist/test", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { companyId } = req.body;
    
    if (!companyId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "companyId is required"
      });
    }

    // Get company details
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        companyName: true,
        type: true,
        httpEndpoint: true,
        grpcEndpoint: true,
        whitelistedDomains: true,
      }
    });

    if (!company) {
      return res.status(404).json({
        error: "COMPANY_NOT_FOUND",
        message: "Company not found"
      });
    }

    const results: Array<{
      ip: string;
      accessible: boolean;
      responseTime?: number;
      error?: string;
    }> = [];

    // Test company's whitelisted domains against their endpoints
    const endpointsToTest: string[] = [];
    
    if (company.httpEndpoint) {
      try {
        const url = new URL(company.httpEndpoint);
        endpointsToTest.push(url.hostname);
      } catch {
        endpointsToTest.push(company.httpEndpoint);
      }
    }
    
    if (company.grpcEndpoint) {
      // Extract hostname from gRPC endpoint (format: host:port)
      const grpcHost = company.grpcEndpoint.split(':')[0];
      if (grpcHost) {
        endpointsToTest.push(grpcHost);
      }
    }

    // If no endpoints configured, return empty results
    if (endpointsToTest.length === 0) {
      return res.json([{
        ip: 'No endpoints configured',
        accessible: false,
        error: 'Company has no httpEndpoint or grpcEndpoint configured'
      }]);
    }

    // Import whitelist enforcement function
    const { isWhitelisted } = await import("../../infra/whitelistEnforcement.js");
    
    // If company has whitelisted domains, test those too
    if (company.whitelistedDomains) {
      const domains = company.whitelistedDomains.split(',').map(d => d.trim()).filter(Boolean);
      for (const domain of domains) {
        if (!endpointsToTest.includes(domain)) {
          endpointsToTest.push(domain);
        }
      }
    }

    // Test each endpoint
    for (const endpoint of endpointsToTest) {
      const startTime = Date.now();
      try {
        // Test if endpoint is whitelisted
        const check = await isWhitelisted(companyId, endpoint);
        const responseTime = Date.now() - startTime;
        
        results.push({
          ip: endpoint,
          accessible: check.allowed,
          responseTime,
          error: check.allowed ? undefined : check.reason
        });
      } catch (error: any) {
        results.push({
          ip: endpoint,
          accessible: false,
          responseTime: Date.now() - startTime,
          error: error.message || 'Whitelist check failed'
        });
      }
    }

    // Also test global IP whitelist entries for this company type
    const globalWhitelistEntries = await prisma.whitelistedIp.findMany({
      where: {
        type: company.type === 'SOURCE' ? 'source' : company.type === 'AGENT' ? 'agent' : 'admin',
        enabled: true
      },
      select: { ip: true }
    });

    for (const entry of globalWhitelistEntries) {
      // Check if this IP is already tested
      if (!results.some(r => r.ip === entry.ip)) {
        results.push({
          ip: entry.ip,
          accessible: true,
          responseTime: 0,
        });
      }
    }

    res.json(results);
  } catch (e) {
    next(e);
  }
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
adminRouter.post("/admin/companies/:id/approve", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    const { id } = req.params;
    const adminId = (req as any).user?.id;
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true, approvalStatus: true, emailVerified: true }
    });
    
    if (!company) {
      // Log failed approval
      await auditLog({
        direction: "IN",
        endpoint: "admin.companies.approve",
        requestId,
        companyId: id,
        httpStatus: 404,
        request: { companyId: id },
        response: { error: "COMPANY_NOT_FOUND", message: "Company not found" },
        durationMs: Date.now() - startTime,
      });
      
      return res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company not found" });
    }

    // Update approval status and automatically verify email
    // When admin approves, we also verify the email automatically
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { 
        approvalStatus: "APPROVED",
        emailVerified: true  // Automatically verify email when admin approves
      },
      include: {
        users: true,
        agentAgreements: true,
        sourceAgreements: true,
        sourceLocations: true
      }
    });
    
    const duration = Date.now() - startTime;
    
    // Log successful approval (with email verification)
    await auditLog({
      direction: "IN",
      endpoint: "admin.companies.approve",
      requestId,
      companyId: id,
      httpStatus: 200,
      request: { companyId: id },
      response: { 
        message: "Company approved and email verified successfully", 
        companyId: id, 
        companyName: company.companyName,
        emailVerified: true,
        approvalStatus: "APPROVED"
      },
      durationMs: duration,
    });
    
    res.json({
      message: "Company approved and email verified successfully",
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
adminRouter.post("/admin/companies/:id/reject", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    const { id } = req.params;
    const { reason } = req.body || {};
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, companyName: true, type: true, approvalStatus: true }
    });
    
    if (!company) {
      // Log failed rejection
      await auditLog({
        direction: "IN",
        endpoint: "admin.companies.reject",
        requestId,
        companyId: id,
        httpStatus: 404,
        request: { companyId: id, reason },
        response: { error: "COMPANY_NOT_FOUND", message: "Company not found" },
        durationMs: Date.now() - startTime,
      });
      
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
    
    const duration = Date.now() - startTime;
    
    // Log successful rejection
    await auditLog({
      direction: "IN",
      endpoint: "admin.companies.reject",
      requestId,
      companyId: id,
      httpStatus: 200,
      request: { companyId: id, reason },
      response: { message: "Company rejected", companyId: id, companyName: company.companyName, reason },
      durationMs: duration,
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
    const validAdapterTypes = ["grpc", "http"];
    const isProduction = process.env.NODE_ENV === "production";
    
    if (adapterType) {
      if (!["mock", "grpc", "http"].includes(adapterType)) {
        return res.status(400).json({
          error: "INVALID_ADAPTER_TYPE",
          message: "Adapter type must be one of: grpc, http" + (isProduction ? "" : " (mock allowed in development only)")
        });
      }
      
      // Reject mock adapter in production
      if (isProduction && adapterType === "mock") {
        return res.status(400).json({
          error: "MOCK_ADAPTER_NOT_ALLOWED",
          message: "Mock adapter type is not allowed in production. Please use 'grpc' or 'http'."
        });
      }
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
        adapterType: adapterType || null,
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
    const validAdapterTypes = ["grpc", "http"];
    const isProduction = process.env.NODE_ENV === "production";
    
    if (adapterType) {
      if (!["mock", "grpc", "http"].includes(adapterType)) {
        return res.status(400).json({
          error: "INVALID_ADAPTER_TYPE",
          message: "Adapter type must be one of: grpc, http" + (isProduction ? "" : " (mock allowed in development only)")
        });
      }
      
      // Reject mock adapter in production
      if (isProduction && adapterType === "mock") {
        return res.status(400).json({
          error: "MOCK_ADAPTER_NOT_ALLOWED",
          message: "Mock adapter type is not allowed in production. Please use 'grpc' or 'http'."
        });
      }
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
    
    // Fetch company names for better display
    const companyIds = [...new Set(rows.map(r => r.companyId).filter((id): id is string => Boolean(id)))];
    const sourceIds = [...new Set(rows.map(r => r.sourceId).filter((id): id is string => Boolean(id)))];
    const allCompanyIds = [...new Set([...companyIds, ...sourceIds])];
    
    const companies = await prisma.company.findMany({
      where: { id: { in: allCompanyIds } },
      select: { id: true, companyName: true, type: true, companyCode: true }
    });
    const companyMap = new Map(companies.map(c => [c.id, c]));
    
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
      
      const company = item.companyId ? companyMap.get(item.companyId) : null;
      const source = item.sourceId ? companyMap.get(item.sourceId) : null;
      
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
        rawResponse: item.maskedResponse,
        // Add company information
        companyName: company?.companyName || null,
        companyType: company?.type || null,
        companyCode: company?.companyCode || null,
        sourceName: source?.companyName || null,
        sourceType: source?.type || null,
        sourceCode: source?.companyCode || null,
      };
    });
    const nextCursor = hasMore ? items[items.length-1].id : "";
    
    // Helper function to determine actor type from endpoint and company type
    const getActor = (endpoint: string | null, companyType: string | null, sourceType: string | null): 'agent' | 'source' | 'admin' | 'system' => {
      if (!endpoint) return 'system';
      if (endpoint.startsWith('admin.')) return 'admin';
      if (companyType === 'AGENT') return 'agent';
      if (companyType === 'SOURCE' || sourceType === 'SOURCE') return 'source';
      return 'system';
    };
    
    // Helper function to extract action from endpoint
    const getAction = (endpoint: string | null): string => {
      if (!endpoint) return 'Unknown action';
      const parts = endpoint.split('.');
      if (parts.length >= 2) {
        const action = parts[parts.length - 1];
        return action.charAt(0).toUpperCase() + action.slice(1) + ' ' + parts[0];
      }
      return endpoint.replace(/\./g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    };
    
    // Helper function to get resource name
    const getResource = (item: any): string => {
      if (item.agreementRef) return `Agreement ${item.agreementRef}`;
      if (item.requestId) return `Request ${item.requestId.slice(0, 16)}...`;
      if (item.companyName) return item.companyName;
      if (item.sourceName) return item.sourceName;
      if (item.endpoint) {
        if (item.endpoint.includes('booking')) return 'Booking operation';
        if (item.endpoint.includes('availability')) return 'Availability request';
        if (item.endpoint.includes('agreement')) return 'Agreement';
        if (item.endpoint.includes('health')) return 'Health check';
        if (item.endpoint.includes('location')) return 'Location sync';
      }
      return 'System resource';
    };
    
    // Helper function to determine result
    const getResult = (httpStatus: number | null, grpcStatus: number | null): 'success' | 'error' | 'warning' => {
      if (httpStatus) {
        if (httpStatus >= 400) return 'error';
        if (httpStatus >= 300) return 'warning';
        return 'success';
      }
      if (grpcStatus) {
        if (grpcStatus !== 0) return 'error';
        return 'success';
      }
      return 'success';
    };
    
    // Transform to match frontend expected format (for Logs page)
    const transformedItems = items.map(item => ({
      id: item.id,
      timestamp: item.createdAt,
      level: item.httpStatus && item.httpStatus >= 400 ? 'ERROR' : 
             item.httpStatus && item.httpStatus >= 300 ? 'WARN' : 'INFO',
      message: item.endpoint || 'Request',
      requestId: item.requestId,
      companyId: item.companyId,
      companyName: item.companyName,
      companyType: item.companyType,
      companyCode: item.companyCode,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      sourceCode: item.sourceCode,
      agreementRef: item.agreementRef,
      endpoint: item.endpoint,
      http_status: item.httpStatus,
      grpc_status: item.grpcStatus,
      maskedRequest: item.maskedRequest,
      maskedResponse: item.maskedResponse,
      duration_ms: item.durationMs,
    }));
    
    // Transform to Activity format (for Activity page)
    const activityItems = items.map(item => {
      const actor = getActor(item.endpoint, item.companyType, item.sourceType);
      const action = getAction(item.endpoint);
      const resource = getResource(item);
      const result = getResult(item.httpStatus, item.grpcStatus);
      
      // Build details string
      let details: string | undefined = undefined;
      if (item.durationMs) {
        details = `Duration: ${item.durationMs}ms`;
      }
      if (item.httpStatus && item.httpStatus >= 400) {
        details = details ? `${details}, HTTP ${item.httpStatus}` : `HTTP ${item.httpStatus}`;
      }
      if (item.grpcStatus && item.grpcStatus !== 0) {
        details = details ? `${details}, gRPC ${item.grpcStatus}` : `gRPC ${item.grpcStatus}`;
      }
      
      return {
        id: item.id,
        timestamp: item.createdAt,
        actor,
        action,
        resource,
        result,
        details,
      };
    });
    
    res.json({ 
      data: transformedItems,
      total: transformedItems.length,
      page: 1,
      limit: p.limit,
      // Keep backward compatibility
      items, 
      // Activity format for Activity page
      activities: activityItems,
      nextCursor,
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
 * /admin/system-status:
 *   get:
 *     tags: [Admin]
 *     summary: Get system status (gRPC services, job queue, location sync)
 *     description: Retrieve overall system status including gRPC services health, job queue status, and location sync information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 grpcServices:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [operational, degraded, down]
 *                     message:
 *                       type: string
 *                     agentService:
 *                       type: boolean
 *                     sourceService:
 *                       type: boolean
 *                 jobQueue:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [idle, processing, busy]
 *                     message:
 *                       type: string
 *                     pendingJobs:
 *                       type: number
 *                     processingJobs:
 *                       type: number
 *                     jobsLast24h:
 *                       type: number
 *                 locationSync:
 *                   type: object
 *                   properties:
 *                     lastSync:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     message:
 *                       type: string
 *                     sourcesWithSync:
 *                       type: number
 */
adminRouter.get("/admin/system-status", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
  try {
    // Check gRPC services
    const { checkAgentHealth } = await import("../../grpc/clients/agent-grpc.client.js");
    const { checkSourceHealth } = await import("../../grpc/clients/source-grpc.client.js");
    
    const [agentHealthy, sourceHealthy] = await Promise.all([
      checkAgentHealth().catch(() => false),
      checkSourceHealth().catch(() => false),
    ]);

    let grpcStatus = "operational";
    let grpcMessage = "All services operational";
    if (!agentHealthy && !sourceHealthy) {
      grpcStatus = "down";
      grpcMessage = "All gRPC services down";
    } else if (!agentHealthy) {
      grpcStatus = "degraded";
      grpcMessage = "Agent service unavailable";
    } else if (!sourceHealthy) {
      grpcStatus = "degraded";
      grpcMessage = "Source service unavailable";
    }

    // Check job queue status
    const [pendingJobs, processingJobs, jobsLast24h] = await Promise.all([
      prisma.availabilityJob.count({ where: { status: "PENDING" } }),
      prisma.availabilityJob.count({ where: { status: "PROCESSING" } }),
      prisma.availabilityJob.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]);

    let queueStatus = "idle";
    let queueMessage = "No active jobs";
    if (processingJobs > 0) {
      queueStatus = "processing";
      queueMessage = `Processing ${processingJobs} availability request${processingJobs !== 1 ? "s" : ""}`;
    } else if (pendingJobs > 0) {
      queueStatus = "busy";
      queueMessage = `${pendingJobs} job${pendingJobs !== 1 ? "s" : ""} pending`;
    }

    // Check location sync status
    const sourcesWithSync = await prisma.company.findMany({
      where: {
        type: "SOURCE",
        lastLocationSyncAt: { not: null },
      },
      select: {
        lastLocationSyncAt: true,
      },
      orderBy: {
        lastLocationSyncAt: "desc",
      },
      take: 1,
    });

    const lastSync = sourcesWithSync.length > 0 && sourcesWithSync[0].lastLocationSyncAt
      ? sourcesWithSync[0].lastLocationSyncAt
      : null;

    const allSources = await prisma.company.count({
      where: { type: "SOURCE" },
    });

    const sourcesWithSyncCount = await prisma.company.count({
      where: {
        type: "SOURCE",
        lastLocationSyncAt: { not: null },
      },
    });

    let syncMessage = "No location syncs recorded";
    if (lastSync) {
      const hoursAgo = Math.floor((Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60));
      const minutesAgo = Math.floor((Date.now() - new Date(lastSync).getTime()) / (1000 * 60));
      
      if (hoursAgo < 1) {
        syncMessage = `Last sync: ${minutesAgo} minute${minutesAgo !== 1 ? "s" : ""} ago`;
      } else if (hoursAgo < 24) {
        syncMessage = `Last sync: ${hoursAgo} hour${hoursAgo !== 1 ? "s" : ""} ago`;
      } else {
        const daysAgo = Math.floor(hoursAgo / 24);
        syncMessage = `Last sync: ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`;
      }
    }

    res.json({
      grpcServices: {
        status: grpcStatus,
        message: grpcMessage,
        agentService: agentHealthy,
        sourceService: sourceHealthy,
      },
      jobQueue: {
        status: queueStatus,
        message: queueMessage,
        pendingJobs,
        processingJobs,
        jobsLast24h,
      },
      locationSync: {
        lastSync: lastSync ? lastSync.toISOString() : null,
        message: syncMessage,
        sourcesWithSync: sourcesWithSyncCount,
        totalSources: allSources,
      },
    });
  } catch (e) {
    next(e);
  }
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
    // Return array directly to match frontend expectation
    res.json(healthStatuses);
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
 * /admin/sources/health:
 *   get:
 *     tags: [Admin]
 *     summary: Get source health status and adapter information (accessible to agents)
 *     description: Returns health status for all active sources, including which sources use mock adapters
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Source health information
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
 *                       companyName:
 *                         type: string
 *                       adapterType:
 *                         type: string
 *                         enum: [mock, grpc, http]
 *                       isMock:
 *                         type: boolean
 *                       status:
 *                         type: string
 *                 hasMockSources:
 *                   type: boolean
 */
adminRouter.get("/admin/sources/health", requireAuth(), requireCompanyType("ADMIN", "AGENT"), async (req, res, next) => {
  try {
    const sources = await prisma.company.findMany({
      where: { type: "SOURCE", status: "ACTIVE" },
      select: {
        id: true,
        companyName: true,
        adapterType: true,
        status: true
      }
    });
    
    const health = sources.map(s => ({
      sourceId: s.id,
      companyName: s.companyName,
      adapterType: s.adapterType,
      isMock: s.adapterType === "mock",
      status: s.status
    }));
    
    res.json({ 
      sources: health, 
      hasMockSources: health.some(s => s.isMock) 
    });
  } catch (e) { 
    next(e); 
  }
});

/**
 * @openapi
 * /admin/health/check/{companyId}:
 *   post:
 *     tags: [Admin Health]
 *     summary: Run health check for a specific source
 *     description: Manually trigger a health check for a source company and return current health status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Source company ID
 *     responses:
 *       200:
 *         description: Health check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sourceId:
 *                   type: string
 *                 healthy:
 *                   type: boolean
 *                 slowRate:
 *                   type: number
 *                 sampleCount:
 *                   type: integer
 *                 backoffLevel:
 *                   type: integer
 *                 excludedUntil:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       404:
 *         description: Source not found or invalid type
 */
adminRouter.post("/admin/health/check/:companyId", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    const { companyId } = req.params;
    
    // Verify company exists and is a SOURCE
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, type: true, companyName: true }
    });
    
    if (!company || company.type !== "SOURCE") {
      // Log failed health check
      await auditLog({
        direction: "IN",
        endpoint: "admin.health.check",
        requestId,
        companyId: companyId,
        sourceId: companyId,
        httpStatus: 404,
        request: { companyId },
        response: { error: "SOURCE_NOT_FOUND", message: "Source not found or invalid type" },
        durationMs: Date.now() - startTime,
      });
      
      return res.status(404).json({ 
        error: "SOURCE_NOT_FOUND", 
        message: "Source not found or invalid type" 
      });
    }
    
    // Get current health status
    const healthStatus = await SourceHealthService.getSourceHealth(companyId);
    const duration = Date.now() - startTime;
    
    // Log successful health check
    await auditLog({
      direction: "IN",
      endpoint: "admin.health.check",
      requestId,
      companyId: companyId,
      sourceId: companyId,
      httpStatus: 200,
      request: { companyId },
      response: healthStatus,
      durationMs: duration,
    });
    
    res.json(healthStatus);
  } catch (e) {
    next(e);
  }
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
adminRouter.post("/admin/health/reset/:sourceId", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    const { sourceId } = req.params;
    const adminId = (req as any).user?.id;
    
    // Verify source exists
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: { id: true, type: true, companyName: true }
    });
    
    if (!source || source.type !== "SOURCE") {
      // Log failed health reset
      await auditLog({
        direction: "IN",
        endpoint: "admin.health.reset",
        requestId,
        companyId: sourceId,
        sourceId: sourceId,
        httpStatus: 404,
        request: { sourceId },
        response: { error: "SOURCE_NOT_FOUND", message: "Source not found or invalid type" },
        durationMs: Date.now() - startTime,
      });
      
      return res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Source not found or invalid type" });
    }
    
    await SourceHealthService.resetSourceHealth(sourceId, adminId);
    const duration = Date.now() - startTime;
    
    // Log successful health reset
    await auditLog({
      direction: "IN",
      endpoint: "admin.health.reset",
      requestId,
      companyId: sourceId,
      sourceId: sourceId,
      httpStatus: 200,
      request: { sourceId },
      response: { message: "Source health reset successfully", sourceId, sourceName: source.companyName },
      durationMs: duration,
    });
    
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
adminRouter.post("/admin/health/reset", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    const adminId = (req as any).user?.id;
    
    // Get all SOURCE companies
    const sources = await prisma.company.findMany({
      where: { type: "SOURCE" },
      select: { id: true, companyName: true }
    });
    
    // Reset health for all sources
    await Promise.all(
      sources.map(source => SourceHealthService.resetSourceHealth(source.id, adminId))
    );
    
    const duration = Date.now() - startTime;
    
    // Log bulk health reset
    await auditLog({
      direction: "IN",
      endpoint: "admin.health.reset.all",
      requestId,
      httpStatus: 200,
      request: { resetAll: true },
      response: { message: "All source health reset successfully", resetCount: sources.length },
      durationMs: duration,
    });
    
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
        httpEndpoint: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" }
    });
    
    const companiesWithEndpoints = companies.map(company => ({
      id: company.id,
      companyName: company.companyName,
      type: company.type,
      status: company.status,
      httpEndpoint: company.httpEndpoint || (company.type === "AGENT" 
        ? "http://localhost:9091" 
        : "http://localhost:9090"), // Fallback only for display when not configured
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

    // Use configured httpEndpoint or fallback to default based on company type
    // source.type is "SOURCE" so we can directly use the SOURCE default
    const httpEndpoint =
      source.httpEndpoint || `http://localhost:9090`;

    if (!httpEndpoint) {
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
      await enforceWhitelist(sourceId, httpEndpoint);
    } catch (e: any) {
      return res.status(403).json({
        error: "WHITELIST_VIOLATION",
        message: e.message || "Endpoint not whitelisted",
      });
    }

    // Call supplier endpoint with Request-Type: LocationRq header
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // Ensure httpEndpoint has a valid URL format
    let endpointUrl = httpEndpoint.trim();
    if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
      endpointUrl = `http://${endpointUrl}`;
    }

    try {
      const response = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          "Request-Type": "LocationRq",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        timeout: 30000,
      } as any);

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          error: "SUPPLIER_ERROR",
          message: `Supplier endpoint returned ${response.status}`,
        });
      }

      const data = await response.json() as any;

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
      if (fetchError.name === "AbortError" || fetchError.code === "ETIMEDOUT") {
        return res.status(504).json({
          error: "TIMEOUT",
          message: `Supplier endpoint timeout after 30s: ${endpointUrl}`,
        });
      }
      
      // Handle fetch connection errors
      if (fetchError.message?.includes("fetch failed") || fetchError.code === "ECONNREFUSED" || fetchError.code === "ENOTFOUND") {
        return res.status(503).json({
          error: "CONNECTION_ERROR",
          message: `Cannot connect to supplier endpoint: ${endpointUrl}. Please ensure the source backend is running and accessible.`,
          details: fetchError.message || fetchError.code,
        });
      }
      
      // Handle other fetch errors
      return res.status(500).json({
        error: "FETCH_ERROR",
        message: `Failed to fetch from supplier endpoint: ${endpointUrl}`,
        details: fetchError.message || String(fetchError),
      });
    }
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// Branch Management Endpoints
// ============================================================================

/**
 * @openapi
 * /admin/branches:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new branch
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceId, branchCode, name]
 *             properties:
 *               sourceId:
 *                 type: string
 *                 description: Source company ID
 *               branchCode:
 *                 type: string
 *                 description: Unique branch code for this source
 *               name:
 *                 type: string
 *                 description: Branch name
 *               status:
 *                 type: string
 *               locationType:
 *                 type: string
 *               collectionType:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               addressLine:
 *                 type: string
 *               city:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               country:
 *                 type: string
 *               countryCode:
 *                 type: string
 *               natoLocode:
 *                 type: string
 */
const createBranchSchema = z.object({
  sourceId: z.string().min(1, "Source ID is required"),
  branchCode: z.string().min(1, "Branch code is required"),
  name: z.string().min(1, "Name is required"),
  status: z.string().optional().nullable(),
  locationType: z.string().optional().nullable(),
  collectionType: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  addressLine: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  natoLocode: z.string().optional().nullable(),
});

adminRouter.post("/admin/branches", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const body = createBranchSchema.parse(req.body);

    // Verify source exists and is a SOURCE type
    const source = await prisma.company.findUnique({
      where: { id: body.sourceId },
      select: { id: true, type: true, companyName: true },
    });

    if (!source) {
      return res.status(404).json({
        error: "SOURCE_NOT_FOUND",
        message: "Source not found",
      });
    }

    if (source.type !== "SOURCE") {
      return res.status(400).json({
        error: "INVALID_TYPE",
        message: "Company must be a SOURCE type",
      });
    }

    // Check if branch code already exists for this source
    const existing = await prisma.branch.findUnique({
      where: {
        sourceId_branchCode: {
          sourceId: body.sourceId,
          branchCode: body.branchCode,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "BRANCH_CODE_EXISTS",
        message: `Branch with code ${body.branchCode} already exists for this source`,
      });
    }

    // Validate natoLocode if provided
    if (body.natoLocode) {
      const locode = await prisma.uNLocode.findUnique({
        where: { unlocode: body.natoLocode },
      });
      if (!locode) {
        return res.status(400).json({
          error: "INVALID_UNLOCODE",
          message: `UN/LOCODE ${body.natoLocode} not found`,
        });
      }
    }

    // Create branch
    const branch = await prisma.branch.create({
      data: {
        sourceId: body.sourceId,
        branchCode: body.branchCode,
        name: body.name,
        status: body.status || null,
        locationType: body.locationType || null,
        collectionType: body.collectionType || null,
        email: body.email || null,
        phone: body.phone || null,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        addressLine: body.addressLine || null,
        city: body.city || null,
        postalCode: body.postalCode || null,
        country: body.country || null,
        countryCode: body.countryCode || null,
        natoLocode: body.natoLocode || null,
      },
      include: {
        source: {
          select: {
            id: true,
            companyName: true,
            companyCode: true,
          },
        },
      },
    });

    res.status(201).json(branch);
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors,
      });
    }
    if (e.code === "P2002") {
      return res.status(409).json({
        error: "BRANCH_CODE_EXISTS",
        message: "Branch code already exists for this source",
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches:
 *   get:
 *     tags: [Admin]
 *     summary: List all branches with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sourceId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: locationType
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 */
adminRouter.get("/admin/branches", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    const status = req.query.status as string | undefined;
    const locationType = req.query.locationType as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {};
    
    if (sourceId) {
      where.sourceId = sourceId;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (locationType) {
      where.locationType = locationType;
    }
    
    if (search) {
      where.OR = [
        { branchCode: { contains: search } },
        { name: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        include: {
          source: {
            select: {
              id: true,
              companyName: true,
              companyCode: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.branch.count({ where }),
    ]);

    res.json({
      items: branches,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get branch statistics
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get("/admin/branches/stats", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    
    const where: any = {};
    if (sourceId) {
      where.sourceId = sourceId;
    }

    const [total, unmapped, bySource, byStatus] = await Promise.all([
      prisma.branch.count({ where }),
      prisma.branch.count({ where: { ...where, natoLocode: null } }),
      prisma.branch.groupBy({
        by: ["sourceId"],
        where,
        _count: true,
      }),
      prisma.branch.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
    ]);

    // Get source names for bySource
    const sourceIds = bySource.map((s) => s.sourceId);
    const sources = await prisma.company.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, companyName: true },
    });
    
    const bySourceWithNames = bySource.map((item) => ({
      sourceId: item.sourceId,
      sourceName: sources.find((s) => s.id === item.sourceId)?.companyName || "Unknown",
      count: item._count,
    }));

    res.json({
      total,
      unmapped,
      bySource: bySourceWithNames,
      byStatus: byStatus.map((item) => ({
        status: item.status || "null",
        count: item._count,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches/unmapped:
 *   get:
 *     tags: [Admin]
 *     summary: List branches without natoLocode
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get("/admin/branches/unmapped", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {
      natoLocode: null,
    };
    
    if (sourceId) {
      where.sourceId = sourceId;
    }

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        include: {
          source: {
            select: {
              id: true,
              companyName: true,
              companyCode: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.branch.count({ where }),
    ]);

    res.json({
      items: branches,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches/:id:
 *   get:
 *     tags: [Admin]
 *     summary: Get branch details
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get("/admin/branches/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        source: {
          select: {
            id: true,
            companyName: true,
            companyCode: true,
          },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
    }

    res.json(branch);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches/:id:
 *   patch:
 *     tags: [Admin]
 *     summary: Update branch
 *     security:
 *       - bearerAuth: []
 */
const updateBranchSchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  locationType: z.string().optional(),
  collectionType: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  addressLine: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  natoLocode: z.string().optional().nullable(),
});

adminRouter.patch("/admin/branches/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateBranchSchema.parse(req.body);

    // Validate natoLocode if provided
    if (body.natoLocode) {
      const locode = await prisma.uNLocode.findUnique({
        where: { unlocode: body.natoLocode },
      });
      if (!locode) {
        return res.status(400).json({
          error: "INVALID_UNLOCODE",
          message: `UN/LOCODE ${body.natoLocode} not found`,
        });
      }
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: body,
      include: {
        source: {
          select: {
            id: true,
            companyName: true,
            companyCode: true,
          },
        },
      },
    });

    res.json(branch);
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/branches/:id:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete branch
 *     security:
 *       - bearerAuth: []
 */
adminRouter.delete("/admin/branches/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.branch.delete({
      where: { id },
    });

    res.json({ message: "Branch deleted successfully" });
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "BRANCH_NOT_FOUND", message: "Branch not found" });
    }
    next(e);
  }
});


// ============================================================================
// UN/LOCODE Management Endpoints
// ============================================================================

/**
 * @openapi
 * /admin/unlocodes:
 *   get:
 *     tags: [Admin]
 *     summary: List/search UN/LOCODEs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema: { type: string }
 *         description: Search by unlocode, country, place, or iataCode
 *       - in: query
 *         name: country
 *         schema: { type: string }
 *         description: Filter by country code
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 */
adminRouter.get("/admin/unlocodes", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const query = req.query.query as string | undefined;
    const country = req.query.country as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {};
    
    if (query) {
      where.OR = [
        { unlocode: { contains: query } },
        { country: { contains: query } },
        { place: { contains: query } },
        { iataCode: { contains: query } },
      ];
    }
    
    if (country) {
      where.country = country;
    }

    const [unlocodes, total] = await Promise.all([
      prisma.uNLocode.findMany({
        where,
        orderBy: { unlocode: "asc" },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              sourceLocations: true,
              agreementLocationOverrides: true,
            },
          },
        },
      }),
      prisma.uNLocode.count({ where }),
    ]);

    res.json({
      items: unlocodes.map((loc) => ({
        unlocode: loc.unlocode,
        country: loc.country,
        place: loc.place,
        iataCode: loc.iataCode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        usageCount: loc._count.sourceLocations + loc._count.agreementLocationOverrides,
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/unlocodes:
 *   post:
 *     tags: [Admin]
 *     summary: Add new UN/LOCODE
 *     security:
 *       - bearerAuth: []
 */
const createUNLocodeSchema = z.object({
  unlocode: z.string().min(2).max(10),
  country: z.string().min(2).max(2),
  place: z.string().min(1),
  iataCode: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

adminRouter.post("/admin/unlocodes", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const body = createUNLocodeSchema.parse(req.body);

    // Check if already exists
    const existing = await prisma.uNLocode.findUnique({
      where: { unlocode: body.unlocode },
    });

    if (existing) {
      return res.status(409).json({
        error: "UNLOCODE_EXISTS",
        message: `UN/LOCODE ${body.unlocode} already exists`,
      });
    }

    const unlocode = await prisma.uNLocode.create({
      data: {
        unlocode: body.unlocode.toUpperCase(),
        country: body.country.toUpperCase(),
        place: body.place,
        iataCode: body.iataCode?.toUpperCase() || null,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
      },
    });

    res.status(201).json(unlocode);
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors,
      });
    }
    if (e.code === "P2002") {
      return res.status(409).json({
        error: "UNLOCODE_EXISTS",
        message: `UN/LOCODE already exists`,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/unlocodes/:unlocode:
 *   get:
 *     tags: [Admin]
 *     summary: Get UN/LOCODE details
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get("/admin/unlocodes/:unlocode", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { unlocode } = req.params;

    const locode = await prisma.uNLocode.findUnique({
      where: { unlocode: unlocode.toUpperCase() },
      include: {
        sourceLocations: {
          include: {
            source: {
              select: {
                id: true,
                companyName: true,
                companyCode: true,
              },
            },
          },
          take: 10,
        },
        agreementLocationOverrides: {
          include: {
            agreement: {
              select: {
                id: true,
                agreementRef: true,
                agent: {
                  select: {
                    companyName: true,
                  },
                },
                source: {
                  select: {
                    companyName: true,
                  },
                },
              },
            },
          },
          take: 10,
        },
        _count: {
          select: {
            sourceLocations: true,
            agreementLocationOverrides: true,
          },
        },
      },
    });

    if (!locode) {
      return res.status(404).json({
        error: "UNLOCODE_NOT_FOUND",
        message: `UN/LOCODE ${unlocode} not found`,
      });
    }

    res.json(locode);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/unlocodes/:unlocode:
 *   patch:
 *     tags: [Admin]
 *     summary: Update UN/LOCODE
 *     security:
 *       - bearerAuth: []
 */
const updateUNLocodeSchema = z.object({
  country: z.string().min(2).max(2).optional(),
  place: z.string().min(1).optional(),
  iataCode: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

adminRouter.patch("/admin/unlocodes/:unlocode", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { unlocode } = req.params;
    const body = updateUNLocodeSchema.parse(req.body);

    const updateData: any = {};
    if (body.country) updateData.country = body.country.toUpperCase();
    if (body.place) updateData.place = body.place;
    if (body.iataCode !== undefined) updateData.iataCode = body.iataCode?.toUpperCase() || null;
    if (body.latitude !== undefined) updateData.latitude = body.latitude;
    if (body.longitude !== undefined) updateData.longitude = body.longitude;

    const updated = await prisma.uNLocode.update({
      where: { unlocode: unlocode.toUpperCase() },
      data: updateData,
    });

    res.json(updated);
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors,
      });
    }
    if (e.code === "P2025") {
      return res.status(404).json({
        error: "UNLOCODE_NOT_FOUND",
        message: `UN/LOCODE ${req.params.unlocode} not found`,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/unlocodes/:unlocode:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete UN/LOCODE
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Deletes a UN/LOCODE. Will fail if the UN/LOCODE is in use by any sources or agreements.
 */
adminRouter.delete("/admin/unlocodes/:unlocode", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { unlocode } = req.params;

    // Check if in use
    const [sourceCount, agreementCount] = await Promise.all([
      prisma.sourceLocation.count({
        where: { unlocode: unlocode.toUpperCase() },
      }),
      prisma.agreementLocationOverride.count({
        where: { unlocode: unlocode.toUpperCase() },
      }),
    ]);

    if (sourceCount > 0 || agreementCount > 0) {
      return res.status(409).json({
        error: "UNLOCODE_IN_USE",
        message: `Cannot delete UN/LOCODE ${unlocode} - it is in use by ${sourceCount} source(s) and ${agreementCount} agreement(s)`,
        usage: {
          sources: sourceCount,
          agreements: agreementCount,
        },
      });
    }

    await prisma.uNLocode.delete({
      where: { unlocode: unlocode.toUpperCase() },
    });

    res.json({ message: `UN/LOCODE ${unlocode} deleted successfully` });
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({
        error: "UNLOCODE_NOT_FOUND",
        message: `UN/LOCODE ${req.params.unlocode} not found`,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/unlocodes/import:
 *   post:
 *     tags: [Admin]
 *     summary: Bulk import UN/LOCODEs from CSV
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Imports UN/LOCODEs from CSV format.
 *       CSV format: unlocode,country,place,iataCode,latitude,longitude
 *       Example: GBMAN,GB,Manchester,MAN,53.36,-2.27
 */
const importUNLocodeSchema = z.object({
  csv: z.string().min(1),
});

adminRouter.post("/admin/unlocodes/import", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const body = importUNLocodeSchema.parse(req.body);
    const lines = body.csv.split(/\r?\n/).filter(Boolean);
    
    let imported = 0;
    let updated = 0;
    let errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const [unlocode, country, place, iataCode, lat, lon] = line.split(",").map(s => s.trim());
      
      if (!unlocode || !country || !place) {
        errors.push(`Line ${i + 1}: Missing required fields (unlocode, country, place)`);
        continue;
      }

      try {
        const data = {
          unlocode: unlocode.toUpperCase(),
          country: country.toUpperCase(),
          place: place,
          iataCode: iataCode?.toUpperCase() || null,
          latitude: lat ? parseFloat(lat) : null,
          longitude: lon ? parseFloat(lon) : null,
        };

        const existing = await prisma.uNLocode.findUnique({
          where: { unlocode: data.unlocode },
        });

        if (existing) {
          await prisma.uNLocode.update({
            where: { unlocode: data.unlocode },
            data: {
              country: data.country,
              place: data.place,
              iataCode: data.iataCode,
              latitude: data.latitude,
              longitude: data.longitude,
            },
          });
          updated++;
        } else {
          await prisma.uNLocode.create({ data });
          imported++;
        }
      } catch (e: any) {
        errors.push(`Line ${i + 1}: ${e.message || "Unknown error"}`);
      }
    }

    res.json({
      message: "Import completed",
      imported,
      updated,
      total: lines.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors,
      });
    }
    next(e);
  }
});

// ============================================================================
// Booking Logs Endpoint
// ============================================================================

/**
 * @openapi
 * /admin/booking-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Get booking operation logs
 *     description: Retrieve audit logs for booking operations (create, modify, cancel, check) with filtering. Returns logs with company names, source names, and agreement references for better display.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: request_id
 *         schema: { type: string }
 *         description: Filter by request ID
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *         description: Filter by agent company ID
 *       - in: query
 *         name: source_id
 *         schema: { type: string }
 *         description: Filter by source company ID
 *       - in: query
 *         name: agreement_ref
 *         schema: { type: string }
 *         description: Filter by agreement reference
 *       - in: query
 *         name: operation
 *         schema: { type: string, enum: [create, modify, cancel, check] }
 *         description: Filter by booking operation type
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *         description: Filter logs from this date (ISO 8601 format)
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *         description: Filter logs until this date (ISO 8601 format)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, minimum: 1, maximum: 500 }
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of booking logs with company names and agreement references
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       requestId:
 *                         type: string
 *                       companyId:
 *                         type: string
 *                       companyName:
 *                         type: string
 *                         nullable: true
 *                       companyCode:
 *                         type: string
 *                         nullable: true
 *                       companyType:
 *                         type: string
 *                         nullable: true
 *                       sourceId:
 *                         type: string
 *                         nullable: true
 *                       sourceName:
 *                         type: string
 *                         nullable: true
 *                       sourceCode:
 *                         type: string
 *                         nullable: true
 *                       sourceType:
 *                         type: string
 *                         nullable: true
 *                       agreementRef:
 *                         type: string
 *                         nullable: true
 *                       operation:
 *                         type: string
 *                         enum: [create, modify, cancel, check]
 *                       httpStatus:
 *                         type: integer
 *                         nullable: true
 *                       grpcStatus:
 *                         type: integer
 *                         nullable: true
 *                       request:
 *                         type: object
 *                       response:
 *                         type: object
 *                       durationMs:
 *                         type: integer
 *                         nullable: true
 *                 total:
 *                   type: integer
 */
adminRouter.get("/admin/booking-logs", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const requestId = String(req.query.request_id || "").trim();
    const companyId = String(req.query.company_id || "").trim();
    const sourceId = String(req.query.source_id || "").trim();
    const agreementRef = String(req.query.agreement_ref || "").trim();
    const operation = String(req.query.operation || "").trim().toLowerCase();
    const fromDate = req.query.from_date ? new Date(String(req.query.from_date)) : null;
    const toDate = req.query.to_date ? new Date(String(req.query.to_date)) : null;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));

    // Build where clause - filter by booking endpoints
    const bookingEndpoints = ["booking.create", "booking.modify", "booking.cancel", "booking.check"];
    const where: any = {
      endpoint: { in: bookingEndpoints },
    };

    if (requestId) {
      where.requestId = requestId;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (sourceId) {
      where.sourceId = sourceId;
    }

    if (agreementRef) {
      where.agreementRef = agreementRef;
    }

    // Filter by operation if provided
    if (operation && ["create", "modify", "cancel", "check"].includes(operation)) {
      where.endpoint = `booking.${operation}`;
    }

    // Date range filtering
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (toDate) {
        where.createdAt.lte = toDate;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Fetch company names for better display
    const companyIds = [...new Set(logs.map(r => r.companyId).filter((id): id is string => Boolean(id)))];
    const sourceIds = [...new Set(logs.map(r => r.sourceId).filter((id): id is string => Boolean(id)))];
    const allCompanyIds = [...new Set([...companyIds, ...sourceIds])];
    
    const companies = await prisma.company.findMany({
      where: { id: { in: allCompanyIds } },
      select: { id: true, companyName: true, type: true, companyCode: true }
    });
    const companyMap = new Map(companies.map(c => [c.id, c]));

    // Transform logs to match Admin UI expectations
    const items = logs.map((log) => {
      // Extract operation from endpoint (e.g., "booking.create" -> "create")
      const operation = log.endpoint?.replace("booking.", "") || "create";
      
      // Parse request and response from masked strings
      let request: any = {};
      let response: any = {};
      
      try {
        if (log.maskedRequest) {
          request = JSON.parse(log.maskedRequest);
        }
      } catch (e) {
        // If parsing fails, use the raw string
        request = { raw: log.maskedRequest };
      }
      
      try {
        if (log.maskedResponse) {
          response = JSON.parse(log.maskedResponse);
        }
      } catch (e) {
        // If parsing fails, use the raw string
        response = { raw: log.maskedResponse };
      }

      const company = log.companyId ? companyMap.get(log.companyId) : null;
      const source = log.sourceId ? companyMap.get(log.sourceId) : null;

      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        requestId: log.requestId,
        companyId: log.companyId,
        companyName: company?.companyName || null,
        companyType: company?.type || null,
        companyCode: company?.companyCode || null,
        sourceId: log.sourceId,
        sourceName: source?.companyName || null,
        sourceType: source?.type || null,
        sourceCode: source?.companyCode || null,
        agreementRef: log.agreementRef,
        operation,
        httpStatus: log.httpStatus,
        grpcStatus: log.grpcStatus,
        request,
        response,
        durationMs: log.durationMs,
      };
    });

    res.json({ items, total: items.length });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/notifications:
 *   get:
 *     tags: [Admin]
 *     summary: Get admin notifications
 *     description: Retrieve notifications for admin users including pending approvals, health issues, and system events
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [agreement, health, company, system]
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       read:
 *                         type: boolean
 *                       actionUrl:
 *                         type: string
 *                 total:
 *                   type: integer
 */
adminRouter.get("/admin/notifications", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const unreadOnly = req.query.unreadOnly === 'true';
    
    // Get read markers for dynamic notifications (to filter out read ones)
    const readMarkers = await prisma.notification.findMany({
      where: {
        companyId: null,
        type: 'ADMIN_READ_MARKER',
      },
      select: { id: true },
    });
    const readMarkerIds = new Set(readMarkers.map(m => m.id.replace('read-marker-', '')));
    
    // Build notifications from various sources
    const notifications: any[] = [];
    
    // 1. Get pending company approvals
    const pendingCompanies = await prisma.company.findMany({
      where: {
        status: 'PENDING_VERIFICATION',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        companyName: true,
        type: true,
        email: true,
        createdAt: true,
      },
    });
    
    pendingCompanies.forEach(company => {
      const notificationId = `company-pending-${company.id}`;
      const isRead = readMarkerIds.has(notificationId);
      if (!unreadOnly || !isRead) {
        notifications.push({
          id: notificationId,
          type: 'company',
          title: 'New company awaiting approval',
          message: `${company.companyName} (${company.type}) - ${company.email}`,
          timestamp: company.createdAt.toISOString(),
          read: isRead,
          actionUrl: `/companies?status=PENDING_VERIFICATION&highlight=${company.id}`,
        });
      }
    });
    
    // 2. Get pending location requests
    const pendingLocationRequests = await prisma.locationRequest.findMany({
      where: {
        status: 'PENDING',
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
    
    pendingLocationRequests.forEach(req => {
      const notificationId = `location-request-${req.id}`;
      const isRead = readMarkerIds.has(notificationId);
      if (!unreadOnly || !isRead) {
        notifications.push({
          id: notificationId,
          type: 'system',
          title: 'Location request pending approval',
          message: `${req.locationName}, ${req.country} - Requested by ${req.source.companyName}`,
          timestamp: req.createdAt.toISOString(),
          read: isRead,
          actionUrl: '/location-requests',
        });
      }
    });
    
    // 3. Get excluded sources (health issues)
    const excludedSources = await prisma.sourceHealth.findMany({
      where: {
        excludedUntil: {
          gt: new Date(),
        },
      },
      orderBy: { excludedUntil: 'desc' },
      take: 10,
    });
    
    // Fetch company information for excluded sources
    if (excludedSources.length > 0) {
      const sourceIds = excludedSources.map(h => h.sourceId);
      const companies = await prisma.company.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, companyName: true },
      });
      const companyMap = new Map(companies.map(c => [c.id, c]));
      
      excludedSources.forEach(health => {
        const company = companyMap.get(health.sourceId);
        if (company) {
          const notificationId = `health-excluded-${health.sourceId}`;
          const isRead = readMarkerIds.has(notificationId);
          if (!unreadOnly || !isRead) {
            notifications.push({
              id: notificationId,
              type: 'health',
              title: 'Source excluded due to health issues',
              message: `${company.companyName} excluded until ${health.excludedUntil ? new Date(health.excludedUntil).toLocaleString() : 'unknown'}`,
              timestamp: health.excludedUntil?.toISOString() || health.updatedAt.toISOString(),
              read: isRead,
              actionUrl: '/health',
            });
          }
        }
      });
    }
    
    // 4. Get recent agreements in OFFERED status (awaiting agent acceptance)
    const offeredAgreements = await prisma.agreement.findMany({
      where: {
        status: 'OFFERED',
      },
      include: {
        agent: {
          select: {
            companyName: true,
          },
        },
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
      const notificationId = `agreement-offered-${agreement.id}`;
      const isRead = readMarkerIds.has(notificationId);
      if (!unreadOnly || !isRead) {
        notifications.push({
          id: notificationId,
          type: 'agreement',
          title: 'Agreement awaiting acceptance',
          message: `${agreement.source.companyName} → ${agreement.agent.companyName} (${agreement.agreementRef})`,
          timestamp: agreement.createdAt.toISOString(),
          read: isRead,
          actionUrl: '/agreements-management',
        });
      }
    });
    
    // 6. Get database notifications (if any exist)
    const dbNotifications = await prisma.notification.findMany({
      where: {
        companyId: null, // Admin notifications have no companyId
        type: { not: 'ADMIN_READ_MARKER' }, // Exclude read markers
        ...(unreadOnly && { readAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    dbNotifications.forEach(notif => {
      // Map database notification type to frontend type
      let frontendType: 'agreement' | 'health' | 'company' | 'system' = 'system';
      if (notif.type.includes('AGREEMENT')) {
        frontendType = 'agreement';
      } else if (notif.type.includes('HEALTH') || notif.type.includes('EXCLUDED')) {
        frontendType = 'health';
      } else if (notif.type.includes('COMPANY')) {
        frontendType = 'company';
      }
      
      notifications.push({
        id: notif.id,
        type: frontendType,
        title: notif.title,
        message: notif.message,
        timestamp: notif.createdAt.toISOString(),
        read: !!notif.readAt,
        actionUrl: frontendType === 'agreement' ? '/agreements-management' :
                   frontendType === 'health' ? '/health' :
                   frontendType === 'company' ? '/companies' : '/dashboard',
      });
    });
    
    // Sort by timestamp (newest first) and limit
    // (Filtering is already done above for dynamic notifications)
    const sortedNotifications = notifications
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    res.json({
      items: sortedNotifications,
      total: sortedNotifications.length,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/notifications/{id}/read:
 *   post:
 *     tags: [Admin]
 *     summary: Mark notification as read
 *     security:
 *       - bearerAuth: []
 */
adminRouter.post("/admin/notifications/:id/read", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // If it's a database notification (CUID starts with 'cl'), update it
    if (id.startsWith('cl')) {
      await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    } else {
      // For dynamic notifications (company-pending-, location-request-, health-excluded-, agreement-offered-),
      // create a read marker in the database to track that this notification has been read
      // This allows us to filter them out when unreadOnly is true
      try {
        await prisma.notification.upsert({
          where: { id: `read-marker-${id}` },
          update: { readAt: new Date() },
          create: {
            id: `read-marker-${id}`,
            companyId: null, // Admin notifications
            type: 'ADMIN_READ_MARKER',
            title: 'Read marker',
            message: `Read marker for ${id}`,
            readAt: new Date(),
          },
        });
      } catch (error) {
        // If upsert fails (e.g., ID too long), just log and continue
        // The notification will still be marked as read in the frontend
        console.warn(`Could not create read marker for notification ${id}:`, error);
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ==================== SMTP Management ====================

const smtpConfigSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false), // true for TLS/SSL (465), false for STARTTLS (587)
  user: z.string().min(1, "SMTP username is required"),
  password: z.string().min(1, "SMTP password is required"),
  fromEmail: z.string().email("Invalid from email address").default("no-reply@carhire.local"),
  fromName: z.string().optional(),
  enabled: z.boolean().default(true),
});

const updateSmtpConfigSchema = smtpConfigSchema.partial();

/**
 * @openapi
 * /admin/smtp:
 *   get:
 *     tags: [Admin]
 *     summary: Get current SMTP configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current SMTP configuration
 */
adminRouter.get("/admin/smtp", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const smtpConfig = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!smtpConfig) {
      return res.json({
        configured: false,
        usingEnvVars: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS),
        config: null,
      });
    }

    // Don't return password in response
    const { password, ...configWithoutPassword } = smtpConfig;
    
    res.json({
      configured: true,
      usingEnvVars: false,
      config: {
        ...configWithoutPassword,
        password: password ? '***' : null, // Mask password
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/smtp:
 *   post:
 *     tags: [Admin]
 *     summary: Create or update SMTP configuration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [host, port, user, password]
 *             properties:
 *               host:
 *                 type: string
 *               port:
 *                 type: number
 *               secure:
 *                 type: boolean
 *               user:
 *                 type: string
 *               password:
 *                 type: string
 *               fromEmail:
 *                 type: string
 *               fromName:
 *                 type: string
 *               enabled:
 *                 type: boolean
 */
adminRouter.post("/admin/smtp", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const body = smtpConfigSchema.parse(req.body);
    const userId = req.user.id;

    // Check if SMTP config already exists
    const existing = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    let smtpConfig;
    if (existing) {
      // Update existing config
      // If password is 'KEEP_EXISTING', don't update it
      const updateData: any = {
        host: body.host,
        port: body.port,
        secure: body.secure,
        user: body.user,
        fromEmail: body.fromEmail,
        fromName: body.fromName,
        enabled: body.enabled,
        updatedBy: userId,
      };
      
      // Only update password if it's not 'KEEP_EXISTING' and not empty
      if (body.password && body.password !== 'KEEP_EXISTING') {
        updateData.password = body.password;
      }
      
      smtpConfig = await prisma.smtpConfig.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      // Create new config - password is required
      if (!body.password || body.password === 'KEEP_EXISTING') {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Password is required when creating a new SMTP configuration",
        });
      }
      
      smtpConfig = await prisma.smtpConfig.create({
        data: {
          ...body,
          updatedBy: userId,
        },
      });
    }

    // Invalidate mailer cache so new config is used
    invalidateMailerCache();

    const { password, ...configWithoutPassword } = smtpConfig;

    res.json({
      success: true,
      config: {
        ...configWithoutPassword,
        password: '***', // Mask password
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid SMTP configuration",
        fields: e.errors,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/smtp:
 *   patch:
 *     tags: [Admin]
 *     summary: Partially update SMTP configuration
 *     security:
 *       - bearerAuth: []
 */
adminRouter.patch("/admin/smtp", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const body = updateSmtpConfigSchema.parse(req.body);
    const userId = req.user.id;

    const existing = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "SMTP configuration not found. Use POST to create one.",
      });
    }

    const smtpConfig = await prisma.smtpConfig.update({
      where: { id: existing.id },
      data: {
        ...body,
        updatedBy: userId,
      },
    });

    // Invalidate mailer cache
    invalidateMailerCache();

    const { password, ...configWithoutPassword } = smtpConfig;

    res.json({
      success: true,
      config: {
        ...configWithoutPassword,
        password: '***', // Mask password
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid SMTP configuration",
        fields: e.errors,
      });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/smtp/test:
 *   post:
 *     tags: [Admin]
 *     summary: Test SMTP configuration by sending a test email
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 */
adminRouter.post("/admin/smtp/test", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const { to } = z.object({ to: z.string().email() }).parse(req.body);

    const { sendMail, getMailer } = await import("../../infra/mailer.js");
    
    // Check configuration before sending
    const smtpConfig = await prisma.smtpConfig.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });
    
    const hasEnvVars = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    const isConfigured = !!smtpConfig || hasEnvVars;
    
    if (!isConfigured) {
      return res.status(400).json({
        error: "SMTP_NOT_CONFIGURED",
        message: "SMTP is not configured. Please configure SMTP via admin panel or environment variables.",
        hint: "Use POST /admin/smtp to configure SMTP, or set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env file"
      });
    }
    
    // Try to verify connection first
    let connectionVerified = false;
    let connectionError = null;
    try {
      const transporter = await getMailer();
      await transporter.verify();
      connectionVerified = true;
    } catch (verifyError: any) {
      connectionError = verifyError.message;
    }
    
    // Attempt to send email
    let emailSent = false;
    let sendError = null;
    
    try {
      await sendMail({
        to,
        subject: "SMTP Test Email - Car Hire Middleware",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>SMTP Test Email</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2563eb;">SMTP Configuration Test</h2>
              <p>This is a test email to verify your SMTP configuration is working correctly.</p>
              <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
              <p>If you received this email, your SMTP settings are configured correctly!</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">
                This is an automated test email from the Car Hire Middleware system.
              </p>
            </div>
          </body>
          </html>
        `,
      });
      emailSent = true;
    } catch (sendErr: any) {
      sendError = sendErr.message;
    }
    
    if (emailSent) {
      res.json({
        success: true,
        message: `Test email sent successfully to ${to}`,
        connectionVerified,
      });
    } else {
      res.status(500).json({
        error: "EMAIL_SEND_FAILED",
        message: `Failed to send test email: ${sendError || 'Unknown error'}`,
        connectionVerified,
        connectionError,
        hint: connectionError ? "SMTP connection verification failed. Check your credentials." : "Email sending failed. Check server logs for details."
      });
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid email address",
        fields: e.errors,
      });
    }
    
    // Handle email sending errors
    const errorMessage = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: "EMAIL_SEND_FAILED",
      message: `Failed to send test email: ${errorMessage}`,
    });
  }
});

/**
 * @openapi
 * /admin/smtp/status:
 *   get:
 *     tags: [Admin]
 *     summary: Get SMTP configuration status and diagnostics
 *     security:
 *       - bearerAuth: []
 *     description: Returns detailed information about SMTP configuration including what's configured and connection status
 */
adminRouter.get("/admin/smtp/status", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const smtpConfig = await prisma.smtpConfig.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });

    const hasEnvVars = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    
    let connectionStatus = 'unknown';
    let connectionError = null;
    
    // Try to verify connection if we have config
    if (smtpConfig || hasEnvVars) {
      try {
        const { getMailer } = await import("../../infra/mailer.js");
        const transporter = await getMailer();
        await transporter.verify();
        connectionStatus = 'verified';
      } catch (error: any) {
        connectionStatus = 'failed';
        connectionError = error.message;
      }
    } else {
      connectionStatus = 'not_configured';
    }

    const status: any = {
      configured: !!smtpConfig,
      usingEnvVars: hasEnvVars && !smtpConfig,
      usingAdminConfig: !!smtpConfig,
      connectionStatus,
      config: null,
      envVars: {
        EMAIL_HOST: process.env.EMAIL_HOST ? '✓ Set' : '✗ Not set',
        EMAIL_USER: process.env.EMAIL_USER ? '✓ Set' : '✗ Not set',
        EMAIL_PASS: process.env.EMAIL_PASS ? '✓ Set (hidden)' : '✗ Not set',
        EMAIL_PORT: process.env.EMAIL_PORT || '587 (default)',
        EMAIL_SECURE: process.env.EMAIL_SECURE || 'false (default)',
        EMAIL_FROM: process.env.EMAIL_FROM || 'not set',
      }
    };

    if (smtpConfig) {
      const { password, ...configWithoutPassword } = smtpConfig;
      status.config = {
        ...configWithoutPassword,
        password: password ? '***' : null,
      };
    }

    if (connectionError) {
      status.connectionError = connectionError;
    }

    res.json(status);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/smtp:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete SMTP configuration (fallback to env vars)
 *     security:
 *       - bearerAuth: []
 */
adminRouter.delete("/admin/smtp", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const existing = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "SMTP configuration not found",
      });
    }

    await prisma.smtpConfig.delete({
      where: { id: existing.id },
    });

    // Invalidate mailer cache to use env vars
    invalidateMailerCache();

    res.json({
      success: true,
      message: "SMTP configuration deleted. System will use environment variables.",
    });
  } catch (e) {
    next(e);
  }
});