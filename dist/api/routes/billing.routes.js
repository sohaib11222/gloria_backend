import { Router } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { requireAuth } from "../../infra/auth.js";
import { requireRole, requireCompanyType } from "../../infra/policies.js";
import { prisma } from "../../data/prisma.js";
import { config } from "../../infra/config.js";
export const billingRouter = Router();
const stripe = config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey)
    : null;
// --- Admin: Plans CRUD ---
const createPlanSchema = z.object({
    name: z.string().min(1),
    interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    amountCents: z.number().int().min(0),
    pricePerBranchCents: z.number().int().min(0),
    branchLimit: z.number().int().min(0),
    stripePriceId: z.string().optional(),
});
const updatePlanSchema = z.object({
    name: z.string().min(1).optional(),
    interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).optional(),
    amountCents: z.number().int().min(0).optional(),
    pricePerBranchCents: z.number().int().min(0).optional(),
    branchLimit: z.number().int().min(0).optional(),
    stripePriceId: z.string().nullable().optional(),
    active: z.boolean().optional(),
});
billingRouter.get("/admin/plans", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
    try {
        const plans = await prisma.plan.findMany({
            orderBy: { createdAt: "asc" },
        });
        res.json({
            items: plans.map((p) => ({
                ...p,
                pricePerBranchCents: p.pricePerBranchCents > 0 ? p.pricePerBranchCents : p.amountCents,
            })),
        });
    }
    catch (e) {
        next(e);
    }
});
billingRouter.post("/admin/plans", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const body = createPlanSchema.parse(req.body);
        const plan = await prisma.plan.create({
            data: {
                name: body.name,
                interval: body.interval,
                amountCents: body.amountCents,
                pricePerBranchCents: body.pricePerBranchCents,
                branchLimit: body.branchLimit,
                stripePriceId: body.stripePriceId ?? null,
            },
        });
        res.status(201).json(plan);
    }
    catch (e) {
        next(e);
    }
});
billingRouter.patch("/admin/plans/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const body = updatePlanSchema.parse(req.body);
        const plan = await prisma.plan.update({
            where: { id },
            data: {
                ...(body.name != null && { name: body.name }),
                ...(body.interval != null && { interval: body.interval }),
                ...(body.amountCents != null && { amountCents: body.amountCents }),
                ...(body.pricePerBranchCents != null && { pricePerBranchCents: body.pricePerBranchCents }),
                ...(body.branchLimit != null && { branchLimit: body.branchLimit }),
                ...(body.stripePriceId !== undefined && { stripePriceId: body.stripePriceId }),
                ...(body.active != null && { active: body.active }),
            },
        });
        res.json(plan);
    }
    catch (e) {
        next(e);
    }
});
// --- Admin: Source subscription ---
billingRouter.get("/admin/sources/:sourceId/subscription", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const sub = await prisma.sourceSubscription.findUnique({
            where: { sourceId },
            include: { plan: true, source: { select: { id: true, companyName: true, email: true, type: true } } },
        });
        if (!sub)
            return res.status(404).json({ error: "NOT_FOUND", message: "No subscription for this source" });
        const [branchCount, locationCount] = await Promise.all([
            prisma.branch.count({ where: { sourceId } }),
            prisma.sourceLocation.count({ where: { sourceId } }),
        ]);
        res.json({ ...sub, branchCount, locationCount });
    }
    catch (e) {
        next(e);
    }
});
const setSourceSubscriptionSchema = z.object({
    planId: z.string(),
    currentPeriodEnd: z.string().datetime().optional(),
    subscribedBranchCount: z.number().int().min(0).optional(),
    status: z.enum(["active", "canceled", "past_due", "trialing"]).optional(),
});
billingRouter.patch("/admin/sources/:sourceId/subscription", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const body = setSourceSubscriptionSchema.parse(req.body);
        const source = await prisma.company.findUnique({
            where: { id: sourceId, type: "SOURCE" },
        });
        if (!source)
            return res.status(404).json({ error: "NOT_FOUND", message: "Source company not found" });
        const plan = await prisma.plan.findFirst({ where: { id: body.planId, active: true } });
        if (!plan)
            return res.status(400).json({ error: "INVALID_PLAN", message: "Plan not found or inactive" });
        const periodEnd = body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : undefined;
        const subscribedBranchCount = body.subscribedBranchCount ?? 1;
        const status = body.status ?? "active";
        const sub = await prisma.sourceSubscription.upsert({
            where: { sourceId },
            create: {
                sourceId,
                planId: plan.id,
                subscribedBranchCount,
                status,
                currentPeriodStart: new Date(),
                currentPeriodEnd: periodEnd ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
            update: {
                planId: plan.id,
                status,
                ...(periodEnd != null && { currentPeriodEnd: periodEnd }),
                ...(body.subscribedBranchCount != null && { subscribedBranchCount: body.subscribedBranchCount }),
            },
            include: { plan: true, source: { select: { id: true, companyName: true, email: true, type: true } } },
        });
        const [branchCount, locationCount] = await Promise.all([
            prisma.branch.count({ where: { sourceId } }),
            prisma.sourceLocation.count({ where: { sourceId } }),
        ]);
        res.json({ ...sub, branchCount, locationCount });
    }
    catch (e) {
        next(e);
    }
});
// --- Helper: effective branch count for an agent (sum of branches from sources they have agreements with) ---
async function getAgentEffectiveBranchCount(agentId) {
    const agreements = await prisma.agreement.findMany({
        where: { agentId, status: { in: ["ACCEPTED", "ACTIVE"] } },
        select: { sourceId: true },
    });
    const sourceIds = [...new Set(agreements.map((a) => a.sourceId))];
    if (sourceIds.length === 0)
        return 0;
    const result = await prisma.branch.groupBy({
        by: ["sourceId"],
        where: { sourceId: { in: sourceIds } },
        _count: true,
    });
    return result.reduce((sum, r) => sum + r._count, 0);
}
// --- Admin: Agent plans CRUD ---
const createAgentPlanSchema = z.object({
    name: z.string().min(1),
    interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    branchLimit: z.number().int().min(0),
    defaultPriceCents: z.number().int().min(0),
    active: z.boolean().optional(),
});
const updateAgentPlanSchema = z.object({
    name: z.string().min(1).optional(),
    interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).optional(),
    branchLimit: z.number().int().min(0).optional(),
    defaultPriceCents: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
});
billingRouter.get("/admin/agent-plans", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
    try {
        const plans = await prisma.agentPlan.findMany({
            orderBy: { createdAt: "asc" },
            include: { countryPrices: true },
        });
        res.json({ items: plans });
    }
    catch (e) {
        next(e);
    }
});
billingRouter.post("/admin/agent-plans", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const body = createAgentPlanSchema.parse(req.body);
        const plan = await prisma.agentPlan.create({
            data: {
                name: body.name,
                interval: body.interval,
                branchLimit: body.branchLimit,
                defaultPriceCents: body.defaultPriceCents,
                active: body.active ?? true,
            },
        });
        res.status(201).json(plan);
    }
    catch (e) {
        next(e);
    }
});
billingRouter.patch("/admin/agent-plans/:id", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const body = updateAgentPlanSchema.parse(req.body);
        const plan = await prisma.agentPlan.update({
            where: { id },
            data: {
                ...(body.name != null && { name: body.name }),
                ...(body.interval != null && { interval: body.interval }),
                ...(body.branchLimit != null && { branchLimit: body.branchLimit }),
                ...(body.defaultPriceCents != null && { defaultPriceCents: body.defaultPriceCents }),
                ...(body.active != null && { active: body.active }),
            },
        });
        res.json(plan);
    }
    catch (e) {
        next(e);
    }
});
// --- Admin: Agent plan country prices ---
billingRouter.get("/admin/agent-plans/:planId/country-prices", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { planId } = req.params;
        const prices = await prisma.agentPlanCountryPrice.findMany({
            where: { agentPlanId: planId },
            orderBy: { countryCode: "asc" },
        });
        res.json({ items: prices });
    }
    catch (e) {
        next(e);
    }
});
const setAgentPlanCountryPricesSchema = z.object({
    prices: z.array(z.object({
        countryCode: z.string().length(2),
        pricePerBranchCents: z.number().int().min(0),
        stripePriceId: z.string().nullable().optional(),
    })),
});
billingRouter.put("/admin/agent-plans/:planId/country-prices", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { planId } = req.params;
        const body = setAgentPlanCountryPricesSchema.parse(req.body);
        const plan = await prisma.agentPlan.findUnique({ where: { id: planId } });
        if (!plan)
            return res.status(404).json({ error: "NOT_FOUND", message: "Agent plan not found" });
        await prisma.$transaction(body.prices.map((p) => prisma.agentPlanCountryPrice.upsert({
            where: {
                agentPlanId_countryCode: { agentPlanId: planId, countryCode: p.countryCode.toUpperCase() },
            },
            create: {
                agentPlanId: planId,
                countryCode: p.countryCode.toUpperCase(),
                pricePerBranchCents: p.pricePerBranchCents,
                stripePriceId: p.stripePriceId ?? null,
            },
            update: {
                pricePerBranchCents: p.pricePerBranchCents,
                ...(p.stripePriceId !== undefined && { stripePriceId: p.stripePriceId }),
            },
        })));
        const prices = await prisma.agentPlanCountryPrice.findMany({
            where: { agentPlanId: planId },
            orderBy: { countryCode: "asc" },
        });
        res.json({ items: prices });
    }
    catch (e) {
        next(e);
    }
});
// --- Admin: Agent subscription ---
billingRouter.get("/admin/agents/:agentId/subscription", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { agentId } = req.params;
        const agent = await prisma.company.findUnique({
            where: { id: agentId, type: "AGENT" },
            select: { id: true, companyName: true, email: true, type: true, billingCountryCode: true },
        });
        if (!agent)
            return res.status(404).json({ error: "NOT_FOUND", message: "Agent company not found" });
        const sub = await prisma.agentSubscription.findUnique({
            where: { agentId },
            include: { agentPlan: { include: { countryPrices: true } } },
        });
        const effectiveBranchCount = await getAgentEffectiveBranchCount(agentId);
        if (!sub) {
            return res.json({
                subscription: null,
                agent: { id: agent.id, companyName: agent.companyName, email: agent.email, billingCountryCode: agent.billingCountryCode },
                effectiveBranchCount,
            });
        }
        res.json({
            ...sub,
            agent: { id: agent.id, companyName: agent.companyName, email: agent.email, billingCountryCode: agent.billingCountryCode },
            effectiveBranchCount,
        });
    }
    catch (e) {
        next(e);
    }
});
const setAgentSubscriptionSchema = z.object({
    planId: z.string(),
    currentPeriodEnd: z.string().datetime().optional(),
    subscribedBranchCount: z.number().int().min(0).optional(),
    status: z.enum(["active", "canceled", "past_due", "trialing"]).optional(),
});
billingRouter.patch("/admin/agents/:agentId/subscription", requireAuth(), requireRole("ADMIN"), async (req, res, next) => {
    try {
        const { agentId } = req.params;
        const body = setAgentSubscriptionSchema.parse(req.body);
        const agent = await prisma.company.findUnique({
            where: { id: agentId, type: "AGENT" },
        });
        if (!agent)
            return res.status(404).json({ error: "NOT_FOUND", message: "Agent company not found" });
        const plan = await prisma.agentPlan.findFirst({ where: { id: body.planId, active: true } });
        if (!plan)
            return res.status(400).json({ error: "INVALID_PLAN", message: "Agent plan not found or inactive" });
        const periodEnd = body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : undefined;
        const subscribedBranchCount = body.subscribedBranchCount ?? 1;
        const status = body.status ?? "active";
        const sub = await prisma.agentSubscription.upsert({
            where: { agentId },
            create: {
                agentId,
                agentPlanId: plan.id,
                subscribedBranchCount,
                status,
                currentPeriodStart: new Date(),
                currentPeriodEnd: periodEnd ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
            update: {
                agentPlanId: plan.id,
                status,
                ...(periodEnd != null && { currentPeriodEnd: periodEnd }),
                ...(body.subscribedBranchCount != null && { subscribedBranchCount: body.subscribedBranchCount }),
            },
            include: { agentPlan: true, agent: { select: { id: true, companyName: true, email: true, billingCountryCode: true } } },
        });
        const effectiveBranchCount = await getAgentEffectiveBranchCount(agentId);
        res.json({ ...sub, effectiveBranchCount });
    }
    catch (e) {
        next(e);
    }
});
// --- Source: list plans (for plan picker) ---
billingRouter.get("/sources/plans", requireAuth(), requireCompanyType("SOURCE"), async (_req, res, next) => {
    try {
        const plans = await prisma.plan.findMany({
            where: { active: true },
            orderBy: { createdAt: "asc" },
        });
        res.json({ items: plans });
    }
    catch (e) {
        next(e);
    }
});
// --- Source: my subscription ---
billingRouter.get("/sources/me/subscription", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const sub = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
            include: { plan: true },
        });
        if (!sub)
            return res.status(404).json({ error: "NOT_FOUND", message: "No active subscription" });
        const now = new Date();
        const active = sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
        res.json({
            ...sub,
            active,
            plan: sub.plan,
        });
    }
    catch (e) {
        next(e);
    }
});
// --- Source: update subscription quantity (add more branches) ---
const updateSubscriptionQuantitySchema = z.object({
    quantity: z.number().int().min(1),
});
billingRouter.patch("/sources/me/subscription/quantity", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const body = updateSubscriptionQuantitySchema.parse(req.body);
        const sub = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
            include: { plan: true },
        });
        if (!sub) {
            return res.status(404).json({ error: "NOT_FOUND", message: "No subscription for this source. Subscribe to a plan first." });
        }
        // If we have Stripe, sync quantity there and then to DB
        if (sub.stripeSubscriptionId && stripe) {
            const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, { expand: ["items.data"] });
            const item = subscription.items?.data?.[0];
            if (item?.id) {
                await stripe.subscriptions.update(sub.stripeSubscriptionId, {
                    items: [{ id: item.id, quantity: body.quantity }],
                    proration_behavior: "create_prorations",
                });
            }
        }
        // Always update local quantity (works for Stripe and non-Stripe / admin-created subscriptions)
        await prisma.sourceSubscription.update({
            where: { sourceId: companyId },
            data: { subscribedBranchCount: body.quantity },
        });
        const updated = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
            include: { plan: true },
        });
        res.json({ subscribedBranchCount: body.quantity, subscription: updated });
    }
    catch (e) {
        next(e);
    }
});
// --- Source: checkout session ---
// Checkout uses inline price_data (EUR + quantity) so totals match Gloria; plan.stripePriceId is optional for other flows.
const checkoutSessionSchema = z.object({
    planId: z.string(),
    /** Per-branch subscription quantity (Stripe line item qty). Charged: qty × plan price per branch. */
    branchQuantity: z.coerce.number().int().min(1).max(100_000).optional().default(1),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
});
const STRIPE_INTERVAL = {
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
};
function resolveSourceCheckoutBranchQuantity(plan, requested) {
    const q = Number.isFinite(requested) ? Math.floor(requested) : 1;
    const clamped = Math.min(100_000, Math.max(1, q));
    if (plan.branchLimit > 0 && clamped > plan.branchLimit) {
        const err = new Error(`Branch quantity cannot exceed this plan's limit of ${plan.branchLimit}.`);
        err.code = "BRANCH_LIMIT_EXCEEDED";
        throw err;
    }
    return clamped;
}
function sourcePlanUnitAmountCents(plan) {
    const per = plan.pricePerBranchCents > 0 ? plan.pricePerBranchCents : plan.amountCents;
    if (per <= 0) {
        const err = new Error("Plan has no positive per-branch or base price in cents");
        err.code = "INVALID_PLAN_PRICE";
        throw err;
    }
    return per;
}
billingRouter.post("/sources/checkout-session", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        if (!stripe)
            return res.status(503).json({ error: "STRIPE_DISABLED", message: "Stripe is not configured" });
        const companyId = req.user?.companyId;
        const email = req.user?.email;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const body = checkoutSessionSchema.parse(req.body);
        const plan = await prisma.plan.findFirst({
            where: { id: body.planId, active: true },
        });
        if (!plan) {
            return res.status(400).json({ error: "INVALID_PLAN", message: "Plan not found or inactive" });
        }
        let branchQty;
        try {
            branchQty = resolveSourceCheckoutBranchQuantity(plan, body.branchQuantity ?? 1);
        }
        catch (e) {
            if (e?.code === "BRANCH_LIMIT_EXCEEDED") {
                return res.status(400).json({
                    error: e.code,
                    message: e.message,
                    branchLimit: plan.branchLimit,
                });
            }
            throw e;
        }
        let unitAmountCents;
        try {
            unitAmountCents = sourcePlanUnitAmountCents(plan);
        }
        catch (e) {
            if (e?.code === "INVALID_PLAN_PRICE") {
                return res.status(400).json({
                    error: e.code,
                    message: e.message,
                });
            }
            throw e;
        }
        const recurringInterval = STRIPE_INTERVAL[plan.interval] ?? "month";
        const totalCents = branchQty * unitAmountCents;
        const eur = (c) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(c / 100);
        const existing = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
        });
        const baseUrl = (req.headers.origin || req.headers.referer || "").replace(/\/$/, "");
        const successUrl = body.successUrl || `${baseUrl}?checkout=success`;
        const cancelUrl = body.cancelUrl || `${baseUrl}?checkout=cancel`;
        /** Inline EUR price + quantity so Checkout matches Gloria (avoids stale USD catalog Price IDs). */
        const sessionParams = {
            mode: "subscription",
            line_items: [
                {
                    quantity: branchQty,
                    price_data: {
                        currency: "eur",
                        unit_amount: unitAmountCents,
                        recurring: { interval: recurringInterval },
                        product_data: {
                            name: `Gloria Source — ${plan.name}`,
                            description: `${branchQty.toLocaleString("en-IE")} branches × ${eur(unitAmountCents)} per branch / ${recurringInterval}. Period total ${eur(totalCents)}.`,
                            metadata: { planId: plan.id, gloriaSourceCheckout: "1" },
                        },
                    },
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            locale: "auto",
            custom_text: {
                submit: {
                    message: `You are subscribing to ${branchQty.toLocaleString("en-IE")} branches at ${eur(unitAmountCents)} each per ${recurringInterval}. Estimated charge this period: ${eur(totalCents)} (EUR).`,
                },
            },
            metadata: {
                sourceId: companyId,
                planId: plan.id,
                branchQuantity: String(branchQty),
            },
            subscription_data: {
                metadata: {
                    sourceId: companyId,
                    planId: plan.id,
                    branchQuantity: String(branchQty),
                },
            },
        };
        if (existing?.stripeCustomerId) {
            sessionParams.customer = existing.stripeCustomerId;
        }
        else if (email) {
            sessionParams.customer_email = email;
        }
        const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
        res.json({ url: checkoutSession.url });
    }
    catch (e) {
        next(e);
    }
});
// --- Agents: list plans (for plan picker) ---
billingRouter.get("/agents/plans", requireAuth(), requireCompanyType("AGENT"), async (_req, res, next) => {
    try {
        const plans = await prisma.agentPlan.findMany({
            where: { active: true },
            orderBy: { createdAt: "asc" },
            include: { countryPrices: true },
        });
        res.json({ items: plans });
    }
    catch (e) {
        next(e);
    }
});
// --- Agents: my subscription ---
billingRouter.get("/agents/me/subscription", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const sub = await prisma.agentSubscription.findUnique({
            where: { agentId: companyId },
            include: { agentPlan: { include: { countryPrices: true } } },
        });
        if (!sub) {
            const effectiveBranchCount = await getAgentEffectiveBranchCount(companyId);
            return res.json({
                subscription: null,
                effectiveBranchCount,
                active: false,
            });
        }
        const now = new Date();
        const active = sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
        const effectiveBranchCount = await getAgentEffectiveBranchCount(companyId);
        res.json({
            ...sub,
            active,
            plan: sub.agentPlan,
            effectiveBranchCount,
        });
    }
    catch (e) {
        next(e);
    }
});
// --- Agents: update subscription quantity ---
billingRouter.patch("/agents/me/subscription/quantity", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const body = updateSubscriptionQuantitySchema.parse(req.body);
        const sub = await prisma.agentSubscription.findUnique({
            where: { agentId: companyId },
            include: { agentPlan: true },
        });
        if (!sub) {
            return res.status(404).json({ error: "NOT_FOUND", message: "No subscription. Subscribe to a plan first." });
        }
        if (sub.stripeSubscriptionId && stripe) {
            const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, { expand: ["items.data"] });
            const item = subscription.items?.data?.[0];
            if (item?.id) {
                await stripe.subscriptions.update(sub.stripeSubscriptionId, {
                    items: [{ id: item.id, quantity: body.quantity }],
                    proration_behavior: "create_prorations",
                });
            }
        }
        await prisma.agentSubscription.update({
            where: { agentId: companyId },
            data: { subscribedBranchCount: body.quantity },
        });
        const updated = await prisma.agentSubscription.findUnique({
            where: { agentId: companyId },
            include: { agentPlan: true },
        });
        res.json({ subscribedBranchCount: body.quantity, subscription: updated });
    }
    catch (e) {
        next(e);
    }
});
// --- Agents: checkout session (country-based price) ---
async function ensureAgentPlanCountryStripePrice(agentPlanId, countryCode, pricePerBranchCents, interval) {
    const existing = await prisma.agentPlanCountryPrice.findUnique({
        where: { agentPlanId_countryCode: { agentPlanId, countryCode } },
    });
    if (existing?.stripePriceId)
        return existing.stripePriceId;
    if (!stripe)
        throw new Error("Stripe not configured");
    const plan = await prisma.agentPlan.findUnique({ where: { id: agentPlanId } });
    if (!plan)
        throw new Error("Plan not found");
    const intervalStripe = STRIPE_INTERVAL[interval] ?? "month";
    const product = await stripe.products.create({
        name: `Gloria Agent – ${plan.name} (${countryCode}) (per branch)`,
        metadata: { agentPlanId, countryCode },
    });
    const price = await stripe.prices.create({
        product: product.id,
        unit_amount: pricePerBranchCents,
        currency: "eur",
        recurring: { interval: intervalStripe },
        metadata: { agentPlanId, countryCode },
    });
    await prisma.agentPlanCountryPrice.upsert({
        where: { agentPlanId_countryCode: { agentPlanId, countryCode } },
        create: {
            agentPlanId,
            countryCode,
            pricePerBranchCents,
            stripePriceId: price.id,
        },
        update: { stripePriceId: price.id },
    });
    return price.id;
}
const agentCheckoutSessionSchema = z.object({
    planId: z.string(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
});
billingRouter.post("/agents/checkout-session", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        if (!stripe)
            return res.status(503).json({ error: "STRIPE_DISABLED", message: "Stripe is not configured" });
        const companyId = req.user?.companyId;
        const email = req.user?.email;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const body = agentCheckoutSessionSchema.parse(req.body);
        const plan = await prisma.agentPlan.findFirst({
            where: { id: body.planId, active: true },
            include: { countryPrices: true },
        });
        if (!plan)
            return res.status(400).json({ error: "INVALID_PLAN", message: "Plan not found or inactive" });
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { billingCountryCode: true },
        });
        const countryCode = (company?.billingCountryCode || "US").toUpperCase();
        let priceId;
        const countryPrice = plan.countryPrices.find((p) => p.countryCode === countryCode);
        if (countryPrice) {
            priceId = await ensureAgentPlanCountryStripePrice(plan.id, countryCode, countryPrice.pricePerBranchCents, plan.interval);
        }
        else {
            priceId = await ensureAgentPlanCountryStripePrice(plan.id, countryCode, plan.defaultPriceCents, plan.interval);
        }
        const existing = await prisma.agentSubscription.findUnique({
            where: { agentId: companyId },
        });
        const baseUrl = (req.headers.origin || req.headers.referer || "").replace(/\/$/, "");
        const successUrl = body.successUrl || `${baseUrl}/billing?checkout=success`;
        const cancelUrl = body.cancelUrl || `${baseUrl}/billing?checkout=cancel`;
        const sessionParams = {
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: { agentId: companyId, agentPlanId: plan.id },
            subscription_data: { metadata: { agentId: companyId, agentPlanId: plan.id } },
        };
        if (existing?.stripeCustomerId) {
            sessionParams.customer = existing.stripeCustomerId;
        }
        else if (email) {
            sessionParams.customer_email = email;
        }
        const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
        res.json({ url: checkoutSession.url });
    }
    catch (e) {
        next(e);
    }
});
// --- Agents: my transactions ---
billingRouter.get("/agents/me/transactions", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const sub = await prisma.agentSubscription.findUnique({
            where: { agentId: companyId },
            include: { agentPlan: true },
        });
        if (!sub?.stripeCustomerId)
            return res.json({ items: [] });
        if (!stripe)
            return res.json({ items: [] });
        const invoices = await stripe.invoices.list({
            customer: sub.stripeCustomerId,
            limit: 50,
            expand: ["data.subscription"],
        });
        const items = invoices.data.map((inv) => ({
            id: inv.id,
            stripeInvoiceId: inv.id,
            planName: sub.agentPlan?.name ?? null,
            status: inv.status ?? "draft",
            amountPaid: inv.amount_paid ?? 0,
            amountDue: inv.amount_due ?? 0,
            currency: (inv.currency ?? "usd").toUpperCase(),
            createdAt: inv.created ? new Date(inv.created * 1000).toISOString() : null,
            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
            invoicePdf: inv.invoice_pdf ?? null,
            hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        }));
        res.json({ items });
    }
    catch (e) {
        next(e);
    }
});
// --- Admin: list all transactions (Stripe invoices) ---
billingRouter.get("/admin/transactions", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
    try {
        if (!stripe) {
            return res.json({ items: [], message: "Stripe not configured" });
        }
        const invoices = await stripe.invoices.list({
            limit: 100,
            expand: ["data.subscription", "data.customer"],
        });
        const customerIds = [...new Set(invoices.data.map((inv) => inv.customer).filter(Boolean))];
        const subsByCustomer = await prisma.sourceSubscription.findMany({
            where: { stripeCustomerId: { in: customerIds } },
            include: { source: { select: { id: true, companyName: true, email: true } }, plan: true },
        });
        const byCustomer = new Map(subsByCustomer.map((s) => [s.stripeCustomerId, s]));
        const items = invoices.data.map((inv) => {
            const sub = inv.customer ? byCustomer.get(inv.customer) : null;
            return {
                id: inv.id,
                stripeInvoiceId: inv.id,
                sourceId: sub?.sourceId ?? null,
                sourceName: sub?.source?.companyName ?? null,
                customerEmail: sub?.source?.email ?? (inv.customer_email || null),
                planName: sub?.plan?.name ?? null,
                status: inv.status ?? "draft",
                amountPaid: inv.amount_paid ?? 0,
                amountDue: inv.amount_due ?? 0,
                currency: (inv.currency ?? "usd").toUpperCase(),
                createdAt: inv.created ? new Date(inv.created * 1000).toISOString() : null,
                periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
                periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
                invoicePdf: inv.invoice_pdf ?? null,
                hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
            };
        });
        res.json({ items });
    }
    catch (e) {
        next(e);
    }
});
// --- Source: my transactions (Stripe invoices for my customer) ---
billingRouter.get("/sources/me/transactions", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR", message: "Company not found" });
        const sub = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
            include: { plan: true },
        });
        if (!sub?.stripeCustomerId) {
            return res.json({ items: [] });
        }
        if (!stripe) {
            return res.json({ items: [] });
        }
        const invoices = await stripe.invoices.list({
            customer: sub.stripeCustomerId,
            limit: 50,
            expand: ["data.subscription"],
        });
        const items = invoices.data.map((inv) => ({
            id: inv.id,
            stripeInvoiceId: inv.id,
            planName: sub.plan?.name ?? null,
            status: inv.status ?? "draft",
            amountPaid: inv.amount_paid ?? 0,
            amountDue: inv.amount_due ?? 0,
            currency: (inv.currency ?? "usd").toUpperCase(),
            createdAt: inv.created ? new Date(inv.created * 1000).toISOString() : null,
            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
            invoicePdf: inv.invoice_pdf ?? null,
            hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        }));
        res.json({ items });
    }
    catch (e) {
        next(e);
    }
});
// --- Webhook (called with raw body from app.ts) ---
export async function handleStripeWebhook(req, res) {
    if (!config.stripeWebhookSecret || !stripe) {
        res.status(503).json({ error: "STRIPE_DISABLED" });
        return;
    }
    const sig = req.headers["stripe-signature"];
    const rawBody = req.body;
    if (!sig || !rawBody) {
        res.status(400).json({ error: "MISSING_SIGNATURE_OR_BODY" });
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, config.stripeWebhookSecret);
    }
    catch (err) {
        res.status(400).json({ error: "WEBHOOK_SIGNATURE_VERIFICATION_FAILED", message: err?.message });
        return;
    }
    try {
        if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
            const subscription = event.data.object;
            const sourceId = subscription.metadata?.sourceId;
            const planId = subscription.metadata?.planId;
            const agentId = subscription.metadata?.agentId;
            const agentPlanId = subscription.metadata?.agentPlanId;
            if (sourceId && planId) {
                const status = subscription.status === "active"
                    ? "active"
                    : subscription.status === "past_due"
                        ? "past_due"
                        : subscription.status === "trialing"
                            ? "trialing"
                            : "canceled";
                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null;
                const periodStart = subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null;
                const quantity = subscription.items?.data?.[0]?.quantity ?? 1;
                await prisma.sourceSubscription.upsert({
                    where: { sourceId },
                    create: {
                        sourceId,
                        planId,
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                });
            }
            if (agentId && agentPlanId) {
                const status = subscription.status === "active"
                    ? "active"
                    : subscription.status === "past_due"
                        ? "past_due"
                        : subscription.status === "trialing"
                            ? "trialing"
                            : "canceled";
                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null;
                const periodStart = subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null;
                const quantity = subscription.items?.data?.[0]?.quantity ?? 1;
                await prisma.agentSubscription.upsert({
                    where: { agentId },
                    create: {
                        agentId,
                        agentPlanId,
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                });
            }
        }
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const sourceId = session.metadata?.sourceId;
            const planId = session.metadata?.planId;
            const agentId = session.metadata?.agentId;
            const agentPlanId = session.metadata?.agentPlanId;
            const subId = session.subscription;
            if (sourceId && planId && subId && stripe) {
                const subscription = await stripe.subscriptions.retrieve(subId, { expand: ["items.data"] });
                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null;
                const periodStart = subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null;
                const customerId = session.customer || subscription.customer;
                const quantity = subscription.items?.data?.[0]?.quantity ?? 1;
                await prisma.sourceSubscription.upsert({
                    where: { sourceId },
                    create: {
                        sourceId,
                        planId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status: "active",
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        planId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status: "active",
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                });
            }
            if (agentId && agentPlanId && subId && stripe) {
                const subscription = await stripe.subscriptions.retrieve(subId, { expand: ["items.data"] });
                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null;
                const periodStart = subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null;
                const customerId = session.customer || subscription.customer;
                const quantity = subscription.items?.data?.[0]?.quantity ?? 1;
                await prisma.agentSubscription.upsert({
                    where: { agentId },
                    create: {
                        agentId,
                        agentPlanId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status: "active",
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        agentPlanId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        subscribedBranchCount: quantity,
                        status: "active",
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                });
            }
        }
    }
    catch (_e) {
        // Log but still return 200 so Stripe does not retry
    }
    res.status(200).json({ received: true });
}
