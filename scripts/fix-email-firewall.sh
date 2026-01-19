#!/bin/bash
# Script to open SMTP ports for email sending
# Run with: sudo bash scripts/fix-email-firewall.sh

echo "🔧 Fixing Email Firewall Configuration..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Check if ufw is installed
if command -v ufw &> /dev/null; then
    echo "📋 Using UFW firewall..."
    
    # Allow outbound SMTP ports
    echo "Opening outbound SMTP ports..."
    ufw allow out 465/tcp
    ufw allow out 587/tcp
    ufw allow out 25/tcp
    
    echo "✅ UFW rules added"
    ufw status | grep -E "465|587|25" || echo "Rules may need to be applied"
else
    echo "⚠️  UFW not found, trying iptables..."
    
    # Allow outbound SMTP ports using iptables
    iptables -A OUTPUT -p tcp --dport 465 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT
    
    # Save iptables rules (if iptables-persistent is installed)
    if command -v iptables-save &> /dev/null; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || echo "⚠️  Could not save iptables rules permanently"
    fi
    
    echo "✅ iptables rules added"
fi

echo ""
echo "✅ Firewall configuration updated!"
echo ""
echo "📧 Test email sending with:"
echo "   cd /var/www/gloriaconnect/backend"
echo "   node -e \"require('dotenv').config(); const nodemailer = require('nodemailer'); const t = nodemailer.createTransport({host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT || '587'), secure: process.env.EMAIL_SECURE === 'true', auth: {user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS}}); t.verify().then(() => console.log('✅ SMTP OK')).catch(e => console.log('❌ Error:', e.message));\""
echo ""
echo "🔄 Restart your application:"
echo "   pm2 restart gloriaconnect-backend"
