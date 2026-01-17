// CRITICAL: Load environment variables FIRST before ANY other imports
// This ensures DATABASE_URL is available when Prisma Client modules are loaded
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// CRITICAL: Load .env file from multiple possible locations
// This ensures DATABASE_URL is available regardless of where the code runs
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
];
// Try loading from each path until one succeeds
let databaseUrl = process.env.DATABASE_URL;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error && result.parsed) {
        // Update databaseUrl if it was loaded from this file
        if (result.parsed.DATABASE_URL) {
            databaseUrl = result.parsed.DATABASE_URL;
        }
        break;
    }
}
// CRITICAL: Force set DATABASE_URL in process.env IMMEDIATELY
// This MUST happen before ANY Prisma-related imports
if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
    console.log("✓ DATABASE_URL loaded from .env file");
}
else if (!process.env.DATABASE_URL) {
    console.error("⚠️  WARNING: DATABASE_URL not found in .env file");
    console.error("   Tried paths:", envPaths.join(", "));
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
        await prisma.$queryRaw `SELECT 1`;
        logger.info("Database query test successful");
        return true;
    }
    catch (error) {
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
    // Start gRPC servers
    await startGrpcServers();
    await startPublicGrpcServer();
    // Test gRPC client connectivity
    try {
        const sourceHealth = createHealthClient(config.sourceGrpcAddr);
        await sourceHealth.check();
        logger.info({ addr: config.sourceGrpcAddr }, "Source gRPC client connected");
    }
    catch (error) {
        logger.warn({ addr: config.sourceGrpcAddr, error: error.message }, "Source gRPC client failed");
    }
    try {
        const agentHealth = createHealthClient(config.agentGrpcAddr);
        await agentHealth.check();
        logger.info({ addr: config.agentGrpcAddr }, "Agent gRPC client connected");
    }
    catch (error) {
        logger.warn({ addr: config.agentGrpcAddr, error: error.message }, "Agent gRPC client failed");
    }
    const app = buildApp();
    // Add catch-all error handler to prevent crashes
    app.use((err, req, res, next) => {
        logger.error({ err, path: req.path }, "Unhandled route error");
        if (!res.headersSent) {
            res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
        }
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
    server.on('error', (err) => {
        logger.error({ err }, "HTTP server error");
    });
    server.on('clientError', (err, socket) => {
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
