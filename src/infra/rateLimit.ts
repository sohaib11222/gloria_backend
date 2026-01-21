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
  skipFailedRequests: false,
  // Validate X-Forwarded-For header to prevent errors when proxied through nginx
  validate: {
    xForwardedForHeader: false, // Disable validation to prevent ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  },
});




