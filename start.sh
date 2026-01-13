#!/bin/bash
# Startup script that ensures DATABASE_URL is set before starting Node.js
cd /var/www/gloriaconnect/backend

# Load .env file and export DATABASE_URL
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
fi

# Ensure DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set!"
    exit 1
fi

# Start the application with DATABASE_URL in environment
exec node -r dotenv/config dist/index.js

