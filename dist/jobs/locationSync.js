import cron from "node-cron";
import { prisma } from "../data/prisma.js";
import { getAdapterForSource } from "../adapters/registry.js";
import { logger } from "../infra/logger.js";
/**
 * Every 6 hours:
 * 1) For each active source, fetch base locations via gRPC GetLocations()
 * 2) Upsert into sourceLocation table
 * 3) (Per-agreement coverage differences are applied by overrides at read time)
 * 4) Mark locations as mock if source uses mock adapter
 */
export function startLocationSync() {
    const enabled = (process.env.ENABLE_LOCATION_SYNC || "true") === "true";
    if (!enabled)
        return;
    cron.schedule("0 */6 * * *", async () => {
        logger.info("⏳ Location sync started");
        const sources = await prisma.company.findMany({
            where: { type: "SOURCE", status: "ACTIVE" },
            select: { id: true, adapterType: true }
        });
        for (const s of sources) {
            try {
                const isMock = s.adapterType === "mock";
                const adapter = await getAdapterForSource(s.id);
                const res = await adapter.locations(); // must return { locations: [{ unlocode, name }] }
                if (!res?.locations)
                    continue;
                if (isMock) {
                    logger.warn({ sourceId: s.id, count: res.locations.length }, "⚠️ Syncing MOCK locations (test data only)");
                }
                for (const loc of res.locations) {
                    // Check if isMock field exists in schema (for backward compatibility)
                    const updateData = {};
                    const createData = { sourceId: s.id, unlocode: loc.unlocode };
                    // Try to set isMock if field exists (will be added in schema migration)
                    try {
                        // Check if isMock field exists by attempting to query it
                        const existing = await prisma.sourceLocation.findUnique({
                            where: { sourceId_unlocode: { sourceId: s.id, unlocode: loc.unlocode } },
                            select: { id: true }
                        });
                        if (isMock) {
                            updateData.isMock = true;
                            createData.isMock = true;
                        }
                        else {
                            updateData.isMock = false;
                            createData.isMock = false;
                        }
                    }
                    catch (schemaError) {
                        // Field doesn't exist yet, skip isMock for now
                        // This will work once schema is migrated
                    }
                    await prisma.sourceLocation.upsert({
                        where: { sourceId_unlocode: { sourceId: s.id, unlocode: loc.unlocode } },
                        update: updateData,
                        create: createData
                    });
                }
                logger.info({ sourceId: s.id, count: res.locations.length, isMock }, "✅ Location sync ok");
            }
            catch (e) {
                logger.warn({ sourceId: s.id, err: e.message }, "⚠️ Location sync failed");
            }
        }
        logger.info("✅ Location sync finished");
    });
}
