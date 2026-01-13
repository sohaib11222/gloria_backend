import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";

// Load .env file explicitly from the backend directory
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Ensure DATABASE_URL is loaded from .env
let databaseUrl = process.env.DATABASE_URL;

// CRITICAL: Prisma Client requires DATABASE_URL in process.env at runtime
// Set it explicitly to ensure it's available for Prisma schema validation
if (!databaseUrl) {
  // Try alternative paths
  const altEnvPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: altEnvPath });
  databaseUrl = process.env.DATABASE_URL;
}

// Force set in process.env for Prisma Client runtime validation
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

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

// CRITICAL: Ensure DATABASE_URL is in process.env BEFORE creating PrismaClient
// Prisma Client validates schema.prisma at runtime which requires env("DATABASE_URL")
if (!process.env.DATABASE_URL && databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in process.env for Prisma Client");
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
} else {
  console.warn("⚠️  DATABASE_URL not set - Prisma operations will fail!");
}




