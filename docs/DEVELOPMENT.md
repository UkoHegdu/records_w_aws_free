# Development Setup Guide

## Prerequisites

- Node.js 18+ 
- AWS CLI configured with appropriate permissions
- Terraform 1.0+
- Git

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd records_w_aws_free

# Install frontend dependencies
cd frontend
npm install

# Install Lambda dependencies
cd ../terraform/lambda
npm install

# Install test dependencies
cd ../../tests
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the frontend directory:

```bash
# frontend/.env.local
VITE_BACKEND_URL=http://localhost:3000  # For local development
```

### 3. AWS Configuration

Ensure your AWS CLI is configured:

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region (eu-north-1), and output format (json)
```

### 4. Parameter Store Setup

Before deploying, you need to set up AWS Parameter Store values:

```bash
# Set required parameters (replace with your actual values)
aws ssm put-parameter --name "/prod/EMAIL_USER" --value "your-email@example.com" --type "String"
aws ssm put-parameter --name "/prod/AUTH_API_URL" --value "https://api.trackmania.com" --type "String"
aws ssm put-parameter --name "/prod/LEAD_API" --value "https://api.trackmania.com" --type "String"
aws ssm put-parameter --name "/prod/ACCOUNT_API" --value "https://api.trackmania.com" --type "String"
aws ssm put-parameter --name "/prod/AUTHORIZATION" --value "Bearer your-token" --type "String"
aws ssm put-parameter --name "/prod/USER_AGENT" --value "YourApp/1.0" --type "String"
aws ssm put-parameter --name "/prod/JWT_SECRET" --value "your-jwt-secret" --type "SecureString"
aws ssm put-parameter --name "/prod/OCLIENT_ID" --value "your-oauth-client-id" --type "String"
aws ssm put-parameter --name "/prod/OCLIENT_SECRET" --value "your-oauth-secret" --type "SecureString"
aws ssm put-parameter --name "/prod/NEON_DB_USER" --value "your-db-user" --type "String"
aws ssm put-parameter --name "/prod/NEON_DB_PW" --value "your-db-password" --type "SecureString"
aws ssm put-parameter --name "/prod/NEON_DB_CONNECTION_STRING" --value "postgresql://..." --type "SecureString"
aws ssm put-parameter --name "/prod/ERROR_EMAIL" --value "error@example.com" --type "String"
```

## Development Workflow

### Frontend Development

```bash
cd frontend
npm run dev
```

This starts the Vite development server on `http://localhost:5173`

### Lambda Development

For local Lambda testing, you can use the AWS SAM CLI or test individual functions:

```bash
cd terraform/lambda

# Test a specific function locally
node -e "
const handler = require('./login.js');
const event = { body: JSON.stringify({ email: 'test@example.com', password: 'test' }) };
handler.handler(event, {}, (err, result) => console.log(result));
"
```

### Database Development

The application uses Neon PostgreSQL. For local development, you can:

1. Use the production database (be careful!)
2. Set up a local PostgreSQL instance
3. Use Neon's development database

## Testing

### Running Tests

```bash
# Frontend tests
cd frontend
npm test

# Lambda tests
cd tests
npm test
```

### Manual Testing

Use the provided test scripts:

```bash
# Test API endpoints
./Other/test_endpoints.sh

# Test driver notifications
./Other/testDriverNotifications.sh
```

## Deployment

### Full Deployment

```bash
cd terraform
./deploy.sh
```

### Frontend Only

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
```

### Lambda Only

```bash
cd terraform
./deploy.sh  # This will update Lambda functions
```

## Debugging

### Lambda Debugging

1. Check CloudWatch logs:
```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/recordsw-app"
aws logs tail /aws/lambda/recordsw-app-function-name --follow
```

2. Use the debug script:
```bash
./Other/debug_lambdas.sh
```

### Frontend Debugging

1. Check browser console for errors
2. Use React DevTools
3. Check network tab for API calls

### Database Debugging

Connect to your Neon database:
```bash
psql "your-connection-string"
```

## Common Issues

### Lambda Environment Variables

If a Lambda function fails, check that all required environment variables are set. See `Other/ENVIRONMENT_VARIABLES_QUICK_REFERENCE.md`

### CORS Issues

If you get CORS errors, ensure the API Gateway has proper CORS configuration and the frontend is using the correct API URL.

### Authentication Issues

- Check JWT token expiration
- Verify JWT_SECRET is set correctly
- Check DynamoDB permissions for token storage

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit a pull request

## Code Style

- Use ESLint for frontend code
- Follow existing Lambda function patterns
- Add comments for complex logic
- Use meaningful variable names
