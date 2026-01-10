import { prisma } from "../data/prisma.js";
import dns from "dns";
import { promisify } from "util";
const lookup = promisify(dns.lookup);
/**
 * Normalize whitelist entries (lowercase, trim)
 */
export function normalizeWhitelist(whitelist) {
    if (!whitelist)
        return [];
    return whitelist
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(item => item.length > 0);
}
/**
 * Check if a host/IP is whitelisted
 */
export async function isWhitelisted(companyId, targetUrl) {
    try {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { whitelistedDomains: true }
        });
        if (!company) {
            return { allowed: false, reason: "Company not found" };
        }
        const whitelist = normalizeWhitelist(company.whitelistedDomains);
        // If no whitelist configured, allow all (backward compatibility)
        if (whitelist.length === 0) {
            return { allowed: true };
        }
        // Parse target URL
        let targetHost;
        try {
            const url = new URL(targetUrl);
            targetHost = url.hostname.toLowerCase();
        }
        catch {
            // If not a valid URL, treat as hostname
            targetHost = targetUrl.toLowerCase();
        }
        // Check direct hostname match
        if (whitelist.includes(targetHost)) {
            return { allowed: true };
        }
        // Check IP match (resolve hostname if needed)
        let targetIp = null;
        try {
            // Check if targetHost is already an IP
            if (/^\d+\.\d+\.\d+\.\d+$/.test(targetHost)) {
                targetIp = targetHost;
            }
            else {
                // Resolve hostname to IP
                const resolved = await lookup(targetHost);
                targetIp = resolved.address;
            }
        }
        catch (e) {
            // DNS resolution failed
            return { allowed: false, reason: `DNS resolution failed for ${targetHost}` };
        }
        // Check if resolved IP is in whitelist
        if (targetIp && whitelist.includes(targetIp)) {
            return { allowed: true };
        }
        // Check wildcard domain matches (e.g., *.example.com)
        for (const pattern of whitelist) {
            if (pattern.startsWith('*.')) {
                const domain = pattern.slice(2);
                if (targetHost.endsWith('.' + domain) || targetHost === domain) {
                    return { allowed: true };
                }
            }
        }
        return {
            allowed: false,
            reason: `Host ${targetHost} (${targetIp}) is not whitelisted`
        };
    }
    catch (error) {
        return {
            allowed: false,
            reason: `Whitelist check failed: ${error.message}`
        };
    }
}
/**
 * Enforce whitelist check and throw if not allowed
 */
export async function enforceWhitelist(companyId, targetUrl) {
    const check = await isWhitelisted(companyId, targetUrl);
    if (!check.allowed) {
        throw new Error(check.reason || "Whitelist check failed");
    }
}
