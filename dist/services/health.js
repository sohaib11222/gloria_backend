import { prisma } from "../data/prisma.js";
import { logger } from "../infra/logger.js";
import { sourceExclusionTotal, sourceHealthStatus } from "./metrics.js";
export class SourceHealthService {
    static SLOW_THRESHOLD_MS = 3000;
    static STRIKES_FOR_BACKOFF = 3; // Client requirement: 3 strikes before backoff
    // Backoff progression: 15m → 30m → 60m → 2h → 4h (client requirement)
    static BACKOFF_DURATIONS_MS = [
        15 * 60 * 1000, // Level 1: 15 minutes
        30 * 60 * 1000, // Level 2: 30 minutes
        60 * 60 * 1000, // Level 3: 60 minutes
        2 * 60 * 60 * 1000, // Level 4: 2 hours
        4 * 60 * 60 * 1000, // Level 5: 4 hours
    ];
    /**
     * Record a health metric for a source
     * Implements strike-based backoff: 3 strikes → 15m → 30m → 60m → 2h → 4h
     */
    static async recordMetric(metrics) {
        if (!process.env.ENABLE_HEALTH_MONITOR || process.env.ENABLE_HEALTH_MONITOR !== 'true') {
            return;
        }
        try {
            const { latency, success, sourceId } = metrics;
            const isSlow = latency > this.SLOW_THRESHOLD_MS;
            // Get or create health record
            const health = await prisma.sourceHealth.upsert({
                where: { sourceId },
                update: {
                    sampleCount: { increment: 1 },
                    slowCount: { increment: isSlow ? 1 : 0 },
                    updatedAt: new Date(),
                },
                create: {
                    sourceId,
                    sampleCount: 1,
                    slowCount: isSlow ? 1 : 0,
                    slowRate: isSlow ? 1.0 : 0.0,
                    backoffLevel: 0,
                    strikeCount: 0,
                },
            });
            // Calculate new slow rate (for metrics/display)
            const newSlowRate = health.slowCount / health.sampleCount;
            // STRIKE-BASED SYSTEM: Update strikes based on latency
            let newStrikeCount = health.strikeCount || 0;
            let shouldApplyBackoff = false;
            if (isSlow) {
                // Increment strike count for slow response
                newStrikeCount = (health.strikeCount || 0) + 1;
                // If we hit 3 strikes, trigger backoff
                if (newStrikeCount >= this.STRIKES_FOR_BACKOFF) {
                    shouldApplyBackoff = true;
                }
            }
            else {
                // Fast response: reset strikes (recovery)
                newStrikeCount = 0;
                // If source was in backoff and now recovered, reset backoff
                if (health.backoffLevel > 0) {
                    await this.resetBackoff(sourceId);
                }
            }
            // Update health record with new strike count and slow rate
            await prisma.sourceHealth.update({
                where: { sourceId },
                data: {
                    slowRate: newSlowRate,
                    strikeCount: newStrikeCount,
                    lastStrikeAt: isSlow ? new Date() : health.lastStrikeAt,
                },
            });
            // Apply backoff if strikes reached threshold
            if (shouldApplyBackoff) {
                await this.applyBackoff(sourceId, health.backoffLevel);
                // Record exclusion metric
                sourceExclusionTotal.inc({ source_id: sourceId, reason: 'strikes' });
            }
            // Update health status metric
            const updatedHealth = await prisma.sourceHealth.findUnique({ where: { sourceId } });
            const isCurrentlyExcluded = updatedHealth?.excludedUntil && new Date(updatedHealth.excludedUntil) > new Date();
            const isHealthy = !isCurrentlyExcluded && newStrikeCount < this.STRIKES_FOR_BACKOFF;
            sourceHealthStatus.set({ source_id: sourceId }, isHealthy ? 1 : 0);
            logger.debug({
                sourceId,
                latency,
                isSlow,
                strikeCount: newStrikeCount,
                slowRate: newSlowRate,
                sampleCount: health.sampleCount,
                backoffLevel: health.backoffLevel,
            }, "Source health metric recorded");
        }
        catch (error) {
            logger.error({ error, sourceId: metrics.sourceId }, "Failed to record health metric");
        }
    }
    /**
     * Apply backoff to a source
     * Backoff progression: 15m → 30m → 60m → 2h → 4h (client requirement)
     */
    static async applyBackoff(sourceId, currentBackoffLevel) {
        // Get current health to check if already in backoff
        const health = await prisma.sourceHealth.findUnique({ where: { sourceId } });
        if (!health)
            return;
        // If already excluded, escalate to next level
        const isCurrentlyExcluded = health.excludedUntil && new Date(health.excludedUntil) > new Date();
        let newBackoffLevel = currentBackoffLevel;
        if (isCurrentlyExcluded) {
            // Escalate to next backoff level
            newBackoffLevel = Math.min(currentBackoffLevel + 1, this.BACKOFF_DURATIONS_MS.length);
        }
        else {
            // First time backoff (after 3 strikes)
            newBackoffLevel = 1;
        }
        // Get backoff duration for this level (0-indexed, so subtract 1)
        const backoffIndex = Math.min(newBackoffLevel - 1, this.BACKOFF_DURATIONS_MS.length - 1);
        const backoffDurationMs = this.BACKOFF_DURATIONS_MS[backoffIndex];
        const excludedUntil = new Date(Date.now() + backoffDurationMs);
        await prisma.sourceHealth.update({
            where: { sourceId },
            data: {
                backoffLevel: newBackoffLevel,
                excludedUntil,
                strikeCount: 0, // Reset strikes when backoff is applied
            },
        });
        const backoffMinutes = backoffDurationMs / (60 * 1000);
        logger.warn({
            sourceId,
            backoffLevel: newBackoffLevel,
            backoffMinutes,
            excludedUntil,
        }, "Applied backoff to source");
    }
    /**
     * Reset backoff for a source (when source recovers)
     */
    static async resetBackoff(sourceId) {
        await prisma.sourceHealth.update({
            where: { sourceId },
            data: {
                backoffLevel: 0,
                excludedUntil: null,
                strikeCount: 0, // Reset strikes when source recovers
            },
        });
        logger.info({ sourceId }, "Reset backoff for source (recovered)");
    }
    /**
     * Check if a source is currently excluded
     */
    static async isSourceExcluded(sourceId) {
        if (!process.env.ENABLE_HEALTH_MONITOR || process.env.ENABLE_HEALTH_MONITOR !== 'true') {
            return false;
        }
        try {
            const health = await prisma.sourceHealth.findUnique({
                where: { sourceId },
            });
            if (!health || !health.excludedUntil) {
                return false;
            }
            const isExcluded = health.excludedUntil > new Date();
            if (!isExcluded && health.excludedUntil) {
                // Clean up expired exclusion
                await prisma.sourceHealth.update({
                    where: { sourceId },
                    data: { excludedUntil: null },
                });
            }
            return isExcluded;
        }
        catch (error) {
            logger.error({ error, sourceId }, "Failed to check source exclusion");
            return false;
        }
    }
    /**
     * Get health status for a source
     */
    static async getSourceHealth(sourceId) {
        try {
            const health = await prisma.sourceHealth.findUnique({
                where: { sourceId },
            });
            if (!health) {
                return {
                    sourceId,
                    healthy: true,
                    slowRate: 0,
                    sampleCount: 0,
                    backoffLevel: 0,
                    strikeCount: 0,
                    excludedUntil: null,
                    updatedAt: null,
                };
            }
            // Check if currently excluded (excludedUntil is in the future)
            const isCurrentlyExcluded = health.excludedUntil && new Date(health.excludedUntil) > new Date();
            // Calculate healthy status: not excluded AND strikes below threshold
            const isHealthy = !isCurrentlyExcluded && (health.strikeCount || 0) < this.STRIKES_FOR_BACKOFF;
            return {
                sourceId,
                healthy: isHealthy,
                slowRate: health.slowRate,
                sampleCount: health.sampleCount,
                backoffLevel: health.backoffLevel,
                strikeCount: health.strikeCount || 0,
                excludedUntil: health.excludedUntil ? health.excludedUntil.toISOString() : null,
                updatedAt: health.updatedAt ? health.updatedAt.toISOString() : null,
            };
        }
        catch (error) {
            logger.error({ error, sourceId }, "Failed to get source health");
            return {
                sourceId,
                healthy: true,
                slowRate: 0,
                sampleCount: 0,
                backoffLevel: 0,
                strikeCount: 0,
                excludedUntil: null,
                updatedAt: null,
            };
        }
    }
    /**
     * Reset health for a source (admin function)
     */
    static async resetSourceHealth(sourceId, resetBy) {
        await prisma.sourceHealth.upsert({
            where: { sourceId },
            update: {
                slowCount: 0,
                sampleCount: 0,
                slowRate: 0.0,
                backoffLevel: 0,
                excludedUntil: null,
                strikeCount: 0, // Reset strikes
                lastStrikeAt: null,
                lastResetBy: resetBy || null,
                lastResetAt: new Date(),
                updatedAt: new Date(),
            },
            create: {
                sourceId,
                slowCount: 0,
                sampleCount: 0,
                slowRate: 0.0,
                backoffLevel: 0,
                excludedUntil: null,
                strikeCount: 0,
                lastResetBy: resetBy || null,
                lastResetAt: new Date(),
            },
        });
        logger.info({ sourceId, resetBy }, "Reset source health");
    }
    /**
     * Get all source health statuses
     */
    static async getAllSourceHealth() {
        try {
            const healthRecords = await prisma.sourceHealth.findMany({
                orderBy: { updatedAt: 'desc' },
            });
            // Fetch company information for all sourceIds
            const sourceIds = healthRecords.map(h => h.sourceId);
            const companies = await prisma.company.findMany({
                where: { id: { in: sourceIds } },
                select: { id: true, companyName: true },
            });
            const companyMap = new Map(companies.map(c => [c.id, c]));
            return healthRecords.map((health) => {
                const isExcluded = health.excludedUntil && new Date(health.excludedUntil) > new Date();
                const SLOW_RATE_THRESHOLD = 0.5; // 50% slow rate threshold
                const isSlow = health.slowRate > SLOW_RATE_THRESHOLD;
                const company = companyMap.get(health.sourceId);
                let status;
                if (isExcluded) {
                    status = 'EXCLUDED';
                }
                else if (isSlow) {
                    status = 'SLOW';
                }
                else {
                    status = 'HEALTHY';
                }
                return {
                    companyId: health.sourceId,
                    companyName: company?.companyName || 'Unknown',
                    slowRate: health.slowRate,
                    sampleCount: health.sampleCount,
                    backoffLevel: health.backoffLevel,
                    strikeCount: health.strikeCount || 0,
                    excludedUntil: health.excludedUntil ? health.excludedUntil.toISOString() : null,
                    lastCheck: health.updatedAt.toISOString(),
                    status,
                    // Keep backward compatibility
                    sourceId: health.sourceId,
                    healthy: !isExcluded && (health.strikeCount || 0) < this.STRIKES_FOR_BACKOFF,
                    updatedAt: health.updatedAt,
                };
            });
        }
        catch (error) {
            logger.error({ error }, "Failed to get all source health");
            return [];
        }
    }
}
