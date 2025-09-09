#!/bin/bash
# deploy-frontend.sh - Frontend-only deployment script

set -e

echo "🎨 Starting frontend-only deployment..."

# Step 1: Get outputs from existing Terraform deployment
echo "📡 Getting deployment outputs..."
API_URL=$(terraform output -raw api_gateway_url)
S3_BUCKET=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url)

echo "✅ Infrastructure already deployed!"
echo "📡 API Gateway URL: $API_URL"
echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"

# Step 2: Build frontend with actual API URL
echo "🏗️  Building frontend with API URL..."
cd ../frontend

cat > .env.production << EOF
VITE_BACKEND_URL=$API_URL
EOF

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building frontend..."
npm run build

echo "✅ Frontend built"
cd ../terraform

# Step 3: Deploy frontend to S3
echo "📤 Deploying frontend to S3..."
cd ../frontend
aws s3 sync dist/ s3://$S3_BUCKET --delete
cd ../terraform

# Step 4: Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [ "$DISTRIBUTION_ID" != "" ]; then
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo "✅ CloudFront cache invalidated"
else
    echo "⚠️  CloudFront distribution ID not found, skipping cache invalidation"
fi

echo ""
echo "🎉 Frontend deployment complete!"
echo "🌐 Your app is available at: $CLOUDFRONT_URL"
echo ""
echo "📊 Summary:"
echo "   ✅ Frontend built and deployed"
echo "   ✅ S3 bucket updated"
echo "   ✅ CloudFront cache invalidated"
echo "   ⚡ Lambda functions unchanged (faster deployment)"
