import { prisma } from "../data/prisma.js";
import { logger } from "./logger.js";
// [AUTO-AUDIT] Global IP whitelist middleware (skippable via DISABLE_IP_WHITELIST)
export function ipWhitelist() {
    const disabled = (process.env.DISABLE_IP_WHITELIST || "false").toLowerCase() === "true";
    return async (req, res, next) => {
        if (disabled)
            return next();
        try {
            const fwd = req.headers["x-forwarded-for"] || "";
            const ip = fwd.split(",")[0].trim() || (req.socket.remoteAddress || "");
            const type = req.user?.type?.toLowerCase?.() || "agent";
            const found = await prisma.whitelistedIp.findFirst({ where: { ip, type, enabled: true } });
            if (!found) {
                logger.warn({ ip, type, path: req.path }, "[AUTO-AUDIT] IP rejected by whitelist");
                return res.status(403).json({ error: "FORBIDDEN", message: "IP not whitelisted" });
            }
            return next();
        }
        catch (e) {
            logger.error({ error: e.message }, "[AUTO-AUDIT] IP whitelist error");
            return res.status(500).json({ error: "INTERNAL", message: "Whitelist check failed" });
        }
    };
}
// TODO: mTLS could be enforced here in future (certificate pinning)
