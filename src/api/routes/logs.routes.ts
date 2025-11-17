import { Router } from "express";
import { prisma } from "../../data/prisma.js";
import { requireAuth } from "../../infra/auth.js";

export const logsRouter = Router();

// Simple logs endpoint suitable for Admin UI filters
logsRouter.get("/logs", requireAuth(), async (req: any, res, next) => {
  try {
    const request_id = String(req.query.request_id || "").trim();
    const company_id = String(req.query.company_id || "").trim();
    const endpoint = String(req.query.endpoint || "").trim();
    const where: any = {};
    if (request_id) where.requestId = request_id;
    if (company_id) where.companyId = company_id;
    if (endpoint) where.endpoint = endpoint;
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ items: rows });
  } catch (e) { next(e); }
});


