import { prisma } from "../data/prisma.js";
import { logger } from "../infra/logger.js";
import { sourceExclusionTotal, sourceHealthStatus } from "./metrics.js";

export interface HealthMetrics {
  latency: number;
  success: boolean;
  sourceId: string;
}

export class SourceHealthService {
  private static readonly SLOW_THRESHOLD_MS = 3000;
  private static readonly SLOW_RATE_THRESHOLD = 0.2;
  private static readonly MIN_SAMPLES_FOR_BACKOFF = 100;
  private static readonly MAX_BACKOFF_HOURS = 24;

  /**
   * Record a health metric for a source
   */
  static async recordMetric(metrics: HealthMetrics): Promise<void> {
    if (!process.env.ENABLE_HEALTH_MONITOR || process.env.ENABLE_HEALTH_MONITOR !== 'true') {
      return;
    }

    try {
      const { latency, success, sourceId } = metrics;
      const isSlow = latency > this.SLOW_THRESHOLD_MS;

      // Upsert health record
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
        },
      });

      // Calculate new slow rate
      const newSlowRate = health.slowCount / health.sampleCount;

      // Update slow rate
      await prisma.sourceHealth.update({
        where: { sourceId },
        data: { slowRate: newSlowRate },
      });

      // Check if we need to apply backoff
      if (
        health.sampleCount >= this.MIN_SAMPLES_FOR_BACKOFF &&
        newSlowRate > this.SLOW_RATE_THRESHOLD
      ) {
        await this.applyBackoff(sourceId, health.backoffLevel);
        // Record exclusion metric
        sourceExclusionTotal.inc({ source_id: sourceId, reason: 'slow_rate' });
      } else if (newSlowRate <= this.SLOW_RATE_THRESHOLD && health.backoffLevel > 0) {
        // Reset backoff if healthy
        await this.resetBackoff(sourceId);
      }

      // Update health status metric
      const isHealthy = newSlowRate <= this.SLOW_RATE_THRESHOLD && !health.excludedUntil;
      sourceHealthStatus.set({ source_id: sourceId }, isHealthy ? 1 : 0);

      logger.debug({
        sourceId,
        latency,
        isSlow,
        slowRate: newSlowRate,
        sampleCount: health.sampleCount,
        backoffLevel: health.backoffLevel,
      }, "Source health metric recorded");
    } catch (error) {
      logger.error({ error, sourceId: metrics.sourceId }, "Failed to record health metric");
    }
  }

  /**
   * Apply backoff to a source
   */
  private static async applyBackoff(sourceId: string, currentBackoffLevel: number): Promise<void> {
    const newBackoffLevel = Math.min(currentBackoffLevel + 1, 10); // Max 10 levels
    const backoffHours = Math.min(Math.pow(2, newBackoffLevel), this.MAX_BACKOFF_HOURS);
    const excludedUntil = new Date(Date.now() + backoffHours * 60 * 60 * 1000);

    await prisma.sourceHealth.update({
      where: { sourceId },
      data: {
        backoffLevel: newBackoffLevel,
        excludedUntil,
      },
    });

    logger.warn({
      sourceId,
      backoffLevel: newBackoffLevel,
      backoffHours,
      excludedUntil,
    }, "Applied backoff to source");
  }

  /**
   * Reset backoff for a source
   */
  private static async resetBackoff(sourceId: string): Promise<void> {
    await prisma.sourceHealth.update({
      where: { sourceId },
      data: {
        backoffLevel: 0,
        excludedUntil: null,
      },
    });

    logger.info({ sourceId }, "Reset backoff for source");
  }

  /**
   * Check if a source is currently excluded
   */
  static async isSourceExcluded(sourceId: string): Promise<boolean> {
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
    } catch (error) {
      logger.error({ error, sourceId }, "Failed to check source exclusion");
      return false;
    }
  }

  /**
   * Get health status for a source
   */
  static async getSourceHealth(sourceId: string) {
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
          excludedUntil: null,
        };
      }

      return {
        sourceId,
        healthy: health.slowRate <= this.SLOW_RATE_THRESHOLD && !health.excludedUntil,
        slowRate: health.slowRate,
        sampleCount: health.sampleCount,
        backoffLevel: health.backoffLevel,
        excludedUntil: health.excludedUntil,
      };
    } catch (error) {
      logger.error({ error, sourceId }, "Failed to get source health");
      return {
        sourceId,
        healthy: true,
        slowRate: 0,
        sampleCount: 0,
        backoffLevel: 0,
        excludedUntil: null,
      };
    }
  }

  /**
   * Reset health for a source (admin function)
   */
  static async resetSourceHealth(sourceId: string, resetBy?: string): Promise<void> {
    await prisma.sourceHealth.upsert({
      where: { sourceId },
      update: {
        slowCount: 0,
        sampleCount: 0,
        slowRate: 0.0,
        backoffLevel: 0,
        excludedUntil: null,
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

      return healthRecords.map((health: any) => ({
        sourceId: health.sourceId,
        healthy: health.slowRate <= this.SLOW_RATE_THRESHOLD && !health.excludedUntil,
        slowRate: health.slowRate,
        sampleCount: health.sampleCount,
        backoffLevel: health.backoffLevel,
        excludedUntil: health.excludedUntil,
        updatedAt: health.updatedAt,
      }));
    } catch (error) {
      logger.error({ error }, "Failed to get all source health");
      return [];
    }
  }
}
