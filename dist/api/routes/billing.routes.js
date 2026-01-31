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
    branchLimit: z.number().int().min(0),
    stripePriceId: z.string().optional(),
});
const updatePlanSchema = z.object({
    name: z.string().min(1).optional(),
    interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).optional(),
    amountCents: z.number().int().min(0).optional(),
    branchLimit: z.number().int().min(0).optional(),
    stripePriceId: z.string().nullable().optional(),
    active: z.boolean().optional(),
});
billingRouter.get("/admin/plans", requireAuth(), requireRole("ADMIN"), async (_req, res, next) => {
    try {
        const plans = await prisma.plan.findMany({
            orderBy: { createdAt: "asc" },
        });
        res.json({ items: plans });
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
        res.json(sub);
    }
    catch (e) {
        next(e);
    }
});
const setSourceSubscriptionSchema = z.object({
    planId: z.string(),
    currentPeriodEnd: z.string().datetime().optional(),
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
        const periodEnd = body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const sub = await prisma.sourceSubscription.upsert({
            where: { sourceId },
            create: {
                sourceId,
                planId: plan.id,
                status: "active",
                currentPeriodStart: new Date(),
                currentPeriodEnd: periodEnd,
            },
            update: {
                planId: plan.id,
                status: "active",
                currentPeriodEnd: periodEnd,
            },
            include: { plan: true },
        });
        res.json(sub);
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
// --- Source: checkout session ---
// Stripe Price IDs (plan.stripePriceId) should be created in Stripe Dashboard with currency EUR.
const checkoutSessionSchema = z.object({
    planId: z.string(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
});
const STRIPE_INTERVAL = {
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
};
async function ensurePlanStripePrice(plan) {
    if (plan.stripePriceId)
        return plan.stripePriceId;
    if (!stripe)
        throw new Error("Stripe not configured");
    const interval = STRIPE_INTERVAL[plan.interval] ?? "month";
    const product = await stripe.products.create({
        name: `Gloria Source – ${plan.name}`,
        metadata: { planId: plan.id },
    });
    const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amountCents,
        currency: "usd",
        recurring: { interval },
        metadata: { planId: plan.id },
    });
    await prisma.plan.update({
        where: { id: plan.id },
        data: { stripePriceId: price.id },
    });
    return price.id;
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
        const stripePriceId = await ensurePlanStripePrice(plan);
        const existing = await prisma.sourceSubscription.findUnique({
            where: { sourceId: companyId },
        });
        const baseUrl = (req.headers.origin || req.headers.referer || "").replace(/\/$/, "");
        const successUrl = body.successUrl || `${baseUrl}?checkout=success`;
        const cancelUrl = body.cancelUrl || `${baseUrl}?checkout=cancel`;
        const sessionParams = {
            mode: "subscription",
            line_items: [{ price: stripePriceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: { sourceId: companyId, planId: plan.id },
            subscription_data: { metadata: { sourceId: companyId, planId: plan.id } },
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
                await prisma.sourceSubscription.upsert({
                    where: { sourceId },
                    create: {
                        sourceId,
                        planId,
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
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
            const subId = session.subscription;
            if (sourceId && planId && subId && stripe) {
                const subscription = await stripe.subscriptions.retrieve(subId);
                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null;
                const periodStart = subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null;
                const customerId = session.customer || subscription.customer;
                await prisma.sourceSubscription.upsert({
                    where: { sourceId },
                    create: {
                        sourceId,
                        planId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
                        status: "active",
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        planId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscription.id,
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
