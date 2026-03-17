#!/bin/bash
# deploy.sh - Complete Lambda deployment script

set -e

# Disable AWS CLI pager so commands don't pause waiting for input
export AWS_PAGER=""

echo "🚀 Starting Lambda deployment..."

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

# Step 1: Build Lambda Layer (node_modules) — only when package.json changes
PACKAGE_HASH=$(md5sum lambda/package.json | cut -d' ' -f1)
if [ -f ".layer-hash" ] && [ "$(cat .layer-hash)" = "$PACKAGE_HASH" ] && [ -f "layer.zip" ]; then
    echo "✅ Dependencies unchanged, reusing existing layer.zip"
else
    echo "📦 Building Lambda Layer (node_modules changed)..."
    rm -rf layer-build
    mkdir -p layer-build/nodejs
    cp lambda/package.json layer-build/nodejs/
    cd layer-build/nodejs
    npm install --production
    cd ../..
    rm -f layer.zip
    cd layer-build && zip -r ../layer.zip . && cd ..
    rm -rf layer-build
    echo "$PACKAGE_HASH" > .layer-hash
    echo "✅ Lambda Layer built"
fi

# Step 2: Package Lambda functions (code only — no node_modules)
echo "📦 Packaging Lambda functions (code only)..."
rm -f lambda_functions.zip
mkdir -p lambda-build
cp lambda/*.js lambda-build/
cp -r lambda/shared lambda-build/
cd lambda-build && zip -r ../lambda_functions.zip . && cd ..
rm -rf lambda-build

echo "✅ Lambda functions packaged (without node_modules)"
echo "   - user_search.js"
echo "   - mapSearch.js"
echo "   - mapSearchBackground.js"
echo "   - checkJobStatus.js"
echo "   - create_alert.js"
echo "   - getUserProfile.js"
echo "   - login.js"
echo "   - register.js"
echo "   - getMapRecords.js"
echo "   - accountNames.js"
echo "   - scheduler.js"
echo "   - health.js"
echo "   - test.js"
echo "   - testAdvanced.js"
echo "   - getAdminUsers.js"
echo "   - getAdminConfig.js"
echo "   - updateAdminConfig.js"
echo "   - updateUserAlertType.js"
echo "   - getNotificationHistory.js"
echo "   - getAdminDailyOverview.js"
echo "   - verifyTmUsername.js"
echo "   - refreshToken.js"
echo "   - logout.js"
echo "   - mapSearchDriver.js"
echo "   - driverNotifications.js"
echo "   - checkDriverPositions.js"
echo "   - checkMapPositions.js"
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