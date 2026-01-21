import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";

export const coverageRouter = Router();

/**
 * @openapi
 * /coverage/source/:sourceId:
 *   get:
 *     tags: [Coverage]
 *     summary: Get source coverage locations
 *     description: Get all locations covered by a specific source (from SourceLocation cache)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of covered locations
 */
coverageRouter.get("/coverage/source/:sourceId", requireAuth(), async (req: any, res, next) => {
  try {
    const { sourceId } = req.params;
    const userCompanyId = req.user.companyId;
    const userRole = req.user.role;
    const userCompanyType = req.user.type;

    // Allow if user is ADMIN or if user is the source owner
    if (userRole !== "ADMIN" && userCompanyId !== sourceId) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You can only view coverage for your own source",
      });
    }

    // Verify source exists and is a SOURCE type
    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      select: { id: true, type: true },
    });

    if (!source) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Source not found",
      });
    }

    if (source.type !== "SOURCE") {
      return res.status(400).json({
        error: "INVALID_TYPE",
        message: "Company is not a SOURCE type",
      });
    }

    // Get all source locations (coverage)
    const sourceLocations = await prisma.sourceLocation.findMany({
      where: { sourceId },
      include: {
        loc: true,
      },
      orderBy: { unlocode: "asc" },
    });

    // Format response
    const items = sourceLocations.map((sl) => ({
      unlocode: sl.unlocode,
      isMock: sl.isMock,
      location: sl.loc ? {
        unlocode: sl.loc.unlocode,
        place: sl.loc.place,
        country: sl.loc.country,
        iataCode: sl.loc.iataCode,
        latitude: sl.loc.latitude,
        longitude: sl.loc.longitude,
      } : null,
    }));

    res.json({
      sourceId,
      items,
      total: items.length,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /coverage/source/:sourceId/sync:
 *   post:
 *     tags: [Coverage]
 *     summary: Sync source coverage from gRPC
 *     description: Trigger a sync of source locations from gRPC endpoint
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 */
coverageRouter.post("/coverage/source/:sourceId/sync", requireAuth(), requireCompanyType("SOURCE"), async (req: any, res, next) => {
  try {
    const { sourceId } = req.params;
    const userCompanyId = req.user.companyId;

    // Verify user owns this source
    if (userCompanyId !== sourceId) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You can only sync coverage for your own source",
      });
    }

    // This would trigger a gRPC sync - for now return a message
    // The actual sync logic should be implemented based on your gRPC setup
    res.json({
      message: "Sync initiated",
      sourceId,
      note: "This endpoint should trigger gRPC sync - implementation pending",
    });
  } catch (e) {
    next(e);
  }
});
