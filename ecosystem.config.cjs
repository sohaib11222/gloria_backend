const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env file
const envPath = path.resolve(__dirname, '.env');
let envVars = {
  NODE_ENV: "production"
};

// Try to load .env file
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.config({ path: envPath });
  if (envConfig.error) {
    console.warn('Warning: Could not load .env file:', envConfig.error.message);
  } else if (envConfig.parsed) {
    // Merge .env variables with PM2 config
    envVars = {
      ...envVars,
      ...envConfig.parsed
    };
    console.log('Loaded .env file with', Object.keys(envConfig.parsed).length, 'variables');
  }
} else {
  console.warn('Warning: .env file not found at', envPath);
}

// Ensure DATABASE_URL is set
if (!envVars.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in environment variables!');
} else {
  // CRITICAL: Explicitly export DATABASE_URL for Prisma Client
  // Prisma Client requires this at runtime for schema validation
  process.env.DATABASE_URL = envVars.DATABASE_URL;
  console.log('✓ DATABASE_URL is set for Prisma Client');
}

// CRITICAL: Ensure DATABASE_URL is ALWAYS set
const databaseUrl = envVars.DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FATAL ERROR: DATABASE_URL is not set!');
  process.exit(1);
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
        DATABASE_URL: databaseUrl,
        // Ensure Node.js can find it
        NODE_ENV: envVars.NODE_ENV || "production",
      },
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
	
