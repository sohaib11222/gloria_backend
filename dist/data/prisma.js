import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import dotenv from "dotenv";
// Load .env file explicitly to ensure it's loaded
dotenv.config();
// Ensure DATABASE_URL is loaded from .env
const databaseUrl = process.env.DATABASE_URL;
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
// Create Prisma client with explicit DATABASE_URL
export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl || process.env.DATABASE_URL || '',
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
