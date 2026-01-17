// CRITICAL: Load environment variables BEFORE importing PrismaClient
// Prisma Client validates schema.prisma at module initialization time
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
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '..', '.env'),
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
// This MUST happen before ANY PrismaClient import
// Prisma schema.prisma uses env("DATABASE_URL") which reads from process.env at module load time
if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
}
else if (!process.env.DATABASE_URL) {
    // Last resort: try to get it from environment (PM2 should set this)
    const errorMsg = "❌ DATABASE_URL is not set in environment variables!\n" +
        "Please check your .env file or PM2 environment configuration.\n" +
        "Expected format: DATABASE_URL=\"mysql://username:password@host:port/database_name\"\n" +
        "Current working directory: " + process.cwd() + "\n" +
        "__dirname: " + __dirname + "\n" +
        "Tried paths: " + envPaths.join(", ");
    console.error(errorMsg);
    // In production, try to continue but log the error
    if (process.env.NODE_ENV !== 'production') {
        throw new Error("DATABASE_URL must be set before importing PrismaClient");
    }
}
// CRITICAL: Double-check DATABASE_URL is set before importing PrismaClient
if (!process.env.DATABASE_URL) {
    throw new Error("FATAL: DATABASE_URL must be set in process.env before creating PrismaClient. " +
        "Check your .env file and PM2 configuration.");
}
// NOW import PrismaClient - DATABASE_URL MUST be in process.env at this point
import { PrismaClient } from "@prisma/client";
// Create Prisma client with explicit DATABASE_URL
export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
// Handle Prisma connection lifecycle
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
// Log DATABASE_URL on startup (hide password)
if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`📋 Prisma DATABASE_URL: ${safeUrl}`);
}
else {
    console.warn("⚠️  DATABASE_URL not set - Prisma operations will fail!");
}
