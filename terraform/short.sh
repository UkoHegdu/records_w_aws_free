#!/bin/bash
# deploy-get-map-records.sh - Deploy only the get_map_records Lambda function

set -e

echo "🚀 Deploying get_map_records Lambda function..."

# Remove old zip file to ensure source hash changes
echo "🗑️  Removing old lambda_functions.zip..."
rm -f lambda_functions.zip

# Build and deploy
cd lambda && zip -r ../lambda_functions.zip . && cd .. && terraform apply -target=aws_lambda_function.get_map_records -auto-approve

echo "✅ Deployment complete!"