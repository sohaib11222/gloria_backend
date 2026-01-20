#!/bin/bash
# Fix nginx CORS configuration for source.gloriaconnect.com
# Run with: sudo bash scripts/fix-nginx-cors.sh

NGINX_CONFIG="/etc/nginx/conf.d/source.gloriaconnect.com.conf"

if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script needs root access"
    echo "   Run: sudo bash scripts/fix-nginx-cors.sh"
    exit 1
fi

if [ ! -f "$NGINX_CONFIG" ]; then
    echo "❌ Nginx config not found: $NGINX_CONFIG"
    exit 1
fi

echo "📋 Current nginx config:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat "$NGINX_CONFIG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backup original
BACKUP_FILE="${NGINX_CONFIG}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"

# Check if CORS headers already exist
if grep -q "Access-Control-Allow-Origin" "$NGINX_CONFIG"; then
    echo "⚠️  CORS headers already exist in config"
    echo "   You may need to manually update them"
    echo ""
    echo "   Add these inside your location /api block:"
    echo ""
    echo "   # CORS Headers"
    echo "   add_header 'Access-Control-Allow-Origin' '*' always;"
    echo "   add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;"
    echo "   add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin' always;"
    echo ""
    echo "   # Handle OPTIONS preflight"
    echo "   if (\$request_method = 'OPTIONS') {"
    echo "       add_header 'Access-Control-Allow-Origin' '*' always;"
    echo "       add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;"
    echo "       add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin' always;"
    echo "       add_header 'Access-Control-Max-Age' '86400' always;"
    echo "       add_header 'Content-Length' 0;"
    echo "       return 204;"
    echo "   }"
else
    echo "📝 Adding CORS headers to nginx config..."
    echo ""
    echo "⚠️  Manual edit required!"
    echo ""
    echo "Please edit: $NGINX_CONFIG"
    echo ""
    echo "Add these lines inside your 'location /api' block:"
    echo ""
    echo "    # CORS Headers"
    echo "    add_header 'Access-Control-Allow-Origin' '*' always;"
    echo "    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;"
    echo "    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin' always;"
    echo "    add_header 'Access-Control-Allow-Credentials' 'false' always;"
    echo "    add_header 'Access-Control-Expose-Headers' '*' always;"
    echo ""
    echo "    # Handle OPTIONS preflight"
    echo "    if (\$request_method = 'OPTIONS') {"
    echo "        add_header 'Access-Control-Allow-Origin' '*' always;"
    echo "        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;"
    echo "        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin' always;"
    echo "        add_header 'Access-Control-Max-Age' '86400' always;"
    echo "        add_header 'Content-Length' 0;"
    echo "        return 204;"
    echo "    }"
fi

echo ""
echo "After editing, test and reload nginx:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
