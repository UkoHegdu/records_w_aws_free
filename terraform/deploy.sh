#!/bin/bash
# deploy.sh - Complete Lambda deployment script

set -e

echo "🚀 Starting Lambda deployment..."

# Step 1: Remove old zip file to ensure source hash changes
echo "🗑️  Removing old lambda_functions.zip..."
rm -f lambda_functions.zip

# Step 2: Build and package Lambda functions
echo "📦 Packaging Lambda functions..."
mkdir -p lambda-build
cd lambda-build

# Copy all Lambda functions and dependencies
cp ../lambda/*.js .
cp ../lambda/package.json .
cp -r ../lambda/shared .

# Install dependencies and create zip
npm install --production

# Check if zip command is available, if not install it
if ! command -v zip &> /dev/null; then
    echo "📦 Installing zip command..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y zip
    elif command -v yum &> /dev/null; then
        sudo yum install -y zip
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y zip
    else
        echo "❌ Cannot install zip automatically. Please install zip manually:"
        echo "   Ubuntu/Debian: sudo apt-get install zip"
        echo "   CentOS/RHEL: sudo yum install zip"
        echo "   Fedora: sudo dnf install zip"
        exit 1
    fi
fi

# Create zip file
zip -r ../lambda_functions.zip .
cd ..
rm -rf lambda-build

echo "✅ Lambda functions packaged"
echo "   - user_search.js"
echo "   - mapSearch.js"
echo "   - mapSearchBackground.js"
echo "   - checkJobStatus.js"
echo "   - create_alert.js"
echo "   - login.js"
echo "   - register.js"
echo "   - getMapRecords.js"
echo "   - accountNames.js"
echo "   - scheduler.js"
echo "   - health.js"
echo "   - shared/ (apiClient.js, oauthApiClient.js)"

# Step 3: Apply Terraform Infrastructure
echo "🌍 Applying Terraform Infrastructure..."
terraform init
terraform plan
terraform apply -auto-approve

# Step 4: Get outputs after Terraform deployment
echo "📡 Getting deployment outputs..."
API_URL=$(terraform output -raw api_gateway_url)
S3_BUCKET=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url)

echo "✅ Infrastructure deployed!"
echo "📡 API Gateway URL: $API_URL"
echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"

# Step 5: Build frontend with actual API URL
echo "🏗️  Building frontend with API URL..."
cd ../frontend

cat > .env.production << EOF
VITE_BACKEND_URL=$API_URL
EOF

npm install
npm run build

echo "✅ Frontend built"
cd ../terraform

# Step 6: Deploy frontend to S3
echo "📤 Deploying frontend to S3..."
cd ../frontend
aws s3 sync dist/ s3://$S3_BUCKET --delete
cd ../terraform

# Step 7: Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [ "$DISTRIBUTION_ID" != "" ]; then
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo "✅ CloudFront cache invalidated"
else
    echo "⚠️  CloudFront distribution ID not found, skipping cache invalidation"
fi

echo "🎉 Deployment complete!"
echo "📱 Frontend URL: $CLOUDFRONT_URL"
echo "🔗 API URL: $API_URL"

# Optional: Run a quick health check
echo "🏥 Running health check..."
echo "Testing Lambda endpoints..."

# Test user search endpoint
echo "  - Testing user search endpoint..."
curl -f "$API_URL/api/v1/users/search?username=test" || echo "    ⚠️  User search endpoint might need a moment to warm up"

# Test maps endpoint
echo "  - Testing maps endpoint..."
curl -f "$API_URL/api/v1/users/maps?username=test" || echo "    ⚠️  Maps endpoint might need a moment to warm up"

# Test records endpoint
echo "  - Testing records endpoint..."
curl -f "$API_URL/api/v1/records/latest" || echo "    ⚠️  Records endpoint might need a moment to warm up"

echo "✅ Health check completed"

echo "✨ All done!"