# Environment Variables Quick Reference

## 🚨 **ALWAYS INCLUDE THESE** (for any Lambda using shared modules)

```hcl
NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
AUTHORIZATION = data.aws_ssm_parameter.authorization.value
USER_AGENT = data.aws_ssm_parameter.user_agent.value
LEAD_API = data.aws_ssm_parameter.lead_api.value
ACCOUNT_API = data.aws_ssm_parameter.account_api.value
OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
```

## 🔍 **Quick Check Before Deploying**

1. **Does your Lambda use `apiClient`?** → Must have `DYNAMODB_TABLE_NAME`
2. **Does your Lambda use `require('./shared/apiClient')`?** → Must have all auth variables
3. **Does your Lambda access database?** → Must have `NEON_DB_CONNECTION_STRING`
4. **Does your Lambda verify JWT?** → Must have `JWT_SECRET`

## 📋 **Copy-Paste Template**

```hcl
environment {
  variables = {
    NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
    JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
    LEAD_API = data.aws_ssm_parameter.lead_api.value
    AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
    AUTHORIZATION = data.aws_ssm_parameter.authorization.value
    USER_AGENT = data.aws_ssm_parameter.user_agent.value
    OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
    OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
  }
}
```

## ⚠️ **Common Errors & Fixes**

| Error | Missing Variable | Fix |
|-------|------------------|-----|
| `Value null at 'tableName'` | `DYNAMODB_TABLE_NAME` | Add `DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name` |
| `Cannot read property 'data'` | `AUTH_API_URL` | Add `AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value` |
| `secret or public key must be provided` | `JWT_SECRET` | Add `JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value` |
