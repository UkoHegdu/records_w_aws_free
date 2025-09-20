#!/bin/bash
# deploy-development.sh - Deploy to development environment

set -e

echo "🚀 Starting Development deployment..."

# Step 1: Remove old zip file
echo "🗑️  Removing old lambda_functions.zip..."
rm -f lambda_functions.zip

# Step 2: Build and package Lambda functions
echo "📦 Packaging Lambda functions..."
mkdir -p lambda-build
cd lambda-build

cp ../lambda/*.js .
cp ../lambda/package.json .
cp -r ../lambda/shared .

# Copy test files for Lambda deployment
cp -r ../tests/manual/*.js .

# Install dependencies and create zip
npm install --production

# Check if zip command is available
if ! command -v zip &> /dev/null; then
    echo "📦 Installing zip command..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y zip
    elif command -v yum &> /dev/null; then
        sudo yum install -y zip
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y zip
    else
        echo "❌ Cannot install zip automatically. Please install zip manually."
        exit 1
    fi
fi

# Create zip file
zip -r ../lambda_functions.zip .
cd ..
rm -rf lambda-build

echo "✅ Lambda functions packaged"

# Step 3: Apply Terraform Infrastructure for development
echo "🌍 Applying Terraform Infrastructure for development..."
terraform init
terraform workspace select development || terraform workspace new development
terraform plan -var="environment=development" -var="app_name=recordsw-app-dev"
terraform apply -var="environment=development" -var="app_name=recordsw-app-dev" -auto-approve

# Step 4: Get outputs
echo "📡 Getting deployment outputs..."
API_URL=$(terraform output -raw api_gateway_url)
S3_BUCKET=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url)

echo "✅ Development Infrastructure deployed!"
echo "📡 API Gateway URL: $API_URL"
echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"

# Step 5: Build frontend with development API URL
echo "🏗️  Building frontend with development API URL..."
cd ../frontend

cat > .env.development << EOF
VITE_BACKEND_URL=$API_URL
EOF

npm install
npm run build

# Step 6: Deploy frontend to development S3
echo "📤 Deploying frontend to development S3..."
aws s3 sync dist/ s3://$S3_BUCKET --delete

# Step 7: Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [ "$DISTRIBUTION_ID" != "" ]; then
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo "✅ CloudFront cache invalidated"
else
    echo "⚠️  CloudFront distribution ID not found, skipping cache invalidation"
fi

echo "🎉 Development deployment complete!"
echo "📱 Frontend URL: $CLOUDFRONT_URL"
echo "🔗 API URL: $API_URL"

# Step 8: Run smoke tests
echo "🧪 Running smoke tests..."
cd ../terraform/lambda/tests
npm ci
API_BASE_URL=$API_URL npm run test:smoke

echo "✨ Development deployment and testing complete!"
