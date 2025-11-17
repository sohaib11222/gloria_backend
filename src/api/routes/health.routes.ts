import { Router } from "express";
import { requireAuth } from "../../infra/auth.js";
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

// Source-scoped health row for Source UI
healthRouter.get("/health/my-source", requireAuth(), async (req: any, res, next) => {
  try {
    const companyId = req.user.companyId as string;
    const row = await SourceHealthService.getSourceHealth(companyId);
    res.json(row);
  } catch (e) { next(e); }
});