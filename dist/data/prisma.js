// CRITICAL: Load environment variables BEFORE importing PrismaClient
// Prisma Client validates schema.prisma at module initialization time
// This MUST be the FIRST thing that happens in this module
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
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
    '/var/www/gloriaconnect/backend/.env', // Absolute path as fallback
];
// Try loading from each path until one succeeds
let databaseUrl = process.env.DATABASE_URL;
let envLoaded = false;
// First, try dotenv.config() which respects existing env vars
for (const envPath of envPaths) {
    try {
        if (existsSync(envPath)) {
            const result = dotenv.config({ path: envPath, override: false });
            if (!result.error && result.parsed) {
                // Update databaseUrl if it was loaded from this file
                if (result.parsed.DATABASE_URL) {
                    databaseUrl = result.parsed.DATABASE_URL;
                    envLoaded = true;
                }
                break;
            }
        }
    }
    catch (e) {
        // Continue to next path
        continue;
    }
}
// If dotenv didn't work, try reading .env file directly
if (!databaseUrl || !envLoaded) {
    for (const envPath of envPaths) {
        try {
            if (existsSync(envPath)) {
                const envContent = readFileSync(envPath, 'utf-8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.startsWith('DATABASE_URL=')) {
                        databaseUrl = trimmed.split('=').slice(1).join('=').trim();
                        // Remove quotes if present
                        if ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
                            (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))) {
                            databaseUrl = databaseUrl.slice(1, -1);
                        }
                        envLoaded = true;
                        break;
                    }
                }
                if (envLoaded)
                    break;
            }
        }
        catch (e) {
            // Continue to next path
            continue;
        }
    }
}
// CRITICAL: Force set DATABASE_URL in process.env IMMEDIATELY
// This MUST happen before ANY PrismaClient import
// Prisma schema.prisma uses env("DATABASE_URL") which reads from process.env at module load time
if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
    const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`📋 Prisma DATABASE_URL loaded: ${safeUrl}`);
}
else if (!process.env.DATABASE_URL) {
    // Last resort: try to get it from environment (PM2 should set this)
    const errorMsg = "❌ DATABASE_URL is not set in environment variables!\n" +
        "Please check your .env file or PM2 environment configuration.\n" +
        "Expected format: DATABASE_URL=\"mysql://username:password@host:port/database_name\"\n" +
        "Current working directory: " + process.cwd() + "\n" +
        "__dirname: " + __dirname + "\n" +
        "Tried paths: " + envPaths.join(", ") + "\n" +
        "process.env.DATABASE_URL: " + (process.env.DATABASE_URL || 'undefined');
    console.error(errorMsg);
    // Always throw in production - this is a critical error
    throw new Error("FATAL: DATABASE_URL must be set in process.env before importing PrismaClient. " +
        "Check your .env file and PM2 configuration.");
}
// CRITICAL: Double-check DATABASE_URL is set before importing PrismaClient
if (!process.env.DATABASE_URL) {
    throw new Error("FATAL: DATABASE_URL must be set in process.env before creating PrismaClient. " +
        "Check your .env file and PM2 configuration. Current value: " + (process.env.DATABASE_URL || 'undefined'));
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
