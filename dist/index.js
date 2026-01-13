// ABSOLUTE CRITICAL: Set DATABASE_URL BEFORE ANY imports
// This must be the VERY FIRST thing that runs - Prisma Client checks this at import time
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple paths for .env file
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    '/var/www/gloriaconnect/backend/.env'
];

let databaseUrlSet = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        try {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            for (const line of lines) {
                if (line.startsWith('DATABASE_URL=')) {
                    const value = line.substring(13).trim().replace(/^["']|["']$/g, '');
                    // Set it multiple ways to ensure Prisma finds it
                    process.env.DATABASE_URL = value;
                    // Make it non-enumerable but still accessible
                    Object.defineProperty(process.env, 'DATABASE_URL', {
                        value: value,
                        writable: true,
                        enumerable: true,
                        configurable: true
                    });
                    databaseUrlSet = true;
                    console.log("✓ DATABASE_URL loaded from:", envPath);
                    break;
                }
            }
            if (databaseUrlSet) break;
        } catch (e) {
            console.warn("Failed to read .env from:", envPath, e.message);
        }
    }
}

// Now import dotenv for other variables (but DATABASE_URL is already set above)
import "dotenv/config";
import dotenv from "dotenv";

// Final verification - this MUST be true before any Prisma imports
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL not found in environment!");
    console.error("Current working directory:", process.cwd());
    console.error("__dirname:", __dirname);
    process.exit(1);
} else {
    console.log("✓ DATABASE_URL verified in process.env:", !!process.env.DATABASE_URL);
    console.log("✓ DATABASE_URL value:", process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
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

