#!/bin/bash
# deploy-frontend-only.sh - Deploy only frontend (for updates without infrastructure changes)

set -e

echo "🚀 Starting frontend-only deployment..."

# Step 1: Get current outputs from Terraform
echo "📡 Getting current deployment outputs..."
API_URL=$(terraform output -raw api_gateway_url)
S3_BUCKET=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url)

echo "📡 API Gateway URL: $API_URL"
echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"

# Step 2: Build frontend with current API URL
echo "🏗️  Building frontend..."
cd ../frontend

cat > .env.production << EOF
VITE_BACKEND_URL=$API_URL
EOF

npm install
npm run build

echo "✅ Frontend built"

# Step 3: Deploy frontend to S3
echo "📤 Deploying frontend to S3..."
aws s3 sync dist/ s3://$S3_BUCKET --delete

# Step 4: Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
cd ../terraform
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [ "$DISTRIBUTION_ID" != "" ]; then
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo "✅ CloudFront cache invalidated"
else
    echo "⚠️  CloudFront distribution ID not found, skipping cache invalidation"
fi

echo "🎉 Frontend deployment complete!"
echo "📱 Frontend URL: $CLOUDFRONT_URL"
echo "🔗 API URL: $API_URL"

# Optional: Run a quick health check
echo "🏥 Running health check..."
curl -f "$API_URL/health" || echo "⚠️  Health check failed - API might need a moment to warm up"

echo "✨ Frontend deployment done!"
