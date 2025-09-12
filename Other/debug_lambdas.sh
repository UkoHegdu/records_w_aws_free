#!/bin/bash
# debug_lambdas.sh - Debug Lambda functions

echo "🔍 Lambda Debugging Tool"
echo ""

# Function to check Lambda logs
check_lambda_logs() {
    local function_name="$1"
    local log_group="/aws/lambda/$function_name"
    
    echo "📋 Checking logs for: $function_name"
    echo "Log Group: $log_group"
    
    # Check if log group exists
    if aws logs describe-log-groups --log-group-name-prefix "$log_group" --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q "$log_group"; then
        echo "✅ Log group exists"
        
        # Get recent error logs
        echo "🔍 Recent logs (last 10 minutes):"
        aws logs filter-log-events \
            --log-group-name "$log_group" \
            --start-time $(date -d '10 minutes ago' +%s)000 \
            --query 'events[*].[timestamp,message]' \
            --output table 2>/dev/null || echo "No recent logs found"
    else
        echo "❌ Log group not found - Lambda may not have been invoked yet"
    fi
    echo ""
}

# Function to check Lambda function status
check_lambda_status() {
    local function_name="$1"
    
    echo "📊 Status for: $function_name"
    aws lambda get-function --function-name "$function_name" \
        --query 'Configuration.[FunctionName,Runtime,LastModified,State]' \
        --output table 2>/dev/null || echo "❌ Function not found"
    echo ""
}

# Check all Lambda functions
echo "🚀 Checking Lambda Functions..."
echo ""

# List all functions
echo "📋 All Lambda Functions:"
aws lambda list-functions --query 'Functions[?contains(FunctionName, `recordsw-app`)].FunctionName' --output table
echo ""

# Check specific functions that are failing
check_lambda_status "recordsw-app-user-search"
check_lambda_status "recordsw-app-mapSearch"
check_lambda_status "recordsw-app-get-map-records"
check_lambda_status "recordsw-app-login"
check_lambda_status "recordsw-app-register"

echo "🔍 Checking Logs for Failing Functions..."
echo ""

check_lambda_logs "recordsw-app-user-search"
check_lambda_logs "recordsw-app-mapSearch"
check_lambda_logs "recordsw-app-get-map-records"
check_lambda_logs "recordsw-app-login"
check_lambda_logs "recordsw-app-register"

echo "💡 Common Issues:"
echo "   - Missing environment variables"
echo "   - Database connection issues"
echo "   - Missing dependencies"
echo "   - IAM permissions"
echo "   - Cold start timeouts"
echo ""
echo "🔧 Next Steps:"
echo "   1. Check CloudWatch logs above"
echo "   2. Verify Parameter Store values"
echo "   3. Test database connectivity"
echo "   4. Check IAM permissions"
