#!/bin/bash
# setup-pipeline.sh - Quick setup for CI/CD pipeline

set -e

echo "🚀 Setting up CI/CD Pipeline for Trackmania Record Tracker"
echo "=" .repeat(60)

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "terraform" ] || [ ! -d "frontend" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

echo "📋 Prerequisites Check:"
echo "  ✓ Project structure verified"

# Check for required tools
echo "🔧 Checking required tools..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    echo "   Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform is required but not installed"
    echo "   Please install Terraform from https://terraform.io"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is required but not installed"
    echo "   Please install AWS CLI from https://aws.amazon.com/cli/"
    exit 1
fi

echo "  ✓ Node.js $(node --version)"
echo "  ✓ npm $(npm --version)"
echo "  ✓ Terraform $(terraform --version | head -n1)"
echo "  ✓ AWS CLI $(aws --version | head -n1)"

# Install frontend test dependencies
echo "📦 Installing frontend test dependencies..."
cd frontend
npm install --save-dev @vitest/coverage-v8 @vitest/ui jsdom vitest @testing-library/react @testing-library/jest-dom
cd ..

# Install Lambda test dependencies (if not already installed)
echo "📦 Installing Lambda test dependencies..."
cd terraform/lambda/tests
npm install
cd ../../..

# Make deployment scripts executable
echo "🔧 Making deployment scripts executable..."
chmod +x terraform/deploy-staging.sh
chmod +x terraform/deploy-development.sh

echo "✅ Pipeline setup complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Set up GitHub repository secrets:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo "   - SONAR_TOKEN (optional)"
echo ""
echo "2. Create GitHub environments:"
echo "   - staging"
echo "   - production"
echo ""
echo "3. Set up branch protection rules:"
echo "   - main: Require PR reviews, require status checks"
echo "   - develop: Require status checks"
echo ""
echo "4. Test the pipeline:"
echo "   - Push to develop branch for staging deployment"
echo "   - Push to main branch for production deployment"
echo ""
echo "📚 Documentation:"
echo "   - CI/CD Pipeline: docs/CI-CD-PIPELINE.md"
echo "   - Development Setup: docs/DEVELOPMENT.md"
echo ""
echo "🧪 Test Commands:"
echo "   - Lambda tests: cd terraform/lambda/tests && npm run test:unit"
echo "   - Frontend tests: cd frontend && npm test"
echo "   - Smoke tests: cd terraform/lambda/tests && API_BASE_URL=https://your-url npm run test:smoke"
echo ""
echo "🎉 Happy coding!"
