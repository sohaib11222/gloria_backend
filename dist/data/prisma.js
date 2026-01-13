// CRITICAL: Load environment variables BEFORE importing PrismaClient
// Prisma Client validates schema.prisma at module initialization time
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
// Load .env file - try multiple paths to ensure it's found
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
];
// Try loading from each path
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error && result.parsed) {
        break;
    }
}
// Ensure DATABASE_URL is loaded and set in process.env
// This MUST happen before PrismaClient is imported
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    const errorMsg = "❌ DATABASE_URL is not set in environment variables!\n" +
        "Please check your .env file in gloriaconnect_backend directory.\n" +
        "Expected format: DATABASE_URL=\"mysql://username:password@host:port/database_name\"\n" +
        "Current working directory: " + process.cwd();
    console.error(errorMsg);
    // Don't exit in production, but log the error
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
}
// CRITICAL: Force set in process.env - MUST be done before PrismaClient import
// Prisma schema.prisma uses env("DATABASE_URL") which reads from process.env
if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
}
// NOW import PrismaClient - DATABASE_URL must be in process.env at this point
import { PrismaClient } from "@prisma/client";
// Double-check DATABASE_URL is set
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in process.env before creating PrismaClient");
}
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
