import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType, requireRole } from "../../infra/policies.js";
import { locationClient } from "../../grpc/clients/location.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { LocationsService } from "../../services/locations.js";
import { auditLog } from "../../services/audit.js";

export const locationsRouter = Router();
// Alias to support UI requirement: /locations/by-agreement/:agreementId
locationsRouter.get("/locations/by-agreement/:agreementId", requireAuth(), async (req, res, next) => {
  try {
    const client = locationClient();
    client.ListCoverageByAgreement(
      { agreement_id: String(req.params.agreementId) },
      metaFromReq(req),
      (err: any, resp: any) => (err ? next(err) : res.json(resp))
    );
  } catch (e) { next(e); }
});

// Per-spec: GET /agreements/:id/locations
locationsRouter.get("/agreements/:id/locations", requireAuth(), async (req: any, res, next) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "BAD_REQUEST", message: "Agreement id is required" });
    const ag = await prisma.agreement.findUnique({ where: { id }, select: { id: true } });
    if (!ag) return res.status(404).json({ error: "NOT_FOUND", message: "Agreement not found" });
    const out = await LocationsService.getAgreementLocations(id);
    res.json(out);
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /locations:
 *   get:
 *     tags: [Locations]
 *     summary: List/search UN/LOCODE entries (paged)
 *     parameters:
 *       - in: query
 *         name: query
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 */
locationsRouter.get("/locations", requireAuth(), async (req, res, next) => {
  try {
    const client = locationClient();
    client.ListUNLocodes(
      { query: String(req.query.query || ""), limit: Number(req.query.limit || 25), cursor: String(req.query.cursor || "") },
      metaFromReq(req),
      (err: any, resp: any) => err ? next(err) : res.json(resp)
    );
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /coverage/source/{sourceId}:
 *   get:
 *     tags: [Locations]
 *     summary: View a Source's coverage (from last sync)
 */
locationsRouter.get("/coverage/source/:sourceId", requireAuth(), requireCompanyType("ADMIN", "SOURCE", "AGENT"), async (req, res, next) => {
  try {
    const sourceId = String(req.params.sourceId || "").trim();
    if (!sourceId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Source ID is required" });
    }

    // Check if source exists and user has permission
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: { id: true, companyName: true, type: true, status: true }
    });

    if (!source) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Source not found" });
    }

    if (source.type !== "SOURCE") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Company is not a source" });
    }

    // Get pagination parameters
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const cursor = String(req.query.cursor || "");

    // Get source locations with UN/LOCODE details
    const whereClause = cursor ? { 
      sourceId, 
      unlocode: { gt: cursor } 
    } : { sourceId };

    const sourceLocations = await prisma.sourceLocation.findMany({
      where: whereClause,
      include: {
        loc: {
          select: {
            unlocode: true,
            country: true,
            place: true,
            iataCode: true,
            latitude: true,
            longitude: true
          }
        }
      },
      orderBy: { unlocode: "asc" },
      take: limit + 1
    });

    const hasMore = sourceLocations.length > limit;
    const items = sourceLocations.slice(0, limit).map(sl => ({
      unlocode: sl.unlocode,
      country: sl.loc.country,
      place: sl.loc.place,
      iata_code: sl.loc.iataCode || "",
      latitude: sl.loc.latitude || 0,
      longitude: sl.loc.longitude || 0,
      synced_at: sl.createdAt?.toISOString() || null
    }));

    const next_cursor = hasMore ? sourceLocations[limit].unlocode : "";

    res.json({
      source: {
        id: source.id,
        companyName: source.companyName,
        status: source.status
      },
      items,
      next_cursor,
      total: items.length,
      has_more: hasMore
    });

  } catch (e) { 
    next(e); 
  }
});

/**
 * @openapi
 * /coverage/source/{sourceId}/sync:
 *   post:
 *     tags: [Locations]
 *     summary: Sync Source coverage from supplier adapter (maps to UN/LOCODE)
 */
locationsRouter.post("/coverage/source/:sourceId/sync", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    
    // only allow a source to sync its own coverage
    const sourceId = String(req.params.sourceId || req.body?.source_id || "").trim();
    if (req.user.companyId !== sourceId) {
      // Log forbidden access
      await auditLog({
        direction: "IN",
        endpoint: "locations.sync",
        requestId,
        companyId: req.user.companyId,
        sourceId: sourceId,
        httpStatus: 403,
        request: { sourceId },
        response: { error: "FORBIDDEN", message: "Can only sync your own coverage" },
        durationMs: Date.now() - startTime,
      });
      
      return res.status(403).json({ error: "FORBIDDEN", message: "Can only sync your own coverage" });
    }
    
    const client = locationClient();
    client.SyncSourceCoverage({ source_id: sourceId }, metaFromReq(req), async (err: any, resp: any) => {
      const duration = Date.now() - startTime;
      
      if (err) {
        // Log sync error
        await auditLog({
          direction: "IN",
          endpoint: "locations.sync",
          requestId,
          companyId: sourceId,
          sourceId: sourceId,
          grpcStatus: err.code || 13,
          request: { sourceId },
          response: { error: err.message },
          durationMs: duration,
        });
        
        return next(err);
      }
      
      // Save sync timestamp to database
      try {
        await prisma.company.update({
          where: { id: sourceId },
          data: {
            lastLocationSyncAt: new Date(),
          },
        });
      } catch (error) {
        console.error('Failed to save location sync timestamp to database:', error);
        // Don't fail the request if saving fails
      }
      
      // Log successful sync
      await auditLog({
        direction: "IN",
        endpoint: "locations.sync",
        requestId,
        companyId: sourceId,
        sourceId: sourceId,
        httpStatus: 200,
        request: { sourceId },
        response: resp,
        durationMs: duration,
      });
      
      res.json(resp);
    });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /coverage/agreement/{agreementId}:
 *   get:
 *     tags: [Locations]
 *     summary: Effective coverage for an Agreement (base source coverage ∪ allow overrides − deny overrides)
 */
locationsRouter.get("/coverage/agreement/:agreementId", requireAuth(), async (req, res, next) => {
  try {
    const client = locationClient();
    client.ListCoverageByAgreement({ agreement_id: String(req.params.agreementId) }, metaFromReq(req), (err: any, resp: any) => err ? next(err) : res.json(resp));
  } catch (e) { next(e); }
});

const overrideSchema = z.object({ unlocode: z.string().min(3), allowed: z.boolean() });
/**
 * @openapi
 * /coverage/agreement/{agreementId}/override:
 *   post:
 *     tags: [Locations]
 *     summary: Upsert a per-agreement location override (allow or deny)
 */
locationsRouter.post("/coverage/agreement/:agreementId/override", requireAuth(), async (req, res, next) => {
  try {
    const body = overrideSchema.parse(req.body);
    const client = locationClient();
    client.UpsertAgreementOverride(
      { agreement_id: String(req.params.agreementId), unlocode: body.unlocode, allowed: body.allowed },
      metaFromReq(req),
      (err: any, resp: any) => err ? next(err) : res.json(resp)
    );
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /coverage/agreement/{agreementId}/override/{unlocode}:
 *   delete:
 *     tags: [Locations]
 *     summary: Remove a per-agreement override
 */
locationsRouter.delete("/coverage/agreement/:agreementId/override/:unlocode", requireAuth(), async (req, res, next) => {
  try {
    const client = locationClient();
    client.RemoveAgreementOverride(
      { agreement_id: String(req.params.agreementId), unlocode: String(req.params.unlocode) },
      metaFromReq(req),
      (err: any, resp: any) => err ? next(err) : res.json(resp)
    );
  } catch (e) { next(e); }
});

// ============================================================================
// Location Request Endpoints
// ============================================================================

/**
 * @openapi
 * /locations/request:
 *   post:
 *     tags: [Locations]
 *     summary: Submit location request
 *     security:
 *       - bearerAuth: []
 */
const locationRequestSchema = z.object({
  locationName: z.string().min(1),
  country: z.string().min(2),
  city: z.string().optional(),
  address: z.string().optional(),
  iataCode: z.string().optional(),
  reason: z.string().optional(),
});

locationsRouter.post("/locations/request", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const sourceId = req.user.companyId;
    const body = locationRequestSchema.parse(req.body);

    const request = await prisma.locationRequest.create({
      data: {
        sourceId,
        locationName: body.locationName,
        country: body.country,
        city: body.city || null,
        address: body.address || null,
        iataCode: body.iataCode || null,
        reason: body.reason || null,
        status: "PENDING",
      },
      include: {
        source: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    res.status(201).json(request);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /locations/requests:
 *   get:
 *     tags: [Locations]
 *     summary: List own location requests
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.get("/locations/requests", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const sourceId = req.user.companyId;
    const status = req.query.status as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = { sourceId };
    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      prisma.locationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.locationRequest.count({ where }),
    ]);

    res.json({
      items: requests,
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
 * /locations/requests/:id:
 *   get:
 *     tags: [Locations]
 *     summary: Get location request details
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.get("/locations/requests/:id", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const sourceId = req.user.companyId;

    const request = await prisma.locationRequest.findFirst({
      where: {
        id,
        sourceId, // Ensure request belongs to this source
      },
      include: {
        source: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Location request not found" });
    }

    res.json(request);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/locations/requests:
 *   get:
 *     tags: [Admin]
 *     summary: List all location requests
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.get("/admin/locations/requests", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sourceId = req.query.sourceId as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: any = {};
    if (sourceId) {
      where.sourceId = sourceId;
    }
    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      prisma.locationRequest.findMany({
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
      prisma.locationRequest.count({ where }),
    ]);

    res.json({
      items: requests,
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
 * /admin/locations/requests/:id:
 *   get:
 *     tags: [Admin]
 *     summary: Get location request details
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.get("/admin/locations/requests/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params;

    const request = await prisma.locationRequest.findUnique({
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

    if (!request) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Location request not found" });
    }

    res.json(request);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /admin/locations/requests/:id:
 *   patch:
 *     tags: [Admin]
 *     summary: Update location request (approve/reject)
 *     security:
 *       - bearerAuth: []
 */
const updateLocationRequestSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  adminNotes: z.string().optional().nullable(),
});

locationsRouter.patch("/admin/locations/requests/:id", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const body = updateLocationRequestSchema.parse(req.body);
    const adminUserId = req.user.id;

    const updateData: any = {};
    if (body.status) {
      updateData.status = body.status;
      if (body.status === "APPROVED" || body.status === "REJECTED") {
        updateData.reviewedBy = adminUserId;
        updateData.reviewedAt = new Date();
      }
    }
    if (body.adminNotes !== undefined) {
      updateData.adminNotes = body.adminNotes;
    }

    const request = await prisma.locationRequest.update({
      where: { id },
      data: updateData,
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

    res.json(request);
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Location request not found" });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/locations/requests/:id/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve location request
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.post("/admin/locations/requests/:id/approve", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const adminNotes = req.body.adminNotes as string | undefined;

    const request = await prisma.locationRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        adminNotes: adminNotes || null,
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

    res.json(request);
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Location request not found" });
    }
    next(e);
  }
});

/**
 * @openapi
 * /admin/locations/requests/:id/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject location request
 *     security:
 *       - bearerAuth: []
 */
locationsRouter.post("/admin/locations/requests/:id/reject", requireAuth(), requireRole("ADMIN"), async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const adminNotes = req.body.adminNotes as string | undefined;

    const request = await prisma.locationRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        adminNotes: adminNotes || null,
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

    res.json(request);
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Location request not found" });
    }
    next(e);
  }
});
