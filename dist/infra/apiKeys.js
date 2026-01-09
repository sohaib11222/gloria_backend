import crypto from "crypto";
import { prisma } from "../data/prisma.js";
// [AUTO-AUDIT] Helper around ApiKey storage and hashing
export async function validateApiKey(plainKey) {
    const hash = crypto.createHmac("sha512", process.env.API_KEY_SALT || "").update(plainKey).digest("hex");
    const row = await prisma.apiKey.findFirst({ where: { keyHash: hash, status: "active" } });
    if (!row)
        return null;
    return {
        companyId: row.ownerId,
        role: row.ownerType === "admin" ? "ADMIN" : "USER",
        type: row.ownerType.toUpperCase(),
        apiKeyId: row.id,
        permissions: row.permissions || [],
    };
}
export async function createApiKey(params) {
    const plain = `ak_${crypto.randomBytes(18).toString("hex")}`;
    const keyHash = crypto.createHmac("sha512", process.env.API_KEY_SALT || "").update(plain).digest("hex");
    const row = await prisma.apiKey.create({
        data: {
            name: params.name,
            ownerType: params.ownerType,
            ownerId: params.ownerId,
            keyHash,
            permissions: (params.permissions ?? []),
            status: "active",
        },
    });
    return { id: row.id, key: plain };
}
