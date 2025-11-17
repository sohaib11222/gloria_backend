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
import adminTestRoutes from "./routes/adminTest.routes.js";
import uiRoutes from "./routes/ui.routes.js";
// import adminGrpcRoutes from "../routes/adminGrpc.js"; // Commented out - file not found
import { adminGrpcRouter as newAdminGrpcRouter } from "../routes/admin/grpc.routes.js";
import { adminSourcesRouter } from "../routes/admin/sources.routes.js";
import docsRouter from "./routes/docs.routes.js";
import { mountSwagger } from "./swagger.js";
import { register } from "../services/metrics.js";
import { otaMapper } from "./middleware/otaMapper.js";
import { ipWhitelist } from "../infra/ipWhitelist.js"; // [AUTO-AUDIT]

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(helmet());
  app.use(cors());
  app.use(requestId());
  app.use(pinoHttp({ logger } as any));

  // [AUTO-AUDIT] Enforce IP whitelist globally (can be disabled via env)
  // app.use(ipWhitelist());

  app.use(defaultLimiter);

  app.use(healthRouter);
  app.use(authRouter);
  
  // Apply OTA mapper to availability and bookings routes
  app.use('/availability', otaMapper, availabilityRouter);
  app.use('/bookings', otaMapper, bookingsRouter);
  
  app.use(agreementsRouter);
  app.use(locationsRouter);
  app.use(verificationRouter);
  app.use(endpointsRouter);
  app.use(locationValidationRouter);
  app.use(logsRouter);
  app.use(adminRouter);
  app.use(adminGrpcRouter);
  // app.use("/admin/grpc", adminGrpcRoutes); // Commented out - import removed
  app.use("/admin/grpc", newAdminGrpcRouter);
  app.use("/admin", adminSourcesRouter);
  app.use("/admin/test", adminTestRoutes);
  app.use("/ui", uiRoutes);
  app.use("/docs", docsRouter);

  // Prometheus metrics endpoint
  app.get('/metrics', async (req: any, res: any) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      res.status(500).end('Error generating metrics');
    }
  });

  mountSwagger(app);
  app.use(errorHandler);
  return app;
}




