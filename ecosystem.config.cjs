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
}

module.exports = {
  apps: [
    {
      name: "gloriaconnect-backend",
      script: "node",
      args: "dist/index.js",
      cwd: "/var/www/gloriaconnect/backend",
      env: envVars,
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
	
