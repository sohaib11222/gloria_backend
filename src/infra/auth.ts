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
// For booking test endpoints, also accept email-based authentication (X-Agent-Email header)
export function requireAuth() {
  return async (req: any, res: any, next: any) => {
    // Check if this is a booking test endpoint - check multiple path properties
    // Express routes might have path as just "/test/create" if router is mounted at "/bookings"
    const path = req.path || req.url || '';
    const originalUrl = req.originalUrl || req.url || '';
    const baseUrl = req.baseUrl || '';
    const fullPath = baseUrl + path;
    
    const isBookingTestEndpoint = 
      path.includes('/test/') || 
      path.startsWith('/test/') ||
      originalUrl.includes('/bookings/test/') ||
      originalUrl.includes('/test/') ||
      fullPath.includes('/bookings/test/') ||
      fullPath.includes('/test/');
    
    // For booking test endpoints, allow email-based authentication
    if (isBookingTestEndpoint) {
      // Check for email header in various case formats
      const agentEmail = (req.headers["x-agent-email"] || 
                         req.headers["X-Agent-Email"] || 
                         req.headers["X-AGENT-EMAIL"] ||
                         req.headers["x-Agent-Email"]) as string | undefined;
      
      console.log('[requireAuth] Booking test endpoint detected:', {
        path,
        originalUrl,
        baseUrl,
        fullPath,
        isBookingTestEndpoint,
        agentEmail: agentEmail ? `Present: ${agentEmail}` : 'Missing',
        allHeaders: Object.keys(req.headers).filter(k => k.toLowerCase().includes('agent') || k.toLowerCase().includes('email')),
        headerValues: {
          'x-agent-email': req.headers["x-agent-email"],
          'X-Agent-Email': req.headers["X-Agent-Email"],
        }
      });
      
      if (agentEmail) {
        try {
          const user = await prisma.user.findUnique({
            where: { email: agentEmail },
            include: { company: true }
          });
          
          if (!user || !user.company) {
            console.log('[requireAuth] User not found for email:', agentEmail);
            return res.status(401).json({ error: "AUTH_ERROR", message: "Agent not found" });
          }
          
          // Verify it's an AGENT type company
          if (user.company.type !== "AGENT") {
            console.log('[requireAuth] User is not an agent:', user.company.type);
            return res.status(403).json({ error: "FORBIDDEN", message: "Only agents can access booking test endpoints" });
          }
          
          console.log('[requireAuth] Email-based auth successful for:', agentEmail);
          req.user = {
            sub: user.id,
            companyId: user.companyId,
            role: user.role,
            type: user.company.type,
          };
          return next();
        } catch (e: any) {
          console.error('[requireAuth] Email-based auth error:', e);
          return res.status(401).json({ error: "AUTH_ERROR", message: "Authentication failed" });
        }
      } else {
        console.log('[requireAuth] No agent email header found, falling back to token/auth');
      }
    }
    
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
      const decoded = Auth.verify(token) as any;
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid token" });
    }
  };
}




