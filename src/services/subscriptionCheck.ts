import { prisma } from "../data/prisma.js";

/**
 * Returns true if the source (SOURCE company) has an active subscription (status active, currentPeriodEnd in the future).
 * Returns false if no subscription, expired, or not active.
 */
export async function hasActiveSubscription(sourceId: string): Promise<boolean> {
  const sub = await prisma.sourceSubscription.findUnique({
    where: { sourceId },
  });
  if (!sub || sub.status !== "active") return false;
  const now = new Date();
  if (!sub.currentPeriodEnd || sub.currentPeriodEnd < now) return false;
  return true;
}

/**
 * Returns a Set of sourceIds that have an active subscription. Use for filtering lists.
 */
export async function sourceIdsWithActiveSubscription(sourceIds: string[]): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const now = new Date();
  const subs = await prisma.sourceSubscription.findMany({
    where: {
      sourceId: { in: sourceIds },
      status: "active",
      currentPeriodEnd: { gt: now },
    },
    select: { sourceId: true },
  });
  return new Set(subs.map((s: { sourceId: string }) => s.sourceId));
}
