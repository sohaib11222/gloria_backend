const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env file from multiple possible locations
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../.env'),
];

let envVars = {
  NODE_ENV: 'production'
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
        envVars = {
          ...envVars,
          ...envConfig.parsed
        };
        
        if (envConfig.parsed.DATABASE_URL) {
          databaseUrl = envConfig.parsed.DATABASE_URL;
          envLoaded = true;
        }
        
        console.log(`✓ Loaded .env file from ${envPath} with ${Object.keys(envConfig.parsed).length} variables`);
        break;
      }
    } catch (err) {
      console.warn(`Warning: Error loading .env from ${envPath}:`, err.message);
      continue;
    }
  }
}

if (!databaseUrl) {
  databaseUrl = process.env.DATABASE_URL;
}

if (!databaseUrl) {
  console.error('❌ FATAL ERROR: DATABASE_URL is not set!');
  process.exit(1);
} else {
  process.env.DATABASE_URL = databaseUrl;
  envVars.DATABASE_URL = databaseUrl;
  const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`✓ DATABASE_URL is set for Prisma Client: ${safeUrl}`);
}

if (!envVars.DATABASE_URL) {
  envVars.DATABASE_URL = databaseUrl;
}

module.exports = {
  apps: [
    {
      name: 'gloria-backend',
      script: 'node',
      args: '-r dotenv/config dist/index.js',
      cwd: '/var/www/gloria_backend',
      env: {
        ...envVars,
        DATABASE_URL: databaseUrl,
        NODE_ENV: envVars.NODE_ENV || 'production',
      },
      env_file: path.resolve(__dirname, '.env'),
      watch: false,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
