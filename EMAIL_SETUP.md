# Email/SMTP Configuration Guide

## Quick Fix for Gmail SMTP Issues

If you're getting `emailSent: false` or SMTP authentication errors, follow these steps:

### 1. Check Your .env File Format

**❌ WRONG (with quotes):**
```env
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_USER="mas.business.04@gmail.com"
EMAIL_PASS="obmfugyywnvxctez"
EMAIL_SECURE="false"
EMAIL_FROM="mas.business.04@gmail.com"
```

**✅ CORRECT (no quotes):**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=mas.business.04@gmail.com
EMAIL_PASS=obmfugyywnvxctez
EMAIL_SECURE=false
EMAIL_FROM=mas.business.04@gmail.com
```

### 2. Admin Config vs Environment Variables

**Important:** Admin panel SMTP config takes priority over environment variables.

- If you have an admin SMTP config enabled, it will be used instead of `.env` variables
- To use `.env` variables, either:
  - Disable the admin SMTP config (set `enabled: false`)
  - Delete the admin SMTP config
  - Or use the admin panel to configure SMTP correctly

### 3. Gmail App Password Setup

1. Go to: https://myaccount.google.com/security
2. Enable **2-Step Verification** (required)
3. Go to: https://myaccount.google.com/apppasswords
4. Generate App Password:
   - Select "Mail"
   - Select "Other (Custom name)"
   - Name it "Car Hire Middleware"
   - Copy the **16-character password** (no spaces)
5. Use that App Password as `EMAIL_PASS` in your `.env` file

### 4. Verify Configuration

After updating `.env`:

1. **Restart the backend server** (env vars are loaded at startup)
2. Check server console logs - you should see:
   ```
   📧 Using SMTP from environment variables:
      Host: smtp.gmail.com
      Port: 587
      User: mas.business.04@gmail.com
      Secure: false
   ✅ SMTP connection verified successfully
   ```

3. Test via API:
   ```bash
   POST http://localhost:8080/admin/smtp/test
   Authorization: Bearer <admin-token>
   Content-Type: application/json
   
   {
     "to": "mas.business.04@gmail.com"
   }
   ```

### 5. Common Issues

#### Issue: "SMTP authentication failed"
- **Solution:** Make sure you're using an App Password (16 characters), not your regular Gmail password
- Check that `EMAIL_PASS` has no quotes in `.env`

#### Issue: "SMTP is not configured"
- **Solution:** Check that all required env vars are set: `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`
- Make sure there are no quotes around values in `.env`

#### Issue: Still using old config
- **Solution:** Restart the backend server (transporter cache is cleared on restart)
- Or wait 1 minute (cache TTL) for automatic refresh

### 6. Check Current Configuration

```bash
GET http://localhost:8080/admin/smtp/status
Authorization: Bearer <admin-token>
```

This will show:
- Which config is being used (admin vs env vars)
- Connection verification status
- Configuration details (masked password)

### 7. Example .env Configuration

```env
# Gmail SMTP Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=mas.business.04@gmail.com
EMAIL_PASS=obmfugyywnvxctez
EMAIL_SECURE=false
EMAIL_FROM=mas.business.04@gmail.com
```

**Remember:**
- No quotes around values
- No spaces around `=`
- `EMAIL_SECURE=false` for port 587 (STARTTLS)
- `EMAIL_SECURE=true` for port 465 (SSL/TLS)
- Use App Password for Gmail (16 characters, no spaces)

