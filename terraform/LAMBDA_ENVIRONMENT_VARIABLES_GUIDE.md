# Lambda Environment Variables Guide

## Overview
This guide ensures all Lambda functions have the correct environment variables to prevent runtime errors and missing dependencies.

## Standard Environment Variables

### 1. **Database & Storage**
```hcl
NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
```

### 2. **Authentication & Security**
```hcl
JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
AUTHORIZATION = data.aws_ssm_parameter.authorization.value
USER_AGENT = data.aws_ssm_parameter.user_agent.value
```

### 3. **External APIs**
```hcl
LEAD_API = data.aws_ssm_parameter.lead_api.value
ACCOUNT_API = data.aws_ssm_parameter.account_api.value
```

### 4. **OAuth (if needed)**
```hcl
OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
```

### 5. **AWS Resources (if needed)**
```hcl
AWS_REGION = "eu-north-1"
SES_FROM_EMAIL = data.aws_ssm_parameter.email_user.value
SES_CONFIGURATION_SET = aws_ses_configuration_set.main.name
```

## Function-Specific Variables

### **Map Search Functions**
- `MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name`
- `MAP_SEARCH_QUEUE_URL = aws_sqs_queue.map_search_queue.url`

### **Driver Notification Functions**
- `DRIVER_NOTIFICATION_QUEUE_URL = aws_sqs_queue.driver_notification_queue.url`
- `DRIVER_NOTIFICATION_JOBS_TABLE_NAME = aws_dynamodb_table.driver_notification_jobs.name`

## Checklist for New Lambda Functions

### ✅ **Before Creating a Lambda Function:**

1. **Identify Dependencies:**
   - [ ] Does it use `apiClient`? → Add `DYNAMODB_TABLE_NAME`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT`
   - [ ] Does it access database? → Add `NEON_DB_CONNECTION_STRING`
   - [ ] Does it use JWT? → Add `JWT_SECRET`
   - [ ] Does it call external APIs? → Add `LEAD_API`, `ACCOUNT_API`
   - [ ] Does it use OAuth? → Add `OCLIENT_ID`, `OCLIENT_SECRET`
   - [ ] Does it use AWS services? → Add specific AWS resource variables

2. **Check Existing Functions:**
   - [ ] Look at similar functions in `main.tf` for reference
   - [ ] Copy environment variables from functions with similar functionality

3. **Verify in Code:**
   - [ ] Check the Lambda function code for `process.env.VARIABLE_NAME` usage
   - [ ] Ensure all referenced environment variables are defined

### ✅ **After Creating a Lambda Function:**

1. **Test Environment Variables:**
   - [ ] Deploy and test the function
   - [ ] Check CloudWatch logs for environment variable errors
   - [ ] Verify all `process.env` references work

2. **Document Dependencies:**
   - [ ] Add comments in the Lambda function code explaining which environment variables are used
   - [ ] Update this guide if new patterns emerge

## Common Error Patterns

### ❌ **Missing DYNAMODB_TABLE_NAME**
```
ValidationException: Value null at 'tableName' failed to satisfy constraint: Member must not be null
```
**Fix:** Add `DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name`

### ❌ **Missing AUTH_API_URL**
```
TypeError: Cannot read property 'data' of undefined
```
**Fix:** Add `AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value`

### ❌ **Missing JWT_SECRET**
```
JsonWebTokenError: secret or public key must be provided
```
**Fix:** Add `JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value`

## Template for New Lambda Functions

```hcl
resource "aws_lambda_function" "function_name" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-function-name"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/functionName.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      # Database & Storage
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      
      # Authentication & Security
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      
      # External APIs
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      ACCOUNT_API = data.aws_ssm_parameter.account_api.value
      
      # OAuth (if needed)
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
      
      # Add function-specific variables here
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}
```

## Verification Commands

After creating a Lambda function, verify environment variables:

```bash
# Check if function exists
aws lambda get-function --function-name recordsw-app-function-name

# Check environment variables
aws lambda get-function-configuration --function-name recordsw-app-function-name --query 'Environment.Variables'
```

## Remember

- **When in doubt, include more environment variables** - unused ones won't hurt
- **Always check existing similar functions** for reference
- **Test thoroughly** after deployment
- **Check CloudWatch logs** for environment variable errors
- **Update this guide** when new patterns are discovered
