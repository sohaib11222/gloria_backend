#!/bin/bash
# Test CORS configuration
# Usage: ./scripts/test-cors.sh

API_URL="${1:-http://localhost:8080}"
ORIGIN="${2:-https://source.gloriaconnect.com}"

echo "Testing CORS for: $API_URL"
echo "Origin: $ORIGIN"
echo ""

# Test OPTIONS preflight
echo "1. Testing OPTIONS preflight request..."
curl -X OPTIONS "$API_URL/api/auth/verify-email" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v 2>&1 | grep -iE "access-control|HTTP|204|200"

echo ""
echo "2. Testing POST request with CORS..."
curl -X POST "$API_URL/api/auth/verify-email" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"1234"}' \
  -v 2>&1 | grep -iE "access-control|HTTP|error|message" | head -10

echo ""
echo "✅ CORS test complete!"
echo ""
echo "If you see 'Access-Control-Allow-Origin' headers, CORS is working."
echo "If you see CORS errors, check:"
echo "  1. Server is running: pm2 status"
echo "  2. Check logs: pm2 logs gloriaconnect-backend"
echo "  3. Verify nginx is not blocking CORS headers"
