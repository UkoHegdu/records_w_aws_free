#!/bin/bash
# test_endpoints.sh - Test all API endpoints

API_URL="https://9p0qb2bwde.execute-api.eu-north-1.amazonaws.com/prod"

echo "🧪 Testing API endpoints..."
echo "API URL: $API_URL"
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/health")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
echo "   Status: $HEALTH_CODE"
echo "   Response: $HEALTH_BODY"
echo ""

# Test user search endpoint
echo "2. Testing user search endpoint..."
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/users/search?username=test")
SEARCH_CODE=$(echo "$SEARCH_RESPONSE" | tail -n1)
SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | head -n -1)
echo "   Status: $SEARCH_CODE"
echo "   Response: $SEARCH_BODY"
echo ""

# Test maps endpoint
echo "3. Testing maps endpoint..."
MAPS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/users/maps?username=test")
MAPS_CODE=$(echo "$MAPS_RESPONSE" | tail -n1)
MAPS_BODY=$(echo "$MAPS_RESPONSE" | head -n -1)
echo "   Status: $MAPS_CODE"
echo "   Response: $MAPS_BODY"
echo ""

# Test records endpoint
echo "4. Testing records endpoint..."
RECORDS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/records/latest")
RECORDS_CODE=$(echo "$RECORDS_RESPONSE" | tail -n1)
RECORDS_BODY=$(echo "$RECORDS_RESPONSE" | head -n -1)
echo "   Status: $RECORDS_CODE"
echo "   Response: $RECORDS_BODY"
echo ""

# Test login endpoint (should return 400 for missing credentials)
echo "5. Testing login endpoint..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"","password":""}')
LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)
echo "   Status: $LOGIN_CODE"
echo "   Response: $LOGIN_BODY"
echo ""

# Test register endpoint (should return 400 for missing fields)
echo "6. Testing register endpoint..."
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/users/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"","password":"","username":""}')
REGISTER_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | head -n -1)
echo "   Status: $REGISTER_CODE"
echo "   Response: $REGISTER_BODY"
echo ""

# Test create alert endpoint (should return 400 for missing fields)
echo "7. Testing create alert endpoint..."
ALERT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/users/create_alert" \
  -H "Content-Type: application/json" \
  -d '{"username":"","email":""}')
ALERT_CODE=$(echo "$ALERT_RESPONSE" | tail -n1)
ALERT_BODY=$(echo "$ALERT_RESPONSE" | head -n -1)
echo "   Status: $ALERT_CODE"
echo "   Response: $ALERT_BODY"
echo ""

# Test account names endpoint (should return 400 for missing fields)
echo "8. Testing account names endpoint..."
ACCOUNT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/users/accountNames" \
  -H "Content-Type: application/json" \
  -d '{"accountIds":[]}')
ACCOUNT_CODE=$(echo "$ACCOUNT_RESPONSE" | tail -n1)
ACCOUNT_BODY=$(echo "$ACCOUNT_RESPONSE" | head -n -1)
echo "   Status: $ACCOUNT_CODE"
echo "   Response: $ACCOUNT_BODY"
echo ""

echo "✅ Testing complete!"
echo ""
echo "📊 Summary:"
echo "   Health: $HEALTH_CODE"
echo "   Search: $SEARCH_CODE"
echo "   Maps: $MAPS_CODE"
echo "   Records: $RECORDS_CODE"
echo "   Login: $LOGIN_CODE"
echo "   Register: $REGISTER_CODE"
echo "   Create Alert: $ALERT_CODE"
echo "   Account Names: $ACCOUNT_CODE"
echo ""
echo "💡 Expected responses:"
echo "   - 200: Success"
echo "   - 400: Missing/invalid parameters (normal for empty requests)"
echo "   - 500: Lambda cold start (retry after 30 seconds)"
echo "   - 404: Endpoint not found"
