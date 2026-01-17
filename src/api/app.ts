import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "../infra/logger.js";
import { requestId } from "../infra/requestId.js";
import { defaultLimiter } from "../infra/rateLimit.js";
import { errorHandler } from "../infra/error.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { availabilityRouter } from "./routes/availability.routes.js";
import { bookingsRouter } from "./routes/bookings.routes.js";
import { agreementsRouter } from "./routes/agreements.routes.js";
import { locationsRouter } from "./routes/locations.routes.js";
import { verificationRouter } from "./routes/verification.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { logsRouter } from "./routes/logs.routes.js";
import { adminGrpcRouter } from "./routes/adminGrpc.routes.js";
import { endpointsRouter } from "./routes/endpoints.routes.js";
import { locationValidationRouter } from "./routes/locationValidation.routes.js";
import { sourcesRouter } from "./routes/sources.routes.js";
import { supportRouter } from "./routes/support.routes.js";
import adminTestRoutes from "./routes/adminTest.routes.js";
import uiRoutes from "./routes/ui.routes.js";
// import adminGrpcRoutes from "../routes/adminGrpc.js"; // Commented out - file not found
import { adminGrpcRouter as newAdminGrpcRouter } from "../routes/admin/grpc.routes.js";
import { adminSourcesRouter } from "../routes/admin/sources.routes.js";
import docsRouter from "./routes/docs.routes.js";
import sdkRouter from "./routes/sdk.routes.js";
import { mountSwagger } from "./swagger.js";
import { register } from "../services/metrics.js";
import { otaMapper } from "./middleware/otaMapper.js";
import { ipWhitelist } from "../infra/ipWhitelist.js"; // [AUTO-AUDIT]

export function buildApp() {
  const app = express();
  
  // CORS - MUST BE FIRST to allow all origins and methods
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Idempotency-Key', 'X-Agent-Email', 'X-Api-Key'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));
  
  // Handle OPTIONS preflight for all routes
  app.options('*', (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Idempotency-Key, X-Agent-Email, X-Api-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.sendStatus(204);
  });

  // Global CORS headers middleware - applied to all requests
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Idempotency-Key, X-Agent-Email, X-Api-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Expose-Headers', '*');
    next();
  });

  // Body parsing middleware - must be careful with multipart/form-data
  // JSON parser - skip for multipart/form-data (handled by multer)
  app.use((req: any, res: any, next: any) => {
    const contentType = req.headers['content-type'] || '';
    
    // Skip ALL body parsing for multipart/form-data - multer will handle it
    if (contentType.includes('multipart/form-data')) {
      return next();
    }
    
    // For other content types, use JSON parser
    express.json({ limit: "2mb" })(req, res, next);
  });
  
  // Helmet with relaxed CSP for development - AFTER CORS
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // Disable CSP to avoid CORS-like restrictions
  }));
  
  app.use(requestId());
  // Only log availability routes to reduce noise
  app.use(pinoHttp({ 
    logger,
    autoLogging: {
      ignore: (req: any) => {
        // Only log availability routes
        const path = req.url || '';
        return !path.includes('/availability');
      }
    }
  } as any));

  // [AUTO-AUDIT] Enforce IP whitelist globally (can be disabled via env)
  // app.use(ipWhitelist());

  app.use(defaultLimiter);

  app.use(healthRouter);
  // Mount auth router with /api prefix to match frontend expectations
  app.use("/api", authRouter);
  app.use(authRouter); // Also mount without prefix for backward compatibility
  
  // Apply OTA mapper to availability and bookings routes
  app.use('/availability', otaMapper, availabilityRouter);
  app.use('/api/availability', otaMapper, availabilityRouter);
  app.use('/bookings', otaMapper, bookingsRouter);
  app.use('/api/bookings', otaMapper, bookingsRouter);
  
  // Mount agreements router with /api prefix to match frontend expectations
  app.use("/api", agreementsRouter);
  app.use(agreementsRouter); // Also mount without prefix for backward compatibility
  app.use(locationsRouter);
  app.use(verificationRouter);
  app.use(endpointsRouter);
  app.use(locationValidationRouter);
  app.use(sourcesRouter);
  app.use(supportRouter);
  // Mount support router with /api prefix to match frontend expectations
  app.use("/api", supportRouter);
  app.use(logsRouter);
  // Mount admin routes with /api prefix to match frontend expectations
  app.use("/api", adminRouter);
  app.use("/api", adminGrpcRouter);
  // Also mount without prefix for backward compatibility
  app.use(adminRouter);
  app.use(adminGrpcRouter);
  // app.use("/admin/grpc", adminGrpcRoutes); // Commented out - import removed
  app.use("/admin/grpc", newAdminGrpcRouter);
  app.use("/api/admin/grpc", newAdminGrpcRouter);
  app.use("/admin", adminSourcesRouter);
  app.use("/api/admin", adminSourcesRouter);
  app.use("/admin/test", adminTestRoutes);
  app.use("/api/admin/test", adminTestRoutes);
  app.use("/ui", uiRoutes);
  app.use("/docs", docsRouter);
  app.use("/docs", sdkRouter);

  // Prometheus metrics endpoint
  app.get('/metrics', async (req: any, res: any) => {
    try {
      // Set CORS headers explicitly
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Content-Type', register.contentType);
      
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Error generating metrics');
      res.status(500).set('Content-Type', 'text/plain').end('Error generating metrics');
    }
  });

  // Handle OPTIONS preflight for /metrics
  app.options('/metrics', (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
  });

  mountSwagger(app);
  app.use(errorHandler);
  return app;
}




