#!/bin/bash
# frontend.sh - Deploy only the frontend to S3 and CloudFront

set -e

echo "🚀 Starting frontend deployment..."

# Step 1: Get S3 bucket name from Terraform outputs
echo "📡 Getting S3 bucket name from Terraform..."
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "recordsw-app-frontend-prod")
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url 2>/dev/null || echo "")
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"

# Step 2: Get API Gateway URL for frontend build
echo "📡 Getting API Gateway URL..."
API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
    echo "❌ Error: Could not get API Gateway URL from Terraform outputs"
    echo "   Make sure Terraform has been applied and outputs are available"
    exit 1
fi

echo "🔗 API Gateway URL: $API_URL"

# Step 3: Build frontend with API URL
echo "🏗️  Building frontend with API URL..."
cd ../frontend

# Create production environment file
cat > .env.production << EOF
VITE_BACKEND_URL=$API_URL
EOF

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Build the frontend
echo "🔨 Building frontend..."
npm run build

echo "✅ Frontend built successfully"

# Step 4: Deploy frontend to S3
echo "📤 Deploying frontend to S3..."
aws s3 sync dist/ s3://$S3_BUCKET --delete

echo "✅ Frontend deployed to S3"

# Step 5: Invalidate CloudFront cache if distribution ID is available
if [ "$DISTRIBUTION_ID" != "" ]; then
    echo "🔄 Invalidating CloudFront cache..."
    aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
    echo "✅ CloudFront cache invalidated"
else
    echo "⚠️  CloudFront distribution ID not found, skipping cache invalidation"
fi

# Step 6: Clean up
echo "🧹 Cleaning up..."
rm -f .env.production

echo "🎉 Frontend deployment complete!"
echo "📱 Frontend URL: $CLOUDFRONT_URL"
echo "🔗 API URL: $API_URL"

# Optional: Run a quick health check
if [ "$CLOUDFRONT_URL" != "" ]; then
    echo "🏥 Running quick health check..."
    if curl -f -s "$CLOUDFRONT_URL" > /dev/null; then
        echo "✅ Frontend is accessible"
    else
        echo "⚠️  Frontend might need a moment to be accessible"
    fi
fi

echo "✨ All done!"
