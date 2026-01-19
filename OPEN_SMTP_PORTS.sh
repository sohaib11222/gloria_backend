#!/bin/bash
# Quick script to open SMTP ports for Gmail
# Run with: sudo bash OPEN_SMTP_PORTS.sh

echo "🔧 Opening SMTP Ports for Gmail..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script needs root access"
    echo "   Run: sudo bash OPEN_SMTP_PORTS.sh"
    exit 1
fi

echo "📋 Opening outbound SMTP ports (465, 587, 25)..."
echo ""

# Try UFW first
if command -v ufw &> /dev/null; then
    echo "Using UFW firewall..."
    ufw allow out 465/tcp
    ufw allow out 587/tcp
    ufw allow out 25/tcp
    echo "✅ UFW rules added"
    echo ""
    echo "Current UFW status:"
    ufw status | grep -E "465|587|25" || echo "   (Rules added, may need to reload)"
else
    echo "Using iptables..."
    # Allow outbound SMTP ports
    iptables -A OUTPUT -p tcp --dport 465 -j ACCEPT 2>/dev/null
    iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT 2>/dev/null
    iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT 2>/dev/null
    
    echo "✅ iptables rules added"
    
    # Try to save rules
    if command -v iptables-save &> /dev/null; then
        if [ -d /etc/iptables ]; then
            iptables-save > /etc/iptables/rules.v4 2>/dev/null && echo "✅ Rules saved permanently" || echo "⚠️  Could not save rules (may need to run on reboot)"
        else
            echo "⚠️  /etc/iptables not found - rules may not persist after reboot"
        fi
    fi
fi

echo ""
echo "✅ SMTP ports should now be open!"
echo ""
echo "📧 Test your Gmail SMTP:"
echo "   cd /var/www/gloriaconnect/backend"
echo "   node scripts/test-email.js your-email@example.com"
echo ""
echo "🔄 Restart your server:"
echo "   pm2 restart gloriaconnect-backend"
