# Quick Email Fix - Use SendGrid (Recommended)

## Problem
Your server's firewall is blocking SMTP ports (465, 587, 25). The error shows:
```
ECONNREFUSED 192.178.223.108:587
```

## Solution: Use SendGrid (5 minutes setup)

SendGrid uses HTTPS (port 443) which is usually open on all servers.

### Step 1: Sign up for SendGrid (Free)
1. Go to https://sendgrid.com
2. Sign up for a free account (100 emails/day free)
3. Verify your email address

### Step 2: Get API Key
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name it: "GloriaConnect Backend"
4. Select "Full Access" or "Mail Send" permissions
5. Copy the API key (you'll only see it once!)

### Step 3: Update .env file

Edit `/var/www/gloriaconnect/backend/.env`:

```env
# Comment out or remove old Gmail SMTP settings:
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=465
# EMAIL_USER=malikrohail252@gmail.com
# EMAIL_PASS=vebxwsjreqifndty
# EMAIL_SECURE=true

# Add SendGrid configuration:
EMAIL_SERVICE=sendgrid
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your_sendgrid_api_key_here
EMAIL_SECURE=false
EMAIL_FROM=mas.business.04@gmail.com
```

**Important:** Replace `your_sendgrid_api_key_here` with your actual SendGrid API key.

### Step 4: Restart Server

```bash
cd /var/www/gloriaconnect/backend
pm2 restart gloriaconnect-backend
```

### Step 5: Test

Try registering again. Check logs:
```bash
pm2 logs gloriaconnect-backend --lines 50
```

You should see:
- `📧 Using SendGrid HTTP API (port 443 - usually not blocked)`
- `✅ SMTP connection verified successfully`
- `✅ Email sent successfully`

## Alternative: Open Firewall (If you have root access)

If you have sudo/root access, you can open SMTP ports:

```bash
sudo bash /var/www/gloriaconnect/backend/scripts/fix-email-firewall.sh
```

Then keep using Gmail SMTP with your current .env settings.

## Need Help?

If SendGrid doesn't work:
1. Check that API key is correct
2. Verify your SendGrid account is activated
3. Check SendGrid dashboard for any errors
4. Try Mailgun instead (similar setup)
