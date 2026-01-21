# Frontend CORS Fix - Cursor Prompt

## Problem
The frontend at `http://localhost:5173` is making requests to `http://api.gloriaconnect.com/api/auth/login` but getting `ERR_NETWORK` errors with status 0, or responses are not being received even though the backend is sending them correctly.

## Backend Verification (COMPLETE ✅)
The backend has been verified and is 100% correct:
- ✅ CORS headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: *`, `Access-Control-Allow-Headers: *`
- ✅ Content-Type: `application/json; charset=utf-8`
- ✅ OPTIONS preflight: Returns 204 immediately
- ✅ All responses include CORS headers
- ✅ Nginx is configured correctly with CORS headers set with `always` flag

## Frontend Fix Required

Fix the frontend code to properly handle CORS requests to `http://api.gloriaconnect.com/api/auth/login`. The backend is completely open for CORS, so the issue is in how the frontend is making requests.

### Critical Fixes Needed:

1. **Check the API request code** (likely in a service file, API utility, or component):
   - Ensure you're using `fetch` or `axios` correctly
   - Make sure the request includes `Content-Type: application/json` header
   - Ensure the request method is `POST` for login
   - Verify the request body is properly stringified JSON

2. **Handle CORS properly in the request**:
   - Don't set `credentials: 'include'` (backend uses `Access-Control-Allow-Credentials: false`)
   - Don't manually set CORS headers in the request (browser handles this)
   - Ensure the request includes the `Origin` header (browser does this automatically)

3. **Error handling**:
   - Check if errors are being caught and logged properly
   - Ensure the response is being parsed as JSON
   - Check if the response body is being read correctly

4. **Response handling**:
   - Verify the response is being parsed correctly: `await response.json()`
   - Check if the response status is being checked: `if (!response.ok)`
   - Ensure the response data is being extracted properly

### Example Fix for Fetch API:

```javascript
// CORRECT way to make the request
const response = await fetch('http://api.gloriaconnect.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // DO NOT set CORS headers manually - browser handles this
    // DO NOT set Origin header - browser sets this automatically
  },
  // DO NOT set credentials: 'include' - backend uses allowCredentials: false
  body: JSON.stringify({
    email: 'admin@gmail.com',
    password: '11221122'
  })
});

// Check if response is OK
if (!response.ok) {
  const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
  throw new Error(errorData.message || 'Login failed');
}

// Parse response as JSON
const data = await response.json();
return data;
```

### Example Fix for Axios:

```javascript
// CORRECT way to make the request
const response = await axios.post(
  'http://api.gloriaconnect.com/api/auth/login',
  {
    email: 'admin@gmail.com',
    password: '11221122'
  },
  {
    headers: {
      'Content-Type': 'application/json',
      // DO NOT set CORS headers manually
    },
    // DO NOT set withCredentials: true - backend uses allowCredentials: false
  }
);

return response.data;
```

### Common Issues to Check:

1. **Request not being sent**:
   - Check browser Network tab - is the request actually being made?
   - Is there a JavaScript error preventing the request?
   - Are there any browser extensions blocking the request?

2. **Response not being received**:
   - Check Network tab - what's the actual response status?
   - Is the response body present in the Network tab?
   - Are there any CORS errors in the Console?

3. **Response parsing errors**:
   - Is the response being parsed as JSON correctly?
   - Is there a try-catch block handling errors?
   - Are errors being logged to console?

4. **Browser caching**:
   - Clear browser cache (Ctrl+Shift+R)
   - Try incognito mode
   - Disable browser extensions

### Debugging Steps:

1. Open browser DevTools (F12)
2. Go to Network tab
3. Make the login request
4. Click on the `/api/auth/login` request
5. Check:
   - **Request Headers**: Should include `Origin: http://localhost:5173`
   - **Response Headers**: Should include `Access-Control-Allow-Origin: *`
   - **Response Tab**: Should show the JSON response body
   - **Status**: Should be 200 OK
6. Check Console tab for any JavaScript errors

### Files to Check/Fix:

1. **API service file** (e.g., `src/services/api.ts`, `src/api/auth.ts`, `src/utils/api.ts`)
   - Find where login requests are made
   - Fix the request configuration
   - Ensure proper error handling

2. **Login component/page** (e.g., `src/pages/Login.tsx`, `src/components/Login.tsx`)
   - Check how the API is being called
   - Verify response handling
   - Check error handling

3. **Axios/Fetch configuration** (if using a global config)
   - Check base URL configuration
   - Check default headers
   - Check interceptors

### Expected Response Format:

The backend returns:
```json
{
  "token": "eyJhbGci...",
  "access": "eyJhbGci...",
  "refresh": "eyJhbGci...",
  "user": {
    "id": "...",
    "email": "admin@gmail.com",
    "role": "ADMIN",
    "companyId": "...",
    "company": { ... }
  },
  "companyId": "..."
}
```

### Test the Fix:

After fixing, test by:
1. Making a login request from `http://localhost:5173`
2. Checking the Network tab - request should show 200 OK
3. Checking the Response tab - should show the JSON body
4. Checking the Console - no CORS errors
5. Verifying the login works correctly

## Summary

The backend is 100% correct and completely open for CORS. Fix the frontend request code to:
- Use correct headers (`Content-Type: application/json`)
- Don't set CORS headers manually
- Don't use credentials
- Properly parse the JSON response
- Handle errors correctly

The issue is in how the frontend is making or handling the request, not in the backend configuration.
