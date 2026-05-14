// CRITICAL: Load environment variables FIRST before ANY other imports
// This ensures DATABASE_URL is available when Prisma Client modules are loaded
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRITICAL: Load .env from the application directory first (PM2 cwd is often not the app folder).
// `import "dotenv/config"` already loaded process.cwd()/.env — we override with the real app .env next.
const appEnvPath = path.resolve(__dirname, "../.env");
const cwdEnvPath = path.resolve(process.cwd(), ".env");

let databaseUrl = process.env.DATABASE_URL;

const primary = dotenv.config({ path: appEnvPath, override: true });
if (!primary.error && primary.parsed) {
  if (primary.parsed.DATABASE_URL) {
    databaseUrl = primary.parsed.DATABASE_URL;
  }
  // Merge cwd .env only for keys missing from app .env (dev convenience)
  dotenv.config({ path: cwdEnvPath, override: false });
} else {
  const fallback = dotenv.config({ path: cwdEnvPath, override: true });
  if (!fallback.error && fallback.parsed?.DATABASE_URL) {
    databaseUrl = fallback.parsed.DATABASE_URL;
  }
  const upTwo = path.resolve(__dirname, "../../.env");
  if (!databaseUrl) {
    const t = dotenv.config({ path: upTwo, override: false });
    if (!t.error && t.parsed?.DATABASE_URL) {
      databaseUrl = t.parsed.DATABASE_URL;
    }
  }
}

// CRITICAL: Force set DATABASE_URL in process.env IMMEDIATELY
// This MUST happen before ANY Prisma-related imports
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  console.log("✓ DATABASE_URL loaded from .env file");
} else if (!process.env.DATABASE_URL) {
  console.error("⚠️  WARNING: DATABASE_URL not found in .env file");
  console.error("   Tried app .env:", appEnvPath);
  console.error("   Tried cwd .env:", cwdEnvPath);
  console.error("   Current working directory:", process.cwd());
  console.error("   __dirname:", __dirname);
  // Don't exit - let prisma.ts handle the error
}

import { buildApp } from "./api/app.js";
import { logger } from "./infra/logger.js";
import { startGrpcServers } from "./grpc/server.js";
import { startPublicGrpcServer } from "./grpc/publicServer.js";
import { createHealthClient } from "./infra/grpcClients.js";
import { config } from "./infra/config.js";
import { startLocationSync } from "./jobs/locationSync.js";
import { prisma } from "./data/prisma.js";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "UnhandledPromiseRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "UncaughtException");
});

const PORT = Number(process.env.PORT || 8080);

async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info("Database connection successful");
    
    // Test a simple query
    await prisma.$queryRaw`SELECT 1`;
    logger.info("Database query test successful");
    return true;
  } catch (error: any) {
    logger.error({ 
      error: error.message,
      code: error.code,
      hint: "Check your DATABASE_URL in .env file"
    }, "Database connection failed");
    
    if (error.message?.includes('Access denied')) {
      logger.error({
        message: "MySQL authentication failed",
        solution: "Update DATABASE_URL in .env file",
        format: "mysql://username:password@host:port/database_name"
      }, "Database configuration error");
    }
    
    return false;
  }
}

async function main() {
  // Test database connection first
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    logger.error("Cannot start server without database connection");
    process.exit(1);
  }
  
  // Start gRPC servers (non-blocking - don't fail HTTP server if gRPC fails)
  startGrpcServers().catch((err: any) => {
    logger.error({ error: err.message }, "Failed to start gRPC core server (non-fatal)");
  });
  
  startPublicGrpcServer().catch((err: any) => {
    logger.error({ error: err.message }, "Failed to start public gRPC server (non-fatal)");
  });
  
  // Test gRPC client connectivity (non-blocking)
  setTimeout(() => {
    createHealthClient(config.sourceGrpcAddr).check()
      .then(() => logger.info({ addr: config.sourceGrpcAddr }, "Source gRPC client connected"))
      .catch((error: any) => logger.warn({ addr: config.sourceGrpcAddr, error: error.message }, "Source gRPC client failed"));
    
    createHealthClient(config.agentGrpcAddr).check()
      .then(() => logger.info({ addr: config.agentGrpcAddr }, "Agent gRPC client connected"))
      .catch((error: any) => logger.warn({ addr: config.agentGrpcAddr, error: error.message }, "Agent gRPC client failed"));
  }, 2000); // Wait 2 seconds for gRPC servers to start
  
  const app = buildApp();
  
  // Add catch-all error handler to prevent crashes
  app.use((err: any, req: any, res: any, _next: any) => {
    logger.error({ err, path: req.path }, "Unhandled route error (after primary errorHandler)");
    if (res.headersSent) return;
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: typeof err?.message === "string" ? err.message : "An unexpected error occurred",
      requestId: req.requestId,
    });
  });
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ 
      port: PORT,
      sourceGrpcAddr: config.sourceGrpcAddr,
      agentGrpcAddr: config.agentGrpcAddr,
      features: config.features
    }, "HTTP server listening");
    
    // Start location sync job
    startLocationSync();
  });
  
  // Handle server errors
  server.on('error', (err: any) => {
    logger.error({ err }, "HTTP server error");
    if (err.code === 'EADDRINUSE') {
      logger.error({ port: PORT }, `Port ${PORT} is already in use. Please stop the process using this port or change PORT in .env`);
      process.exit(1);
    }
  });
  
  server.on('clientError', (err: any, socket: any) => {
    logger.warn({ err }, "HTTP client error");
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
}

main().catch((e) => {
  logger.error({ error: e }, "Failed to start server");
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});




