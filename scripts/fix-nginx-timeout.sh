#!/bin/bash
# Fix nginx timeout settings for agent.gloriaconnect.com
# Run with: sudo bash scripts/fix-nginx-timeout.sh

NGINX_CONFIG="/etc/nginx/conf.d/agent.gloriaconnect.com.conf"

if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script needs root access"
    echo "   Run: sudo bash scripts/fix-nginx-timeout.sh"
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
echo ""

echo "📝 Adding timeout settings to nginx config..."
echo ""

# Check if timeout settings already exist
if grep -q "proxy_read_timeout" "$NGINX_CONFIG"; then
    echo "⚠️  Timeout settings already exist in config"
    echo "   You may need to manually update them"
else
    # Add timeout settings to the /api/ location block
    sed -i '/location \/api\/ {/a\
        proxy_connect_timeout 60s;\
        proxy_send_timeout 60s;\
        proxy_read_timeout 60s;\
        send_timeout 60s;
' "$NGINX_CONFIG"
    
    echo "✅ Added timeout settings:"
    echo "   - proxy_connect_timeout: 60s"
    echo "   - proxy_send_timeout: 60s"
    echo "   - proxy_read_timeout: 60s"
    echo "   - send_timeout: 60s"
fi

echo ""
echo "After updating, test and reload nginx:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
