// ABSOLUTE CRITICAL: Load DATABASE_URL from .env file SYNCHRONOUSLY before ANY imports
// This must happen before Prisma Client is imported
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple paths for .env file
const envPath = path.resolve(process.cwd(), '.env');
const altEnvPath = path.resolve(__dirname, '../../.env');
const envPaths = [envPath, altEnvPath, '/var/www/gloriaconnect/backend/.env'];

for (const envFile of envPaths) {
    if (fs.existsSync(envFile)) {
        try {
            const envContent = fs.readFileSync(envFile, 'utf8');
            const lines = envContent.split('\n');
            for (const line of lines) {
                if (line.startsWith('DATABASE_URL=')) {
                    const value = line.substring(13).trim().replace(/^["']|["']$/g, '');
                    process.env.DATABASE_URL = value;
                    console.log(`✓ DATABASE_URL loaded from: ${envFile}`);
                    break;
                }
            }
            if (process.env.DATABASE_URL) break;
        } catch (e) {
            // Try next path
        }
    }
}

import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import dotenv from "dotenv";
// Load .env file explicitly from the backend directory  
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
    // Verify it's set
    if (!process.env.DATABASE_URL) {
        throw new Error("Failed to set DATABASE_URL in process.env");
    }
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
if (!process.env.DATABASE_URL) {
    if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
    } else {
        throw new Error("DATABASE_URL must be set in process.env for Prisma Client");
    }
}

// CRITICAL: One final check - ensure DATABASE_URL is in process.env
// Prisma Client validates schema.prisma at QUERY TIME, not initialization time
if (!process.env.DATABASE_URL) {
    const error = "FATAL: DATABASE_URL not in process.env - Prisma queries will fail!";
    console.error(error);
    throw new Error(error);
}

// Create Prisma client with explicit DATABASE_URL
// Note: Even though we pass it here, Prisma still checks process.env at query time
// CRITICAL: Ensure DATABASE_URL is in process.env before creating PrismaClient
if (!process.env.DATABASE_URL) {
    console.error("CRITICAL: DATABASE_URL missing before PrismaClient creation!");
    if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
        console.log("✓ Restored DATABASE_URL from cache");
    } else {
        // Last resort: reload from .env
        dotenv.config({ path: envPath });
        if (!process.env.DATABASE_URL) {
            throw new Error("Cannot create PrismaClient without DATABASE_URL");
        }
    }
}

const prismaClient = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Verify DATABASE_URL is still available after PrismaClient creation
if (!process.env.DATABASE_URL) {
    console.error("WARNING: DATABASE_URL disappeared after PrismaClient creation!");
    if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
    }
}

// CRITICAL: Prisma Client validates schema.prisma at QUERY TIME
// We need to ensure DATABASE_URL is ALWAYS available before any Prisma operation
// Wrap all Prisma methods to ensure DATABASE_URL is set before execution
const ensureDatabaseUrl = () => {
    if (!process.env.DATABASE_URL) {
        console.warn("⚠️ DATABASE_URL not found in process.env, attempting to reload...");
        // Try multiple methods to load DATABASE_URL
        // Method 1: Reload from .env file
        dotenv.config({ path: envPath });
        
        // Method 2: Use cached value
        if (!process.env.DATABASE_URL && databaseUrl) {
            process.env.DATABASE_URL = databaseUrl;
            console.log("✓ Reloaded DATABASE_URL from cached value");
        }
        
        // Method 3: Read directly from .env file
        if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
            try {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    if (line.startsWith('DATABASE_URL=')) {
                        const value = line.substring(13).trim().replace(/^["']|["']$/g, '');
                        process.env.DATABASE_URL = value;
                        databaseUrl = value;
                        console.log("✓ Reloaded DATABASE_URL from .env file directly");
                        break;
                    }
                }
            } catch (e) {
                console.error("Failed to read .env file:", e.message);
            }
        }
        
        // Final check
        if (!process.env.DATABASE_URL) {
            const error = "FATAL: DATABASE_URL not found. Tried: .env file, cached value, direct read.";
            console.error(error);
            throw new Error(error);
        } else {
            console.log("✓ DATABASE_URL successfully restored:", !!process.env.DATABASE_URL);
        }
    }
};

// Proxy the prisma client to ensure DATABASE_URL is always set
const handler = {
    get(target, prop) {
        // CRITICAL: Always ensure DATABASE_URL is set before accessing any property
        ensureDatabaseUrl();
        
        const value = target[prop];
        
        // For model access (user, company, etc.), return a proxied object
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value.then !== 'function') {
            return new Proxy(value, handler);
        }
        
        // Wrap functions to ensure DATABASE_URL before execution
        if (typeof value === 'function') {
            return function(...args) {
                ensureDatabaseUrl();
                try {
                    const result = value.apply(target, args);
                    // If it's a promise, wrap it to ensure DATABASE_URL is checked
                    if (result && typeof result.then === 'function') {
                        return result.catch((error) => {
                            // If error is about DATABASE_URL, try to fix it
                            if (error && error.message && (error.message.includes('DATABASE_URL') || error.message.includes('Environment variable not found'))) {
                                console.warn("⚠️ DATABASE_URL error in promise, fixing...");
                                ensureDatabaseUrl();
                                if (process.env.DATABASE_URL) {
                                    console.log("✓ DATABASE_URL restored, retrying query...");
                                    // Retry the operation
                                    return value.apply(target, args);
                                }
                            }
                            throw error;
                        });
                    }
                    return result;
                } catch (error) {
                    // If error is about DATABASE_URL, try to fix it
                    if (error && error.message && (error.message.includes('DATABASE_URL') || error.message.includes('Environment variable not found'))) {
                        console.warn("⚠️ DATABASE_URL error synchronously, fixing...");
                        ensureDatabaseUrl();
                        if (process.env.DATABASE_URL) {
                            console.log("✓ DATABASE_URL restored, retrying query...");
                            // Retry the operation
                            return value.apply(target, args);
                        }
                    }
                    throw error;
                }
            };
        }
        
        return value;
    }
};

// Export a proxied version that ensures DATABASE_URL is always available
export const prisma = new Proxy(prismaClient, handler);
// Handle Prisma connection lifecycle
process.on('beforeExit', async () => {
    await prismaClient.$disconnect();
});
// Log DATABASE_URL on startup (hide password)
if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`📋 Prisma DATABASE_URL: ${safeUrl}`);
    console.log(`✓ DATABASE_URL is available in process.env: ${!!process.env.DATABASE_URL}`);
}
else {
    console.warn("⚠️  DATABASE_URL not set - Prisma operations will fail!");
}
