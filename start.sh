#!/bin/bash

# AWS Parameter Store Deployment Script
# Usage: ./start.sh [environment]
# Example: ./start.sh prod

set -e  # Exit immediately if any command fails

# Configuration
APP_NAME="recordsw"
ENVIRONMENT=${1:-"prod"}  # Default to 'prod' if no argument provided
AWS_REGION="eu-north-1"    # Change to your region

# Fetch parameters from AWS SSM
echo "🔍 Fetching parameters from AWS Parameter Store (/${APP_NAME}/${ENVIRONMENT}/)..."

# Get all parameters for this environment
PARAMETERS=$(aws ssm get-parameters-by-path \
  --path "/${ENVIRONMENT}/" \
  --region "$AWS_REGION" \
  --with-decryption \
  --query "Parameters[*].{Name:Name,Value:Value}")

# Check if we got any parameters
if [ -z "$PARAMETERS" ] || [ "$PARAMETERS" == "[]" ]; then
  echo "❌ No parameters found at /${APP_NAME}/${ENVIRONMENT}/"
  exit 1
fi

# Export each parameter as environment variable
echo "🔄 Setting environment variables..."
for row in $(echo "${PARAMETERS}" | jq -r '.[] | @base64'); do
  _jq() {
    echo ${row} | base64 --decode | jq -r ${1}
  }
  
  PARAM_NAME=$(_jq '.Name')
  PARAM_VALUE=$(_jq '.Value')
  
  # Extract just the parameter name (last part of path)
  VAR_NAME=$(basename "$PARAM_NAME")
  
  export "$VAR_NAME"="$PARAM_VALUE"
  echo "  ✓ $VAR_NAME"
done

# Verify required variables are set
REQUIRED_VARS=("PGUSER" "PGPASSWORD" "PGDATABASE" "EMAIL_USER" "EMAIL_PASS" 
               "AUTH_API_URL" "LEAD_API" "ACCOUNT_API" "AUTHORIZATION" "USER_AGENT")

echo "🔍 Verifying required variables..."
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi
done

echo "✅ All parameters loaded successfully"
echo "🟢 You can now run your docker-compose commands manually"

# Display next steps
echo ""
echo "Next steps:"
echo "1. Run your Docker commands:"
echo "   docker-compose up -d"
echo "2. Or start your application directly:"
echo "   node index.js"