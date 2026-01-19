# Email Sending Fix - Firewall Issue

## Problem
Your server's firewall is blocking outbound SMTP connections (ports 465, 587, 25). This is common on cloud servers to prevent spam.

**Error:** `ECONNREFUSED` or `Network is unreachable` when trying to connect to Gmail SMTP.

## Solutions

### Option 1: Open Firewall Ports (Recommended if you have root access)

Run the provided script:
```bash
sudo bash /var/www/gloriaconnect/backend/scripts/fix-email-firewall.sh
```

Or manually:
```bash
# Using UFW
sudo ufw allow out 465/tcp
sudo ufw allow out 587/tcp
sudo ufw allow out 25/tcp

# Using iptables
sudo iptables -A OUTPUT -p tcp --dport 465 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT
```

Then restart your application:
```bash
pm2 restart gloriaconnect-backend
```

### Option 2: Use SendGrid (HTTP API - Port 443, usually not blocked)

1. Sign up for SendGrid: https://sendgrid.com (free tier available)
2. Get your API key from SendGrid dashboard
3. Update your `.env` file:

```env
EMAIL_SERVICE=sendgrid
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your_sendgrid_api_key_here
EMAIL_SECURE=false
EMAIL_FROM=your-verified-email@example.com
```

4. Restart the application:
```bash
pm2 restart gloriaconnect-backend
```

### Option 3: Use Mailgun (HTTP API - Port 443, usually not blocked)

1. Sign up for Mailgun: https://www.mailgun.com (free tier available)
2. Get your API key from Mailgun dashboard
3. Update your `.env` file:

```env
EMAIL_SERVICE=mailgun
EMAIL_HOST=api.mailgun.net
EMAIL_PORT=587
EMAIL_USER=your-mailgun-domain.com
EMAIL_PASS=your_mailgun_api_key_here
EMAIL_SECURE=false
EMAIL_FROM=noreply@your-mailgun-domain.com
```

4. Restart the application:
```bash
pm2 restart gloriaconnect-backend
```

### Option 4: Contact Hosting Provider

If you don't have root access, contact your hosting provider and ask them to:
- Open outbound SMTP ports (465, 587, 25)
- Or whitelist Gmail SMTP servers

## Testing Email Configuration

After applying a fix, test with:
```bash
cd /var/www/gloriaconnect/backend
node -e "
require('dotenv').config();
const nodemailer = require('nodemailer');
const host = process.env.EMAIL_HOST;
const port = parseInt(process.env.EMAIL_PORT || '587');
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;
const secure = process.env.EMAIL_SECURE === 'true';

const transporter = nodemailer.createTransport({
  host, port, secure,
  auth: { user, pass },
  connectionTimeout: 15000
});

transporter.verify()
  .then(() => console.log('✅ SMTP Connection Verified!'))
  .catch(e => console.log('❌ Error:', e.code, e.message));
"
```

## Current Configuration

Your current `.env` settings:
- EMAIL_HOST: smtp.gmail.com
- EMAIL_PORT: 465
- EMAIL_SECURE: true
- EMAIL_USER: malikrohail252@gmail.com

**Note:** Port 465 requires SSL/TLS (secure: true), which is correctly configured.

## Why This Happens

Many cloud hosting providers block outbound SMTP ports by default to:
- Prevent spam
- Reduce abuse
- Comply with anti-spam policies

HTTPS (port 443) is usually open, which is why HTTP-based email services (SendGrid, Mailgun) work better in these environments.
