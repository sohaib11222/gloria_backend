import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { locationClient } from "../../grpc/clients/location.client.js";
import { metaFromReq } from "../../grpc/meta.js";
import { prisma } from "../../data/prisma.js";
import { LocationsService } from "../../services/locations.js";

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
    // only allow a source to sync its own coverage
    const sourceId = String(req.params.sourceId || req.body?.source_id || "").trim();
    if (req.user.companyId !== sourceId) return res.status(403).json({ error: "FORBIDDEN", message: "Can only sync your own coverage" });
    const client = locationClient();
    client.SyncSourceCoverage({ source_id: sourceId }, metaFromReq(req), (err: any, resp: any) => err ? next(err) : res.json(resp));
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
