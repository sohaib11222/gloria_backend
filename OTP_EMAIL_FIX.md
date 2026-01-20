# OTP Email Not Sending on Second Registration - Fix

## Problem
When you register an account, delete it, and register again with the same email:
- ✅ First registration: OTP email is sent successfully
- ❌ Second registration: OTP email is NOT sent (but you reach verify OTP screen)

## Root Cause
The system uses an external OTP email API (`https://troosolar.hmstech.org/api/email/send-otp`). The second registration might fail due to:
1. **Rate limiting** - External API might block rapid duplicate requests
2. **Network issues** - API might be temporarily unreachable
3. **API errors** - External API might return errors for duplicate emails
4. **Timing issues** - Company record might not be fully created when OTP is sent

## Solution Applied

### 1. Enhanced Logging
Added detailed logging to track:
- Each OTP sending attempt with unique ID
- Company existence check before sending
- External API response details
- SMTP fallback attempts
- All error details

### 2. SMTP Fallback
If the external API fails, the system now automatically tries SMTP as a fallback:
- Checks if company exists before sending
- Tries external API first
- If external API fails, automatically tries SMTP
- Provides detailed error messages for both attempts

### 3. Better Error Handling
- Validates company exists before sending OTP
- Handles network timeouts (30 second limit)
- Provides clear error messages
- OTP is still stored in database even if email fails

## How to Diagnose

### Check Logs
```bash
pm2 logs gloriaconnect-backend --lines 100 | grep -iE "EmailVerification|OTP|otp-"
```

Look for:
- `📧 [EmailVerification] Sending OTP Email - Attempt otp-...`
- `✅ [EmailVerification] OTP Email Sent Successfully`
- `❌ [EmailVerification] ... Failed`
- `⚠️ [EmailVerification] External API Failed - Trying SMTP Fallback`

### Check Registration Response
The registration endpoint now returns:
```json
{
  "message": "...",
  "email": "user@example.com",
  "emailSent": true/false,
  "status": "PENDING_VERIFICATION"
}
```

If `emailSent: false`, check the logs for details.

## Testing

### Test Registration
1. Register a new account
2. Check logs for OTP sending
3. Delete the account
4. Register again with the same email
5. Check logs to see what happens

### Test Resend OTP
If OTP doesn't arrive, use the resend endpoint:
```bash
POST /api/auth/resend-otp
{
  "email": "user@example.com"
}
```

## Common Issues

### Issue 1: External API Rate Limiting
**Symptoms:**
- First registration works
- Second registration fails immediately
- Logs show: `HTTP 429` or `rate limit`

**Solution:**
- Wait a few minutes between registrations
- Or the SMTP fallback will automatically kick in

### Issue 2: External API Down
**Symptoms:**
- All registrations fail
- Logs show: `ECONNREFUSED` or `timeout`

**Solution:**
- SMTP fallback will automatically try
- Check SMTP configuration in `.env`
- Or contact the external API provider

### Issue 3: Company Not Found
**Symptoms:**
- Logs show: `Company not found in database for email`
- Registration might have failed silently

**Solution:**
- Check if registration actually completed
- Check database for company record
- Try registration again

## Configuration

### External API URL
Set in `.env`:
```env
OTP_EMAIL_API_URL=https://troosolar.hmstech.org/api/email/send-otp
```

### SMTP Fallback
SMTP is configured in `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_SECURE=false
EMAIL_FROM=your-email@gmail.com
```

## Next Steps

1. **Monitor logs** during second registration
2. **Check** if external API is responding
3. **Verify** SMTP fallback is working
4. **Use resend-otp** if email doesn't arrive

## Log Examples

### Successful External API
```
📧 [EmailVerification] Sending OTP Email - Attempt otp-1234567890-abc123
   Email: user@example.com
   Company: Test Company
   OTP: 1234
   OTP stored in database: ✓
   API URL: https://troosolar.hmstech.org/api/email/send-otp
✅ [EmailVerification] OTP Email Sent Successfully via External API
```

### External API Failed, SMTP Fallback Success
```
⚠️  [EmailVerification] External API Failed - Trying SMTP Fallback
   External API Error: { type: 'NETWORK_ERROR', message: '...' }
✅ [EmailVerification] OTP Email Sent Successfully via SMTP Fallback
```

### Both Failed
```
❌ [EmailVerification] Both External API and SMTP Failed
   External API Error: { ... }
   SMTP Error: connect ECONNREFUSED ...
   Note: OTP is still valid and stored. User can request resend.
```
