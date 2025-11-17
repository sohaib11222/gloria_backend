import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../data/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "15m";
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d";

export const Auth = {
  signAccess(payload: any) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES } as any);
  },
  signRefresh(payload: any) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES } as any);
  },
  verify(token: string) {
    return jwt.verify(token, JWT_SECRET);
  },
  hash(password: string) {
    return bcrypt.hash(password, 10);
  },
  compare(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }
};

// Convenience wrapper for external modules using ESM .js imports
export function verifyAccessToken(token: string) {
  return Auth.verify(token);
}

// [AUTO-AUDIT] Accept either JWT (Authorization: Bearer ...) or API key (x-api-key)
export function requireAuth() {
  return async (req: any, res: any, next: any) => {
    const apiKey = (req.headers["x-api-key"] || req.headers["X-Api-Key"]) as string | undefined;
    if (apiKey) {
      try {
        const hashed = crypto.createHmac("sha512", process.env.API_KEY_SALT || "").update(apiKey).digest("hex");
        // [AUTO-AUDIT] Updated to use keyHash column
        const keyRow = await prisma.apiKey.findFirst({ where: { keyHash: hashed, status: "active" } });
        if (!keyRow) return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid API key" });
        req.user = {
          companyId: keyRow.ownerId,
          role: keyRow.ownerType === "admin" ? "ADMIN" : "USER",
          type: keyRow.ownerType.toUpperCase(),
          apiKeyId: keyRow.id,
          permissions: keyRow.permissions || [],
        };
        return next();
      } catch (e) {
        return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid API key" });
      }
    }

    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: "AUTH_ERROR", message: "Missing token" });
    try {
      const decoded = Auth.verify(token);
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid token" });
    }
  };
}




