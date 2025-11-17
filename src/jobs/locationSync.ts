import cron from "node-cron";
import { prisma } from "../data/prisma.js";
import { getAdapterForSource } from "../adapters/registry.js";
import { logger } from "../infra/logger.js";

/**
 * Every 6 hours:
 * 1) For each active source, fetch base locations via gRPC GetLocations()
 * 2) Upsert into sourceLocation table
 * 3) (Per-agreement coverage differences are applied by overrides at read time)
 */
export function startLocationSync() {
  const enabled = (process.env.ENABLE_LOCATION_SYNC || "true") === "true";
  if (!enabled) return;

  cron.schedule("0 */6 * * *", async () => {
    logger.info("⏳ Location sync started");
    const sources = await prisma.company.findMany({ where: { type: "SOURCE", status: "ACTIVE" }, select: { id: true }});
    for (const s of sources) {
      try {
        const adapter = getAdapterForSource(s.id);
        const res = await adapter.getLocations(); // must return { locations: [{ unlocode, name }] }
        if (!res?.locations) continue;

        for (const loc of res.locations) {
          await prisma.sourceLocation.upsert({
            where: { sourceId_unlocode: { sourceId: s.id, unlocode: loc.unlocode }},
            update: { name: loc.name },
            create: { sourceId: s.id, unlocode: loc.unlocode, name: loc.name }
          });
        }
        logger.info({ sourceId: s.id, count: res.locations.length }, "✅ Location sync ok");
      } catch (e) {
        logger.warn({ sourceId: s.id, err: (e as Error).message }, "⚠️ Location sync failed");
      }
    }
    logger.info("✅ Location sync finished");
  });
}
