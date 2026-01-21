import rateLimit from "express-rate-limit";

// CRITICAL: Skip rate limiting for OPTIONS preflight requests
// This ensures CORS preflight requests are never blocked
export const defaultLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => {
    // Skip rate limiting for OPTIONS requests (CORS preflight)
    return req.method === 'OPTIONS';
  },
  // Skip rate limiting for /api/auth/login and /api/auth/register to prevent blocking
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});




