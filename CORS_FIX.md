# CORS Fix for source.gloriaconnect.com

## What Was Fixed

Enhanced CORS configuration to properly handle requests from `https://source.gloriaconnect.com`:

1. **Improved CORS middleware** - Now properly handles all origins including the frontend domain
2. **Explicit OPTIONS handler** - Added dedicated OPTIONS handler for `/api/auth/verify-email`
3. **Request origin handling** - Uses the actual request origin instead of hardcoded '*'
4. **Enhanced headers** - Added all necessary CORS headers including Max-Age

## Changes Made

### 1. Enhanced CORS Configuration (`src/api/app.ts`)
- Uses dynamic origin handling
- Added `Access-Control-Max-Age` header (24 hours cache)
- Added more allowed headers
- Improved OPTIONS preflight handling

### 2. Verify-Email Route (`src/api/routes/auth.routes.ts`)
- Added explicit OPTIONS handler for `/auth/verify-email`
- Enhanced CORS headers in POST handler
- Uses request origin for better compatibility

### 3. Error Handler (`src/infra/error.ts`)
- Uses request origin instead of hardcoded '*'
- Ensures CORS headers are set even on errors

## Testing

### Test CORS with curl:
```bash
cd /var/www/gloriaconnect/backend
./scripts/test-cors.sh http://93.94.74.210 https://source.gloriaconnect.com
```

### Test from browser console:
```javascript
fetch('https://93.94.74.210/api/auth/verify-email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'test@example.com',
    otp: '1234'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

## If CORS Still Doesn't Work

### Check Nginx Configuration
If you're using nginx as a reverse proxy, make sure it's not stripping CORS headers:

```nginx
location /api {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    
    # Don't strip CORS headers
    proxy_pass_header Access-Control-Allow-Origin;
    proxy_pass_header Access-Control-Allow-Methods;
    proxy_pass_header Access-Control-Allow-Headers;
    
    # Or add CORS headers in nginx
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin' always;
    
    # Handle OPTIONS preflight
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin';
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Content-Length' 0;
        return 204;
    }
}
```

### Check Server Logs
```bash
pm2 logs gloriaconnect-backend --lines 100 | grep -i cors
```

### Verify Headers
```bash
curl -I -X OPTIONS https://93.94.74.210/api/auth/verify-email \
  -H "Origin: https://source.gloriaconnect.com" \
  -H "Access-Control-Request-Method: POST"
```

You should see:
- `Access-Control-Allow-Origin: https://source.gloriaconnect.com`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: ...`

## Current Configuration

The backend now:
- ✅ Allows all origins (including `https://source.gloriaconnect.com`)
- ✅ Handles OPTIONS preflight requests properly
- ✅ Sets CORS headers on all responses (including errors)
- ✅ Uses request origin for better browser compatibility
- ✅ Caches preflight responses for 24 hours

## Restart Required

After these changes, restart the server:
```bash
pm2 restart gloriaconnect-backend
```
