#!/bin/bash
# quick_test.sh - Quick endpoint test with status codes only

API_URL="https://9p0qb2bwde.execute-api.eu-north-1.amazonaws.com/prod"

echo "🚀 Quick API Test"
echo "API URL: $API_URL"
echo ""

# Function to test endpoint and show status
test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    
    if [ "$method" = "POST" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    fi
    
    echo "$name: $status"
}

# Test all endpoints
test_endpoint "Health" "GET" "$API_URL/health"
test_endpoint "User Search" "GET" "$API_URL/api/v1/users/search?username=test"
test_endpoint "Maps" "GET" "$API_URL/api/v1/users/maps?username=test"
test_endpoint "Records" "GET" "$API_URL/api/v1/records/latest"
test_endpoint "Login" "POST" "$API_URL/api/v1/users/login" '{"email":"","password":""}'
test_endpoint "Register" "POST" "$API_URL/api/v1/users/register" '{"email":"","password":"","username":""}'
test_endpoint "Create Alert" "POST" "$API_URL/api/v1/users/create_alert" '{"username":"","email":""}'
test_endpoint "Account Names" "POST" "$API_URL/api/v1/users/accountNames" '{"accountIds":[]}'

echo ""
echo "💡 Status codes:"
echo "   200 = Success"
echo "   400 = Missing parameters (expected for empty requests)"
echo "   500 = Lambda cold start (retry in 30 seconds)"
echo "   404 = Not found"
