# Prerequisites

This document lists all the prerequisites needed to deploy this application that are **not** managed by Terraform.

## AWS Resources

### 1. S3 Bucket for Terraform State
**Purpose:** Store Terraform state files remotely for persistence across deployments.

```bash
aws s3 mb s3://recordsw-terraform-state-537928299818 --region eu-north-1
```

### 2. DynamoDB Table for State Locking
**Purpose:** Prevent concurrent Terraform deployments from corrupting state.

```bash
aws dynamodb create-table --table-name terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 --region eu-north-1
```

## GitHub Secrets

### Required Secrets in GitHub Repository Settings:
- `AWS_ACCESS_KEY_ID` - AWS access key for GitHub Actions
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for GitHub Actions
- `AWS_REGION` - AWS region (e.g., `eu-north-1`)

## AWS Parameter Store Parameters

### Test Environment (`/test/`):
- `EMAIL_USER` - Email address for sending notifications
- `ERROR_EMAIL` - Email address for error notifications
- `JWT_SECRET` - Secret key for JWT token signing
- `NEON_DB_CONNECTION_STRING` - PostgreSQL connection string
- `OCLIENT_ID` - OAuth client ID
- `OCLIENT_SECRET` - OAuth client secret
- `AUTH_API_URL` - Authentication API URL
- `LEAD_API` - Lead API URL
- `ACCOUNT_API` - Account API URL

### Production Environment (`/main/`):
- Same parameters as test environment but with `/main/` prefix

## External Services

### 1. Neon Database
**Purpose:** PostgreSQL database for application data.

**Setup:**
1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Add to AWS Parameter Store as `/test/NEON_DB_CONNECTION_STRING` and `/main/NEON_DB_CONNECTION_STRING`

### 2. Trackmania API Access
**Purpose:** Access to Trackmania leaderboard and map data.

**Setup:**
1. Register at [trackmania.com](https://trackmania.com)
2. Get OAuth credentials
3. Add to AWS Parameter Store as `/test/OCLIENT_ID`, `/test/OCLIENT_SECRET`, etc.

## IAM User for GitHub Actions

### 1. Create IAM User
```bash
aws iam create-user --user-name github-actions-deploy
```

### 2. Create Access Keys
```bash
aws iam create-access-key --user-name github-actions-deploy
```

### 3. Attach Policy
```bash
aws iam attach-user-policy --user-name github-actions-deploy --policy-arn arn:aws:iam::537928299818:policy/GitHubActionsDeployPolicy
```

## Verification

### Check Prerequisites:
```bash
# Verify S3 bucket exists
aws s3 ls s3://recordsw-terraform-state-537928299818

# Verify DynamoDB table exists
aws dynamodb describe-table --table-name terraform-locks

# Verify Parameter Store parameters exist
aws ssm get-parameters-by-path --path "/test/" --recursive

# Verify IAM user exists
aws iam get-user --user-name github-actions-deploy
```

## Troubleshooting

### Common Issues:
1. **S3 bucket name conflict** - Use a unique bucket name with your AWS account ID
2. **Parameter Store permissions** - Ensure GitHub Actions IAM user has `ssm:*` permissions
3. **Neon DB connection** - Verify connection string format and network access
4. **OAuth credentials** - Ensure Trackmania API credentials are valid and active

### State Management:
- **Never delete** the S3 bucket or DynamoDB table after initial setup
- **Backup state** before major changes: `aws s3 cp s3://recordsw-terraform-state-537928299818/terraform.tfstate ./backup.tfstate`
- **State corruption** - Use `terraform state` commands to fix, not manual AWS CLI
