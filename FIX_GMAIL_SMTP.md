# Fix Gmail SMTP - Open Firewall Ports

## Problem
Your server's firewall is blocking outbound SMTP connections to Gmail. Error:
```
ECONNREFUSED 192.178.223.108:587
```

## Solution: Open Firewall Ports

You need **root/sudo access** to open the ports. Run this command:

```bash
cd /var/www/gloriaconnect/backend
sudo bash scripts/fix-email-firewall.sh
```

This will open outbound ports:
- **465** (SSL/TLS SMTP)
- **587** (STARTTLS SMTP)  
- **25** (Standard SMTP)

## Manual Method (if script doesn't work)

### Using UFW:
```bash
sudo ufw allow out 465/tcp
sudo ufw allow out 587/tcp
sudo ufw allow out 25/tcp
sudo ufw reload
```

### Using iptables:
```bash
sudo iptables -A OUTPUT -p tcp --dport 465 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT

# Save rules permanently (if iptables-persistent is installed)
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

## Verify Your Gmail Configuration

Make sure your `.env` file has:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=malikrohail252@gmail.com
EMAIL_PASS=vebxwsjreqifndty
EMAIL_SECURE=true
EMAIL_FROM=mas.business.04@gmail.com
```

**Important for Gmail:**
1. ✅ Use **port 465** with **EMAIL_SECURE=true** (SSL/TLS)
2. ✅ Use an **App Password** (16 characters), not your regular password
3. ✅ Enable **2-Step Verification** on your Gmail account
4. ✅ Generate App Password: https://myaccount.google.com/apppasswords

## Test After Opening Ports

1. **Restart the server:**
   ```bash
   pm2 restart gloriaconnect-backend
   ```

2. **Test SMTP connection:**
   ```bash
   cd /var/www/gloriaconnect/backend
   node scripts/test-email.js your-email@example.com
   ```

3. **Check logs:**
   ```bash
   pm2 logs gloriaconnect-backend --lines 50
   ```

You should see:
- `✅ SMTP connection verified successfully`
- `✅ Email sent successfully`

## If You Don't Have Root Access

Contact your hosting provider and ask them to:
1. Open outbound SMTP ports (465, 587, 25)
2. Or whitelist Gmail SMTP servers:
   - smtp.gmail.com (74.125.0.0/16)
   - Ports: 465, 587

## Troubleshooting

### Still getting ECONNREFUSED?
- Check if ports are actually open: `sudo iptables -L OUTPUT -n | grep 587`
- Try port 465 instead of 587 (more reliable with SSL)
- Verify Gmail App Password is correct
- Check Gmail account has 2-Step Verification enabled

### Authentication errors?
- Make sure you're using App Password, not regular password
- Verify EMAIL_PASS has NO quotes in .env file
- Regenerate App Password if needed

### Port 465 vs 587
- **Port 465**: SSL/TLS (EMAIL_SECURE=true) - More reliable
- **Port 587**: STARTTLS (EMAIL_SECURE=false) - Sometimes blocked

**Recommendation:** Use port 465 with EMAIL_SECURE=true for Gmail.
