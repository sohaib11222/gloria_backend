const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env file from multiple possible locations
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../.env'),
  '/var/www/gloriaconnect/backend/.env', // Absolute path
];

let envVars = {
  NODE_ENV: "production"
};

let databaseUrl = null;
let envLoaded = false;

// Try to load .env file from each path
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    try {
      const envConfig = dotenv.config({ path: envPath });
      if (envConfig.error) {
        console.warn(`Warning: Could not load .env file from ${envPath}:`, envConfig.error.message);
        continue;
      }
      
      if (envConfig.parsed) {
        // Merge .env variables with PM2 config
        envVars = {
          ...envVars,
          ...envConfig.parsed
        };
        
        // Extract DATABASE_URL
        if (envConfig.parsed.DATABASE_URL) {
          databaseUrl = envConfig.parsed.DATABASE_URL;
          envLoaded = true;
        }
        
        console.log(`✓ Loaded .env file from ${envPath} with ${Object.keys(envConfig.parsed).length} variables`);
        break; // Stop after first successful load
      }
    } catch (err) {
      console.warn(`Warning: Error loading .env from ${envPath}:`, err.message);
      continue;
    }
  }
}

// If dotenv didn't work, try reading .env file directly
if (!databaseUrl) {
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
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
            console.log(`✓ Loaded DATABASE_URL from ${envPath} (direct read)`);
            break;
          }
        }
        if (envLoaded) break;
      } catch (err) {
        console.warn(`Warning: Error reading .env from ${envPath}:`, err.message);
        continue;
      }
    }
  }
}

// Ensure DATABASE_URL is set
if (!databaseUrl) {
  databaseUrl = process.env.DATABASE_URL;
}

if (!databaseUrl) {
  console.error('❌ FATAL ERROR: DATABASE_URL is not set!');
  console.error('   Tried paths:', envPaths.join(', '));
  console.error('   Current working directory:', process.cwd());
  console.error('   __dirname:', __dirname);
  process.exit(1);
} else {
  // CRITICAL: Explicitly set DATABASE_URL in process.env for Prisma Client
  // Prisma Client requires this at runtime for schema validation
  process.env.DATABASE_URL = databaseUrl;
  envVars.DATABASE_URL = databaseUrl;
  const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`✓ DATABASE_URL is set for Prisma Client: ${safeUrl}`);
}

// CRITICAL: Ensure DATABASE_URL is ALWAYS set in envVars
if (!envVars.DATABASE_URL) {
  envVars.DATABASE_URL = databaseUrl;
}

module.exports = {
  apps: [
    {
      name: "gloriaconnect-backend",
      script: "node",
      args: "-r dotenv/config dist/index.js",
      cwd: "/var/www/gloriaconnect/backend",
      env: {
        ...envVars,
        // CRITICAL: Force DATABASE_URL to be set explicitly - Prisma Client requires this
        // This MUST be set for Prisma schema validation at import time
        DATABASE_URL: databaseUrl,
        // Ensure Node.js can find it
        NODE_ENV: envVars.NODE_ENV || "production",
      },
      // CRITICAL: Also set in env_file for PM2 to load
      env_file: path.resolve(__dirname, '.env'),
      watch: false,
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_memory_restart: "1G",
      instances: 1,
      exec_mode: "fork"
    }
  ]
};
	
