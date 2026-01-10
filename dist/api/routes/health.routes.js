import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { SourceHealthService } from "../../services/health.js";
export const healthRouter = Router();
/**
 * @openapi
 * /healthz:
 *   get:
 *     tags: [Ops]
 *     summary: Health check
 *     responses:
 *       200:
 *         description: OK
 */
healthRouter.get("/healthz", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Ops]
 *     summary: Health check (alternative endpoint)
 *     responses:
 *       200:
 *         description: OK
 */
healthRouter.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
/**
 * @openapi
 * /health/my-source:
 *   get:
 *     tags: [Health]
 *     summary: Get health status for the authenticated source
 *     description: Retrieve health monitoring data for the authenticated source company including slow rates, backoff levels, and exclusion status
 *     security:
 *       - bearerAuth: []
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
 *                   description: Percentage of slow requests (0.0 to 1.0)
 *                 sampleCount:
 *                   type: integer
 *                   description: Total number of samples
 *                 backoffLevel:
 *                   type: integer
 *                   description: Current backoff level
 *                 excludedUntil:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Exclusion end time (null if not excluded)
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Last health update time
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       403:
 *         description: Forbidden - not a SOURCE company
 */
// Source-scoped health row for Source UI
healthRouter.get("/health/my-source", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) {
            return res.status(400).json({
                error: "BAD_REQUEST",
                message: "Company ID not found in authentication token"
            });
        }
        const row = await SourceHealthService.getSourceHealth(companyId);
        res.json(row);
    }
    catch (e) {
        next(e);
    }
});
