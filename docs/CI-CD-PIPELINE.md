# CI/CD Pipeline Documentation

## Overview

This project uses GitHub Actions to implement a comprehensive CI/CD pipeline that includes:

- **Code Quality & Security Scanning** (SonarCloud + GitHub CodeQL)
- **Unit Testing** (Jest for Lambda, Vitest for Frontend)
- **Build & Package** (Lambda functions + Frontend)
- **Environment-Specific Deployment** (Staging → Production)
- **Smoke Tests** (Service connectivity verification)
- **Automated Notifications**

## Pipeline Stages

### 1. Code Quality & Security Scanning

**Tools Used:**
- **SonarCloud** (Free for public repositories)
- **GitHub CodeQL** (Free for all repositories)

**What it checks:**
- Code quality metrics
- Security vulnerabilities
- Code smells and bugs
- Test coverage
- Duplicated code

**Configuration:**
- SonarCloud: `sonar-project.properties`
- CodeQL: Automatic JavaScript analysis

### 2. Unit Testing

**Lambda Functions:**
- Framework: Jest
- Location: `terraform/lambda/tests/unit/`
- Coverage: AWS SDK mocking, database mocking
- Command: `npm run test:unit`

**Frontend:**
- Framework: Vitest
- Location: `frontend/src/test/`
- Coverage: React components, utilities
- Command: `npm test`

### 3. Build & Package

**Lambda Functions:**
- Packages all Lambda functions into `lambda_functions.zip`
- Includes dependencies and shared modules
- Excludes test files and dev dependencies

**Frontend:**
- Builds React application with Vite
- Creates optimized production bundle
- Generates TypeScript declarations

### 4. Environment Deployment

**Staging Environment:**
- Triggered on `develop` branch
- Uses `staging` Terraform workspace
- Deploys to separate AWS resources
- Runs smoke tests after deployment

**Production Environment:**
- Triggered on `main` branch
- Requires staging smoke tests to pass
- Uses `default` Terraform workspace
- Deploys to production AWS resources

### 5. Smoke Tests

**Purpose:**
- Verify service connectivity
- Check API endpoint responses
- Validate CORS configuration
- Test error handling
- Measure response times

**Tests Include:**
- Health endpoint verification
- User search functionality
- Map search functionality
- Records endpoint
- Account names endpoint
- CORS headers
- Error handling
- Response time validation
- Database connectivity
- Lambda cold start performance

## Setup Instructions

### 1. GitHub Repository Setup

1. **Enable GitHub Actions:**
   - Go to repository Settings → Actions
   - Enable Actions for the repository

2. **Set up Secrets:**
   ```
   AWS_ACCESS_KEY_ID: Your AWS access key
   AWS_SECRET_ACCESS_KEY: Your AWS secret key
   SONAR_TOKEN: Your SonarCloud token (optional)
   ```

3. **Create Environments:**
   - Go to Settings → Environments
   - Create `staging` environment
   - Create `production` environment
   - Add protection rules if needed

### 2. SonarCloud Setup (Optional)

1. **Create SonarCloud Account:**
   - Go to [sonarcloud.io](https://sonarcloud.io)
   - Sign in with GitHub
   - Create a new project

2. **Get SonarCloud Token:**
   - Go to Account → Security
   - Generate a new token
   - Add to GitHub secrets as `SONAR_TOKEN`

3. **Update Configuration:**
   - Edit `sonar-project.properties`
   - Replace `your-github-username` with your actual username

### 3. Branch Strategy

**Recommended Workflow:**
```
feature-branch → develop → main
     ↓            ↓        ↓
   PR tests    staging   production
```

**Branch Protection Rules:**
- `main`: Require PR reviews, require status checks
- `develop`: Require status checks

### 4. Local Development

**Run Tests Locally:**
```bash
# Lambda tests
cd terraform/lambda/tests
npm install
npm run test:unit
npm run test:integration

# Frontend tests
cd frontend
npm install
npm test

# Smoke tests
cd terraform/lambda/tests
API_BASE_URL=https://your-api-url npm run test:smoke
```

**Deploy Locally:**
```bash
# Staging
cd terraform
./deploy-staging.sh

# Development
cd terraform
./deploy-development.sh

# Production
cd terraform
./deploy.sh
```

## Pipeline Configuration

### Environment Variables

**Required Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SONAR_TOKEN` (optional)

**Environment Variables:**
- `NODE_VERSION`: '18'
- `AWS_REGION`: 'eu-north-1'

### Workflow Triggers

**Push Events:**
- `main` branch → Production deployment
- `develop` branch → Staging deployment

**Pull Request Events:**
- All branches → Code quality + Unit tests

### Job Dependencies

```
code-quality → unit-tests → build → deploy-staging → smoke-tests-staging
                                                      ↓
                                              deploy-production → smoke-tests-production
```

## Monitoring & Notifications

### Success Notifications
- Pipeline completion status
- Deployment URLs
- Test results summary

### Failure Notifications
- Failed test details
- Deployment error messages
- Rollback recommendations

### Metrics Tracked
- Test coverage percentage
- Code quality score
- Deployment frequency
- Mean time to recovery

## Troubleshooting

### Common Issues

**1. AWS Credentials:**
```bash
# Verify AWS credentials
aws sts get-caller-identity
```

**2. Terraform State:**
```bash
# Check workspace
terraform workspace list
terraform workspace select staging
```

**3. Test Failures:**
```bash
# Run tests locally
npm run test:unit
npm run test:smoke
```

**4. Deployment Issues:**
```bash
# Check Terraform plan
terraform plan -var="environment=staging"
```

### Debug Commands

**Check Pipeline Logs:**
- Go to Actions tab in GitHub
- Click on failed workflow
- Review job logs

**Local Debugging:**
```bash
# Test smoke tests locally
cd terraform/lambda/tests
API_BASE_URL=https://your-staging-url npm run test:smoke

# Check Lambda logs
aws logs tail /aws/lambda/recordsw-app-staging-health --follow
```

## Best Practices

### Code Quality
- Write meaningful test cases
- Maintain high test coverage (>80%)
- Fix code quality issues promptly
- Use meaningful commit messages

### Deployment
- Always test in staging first
- Monitor deployment metrics
- Keep rollback plans ready
- Document deployment procedures

### Security
- Regularly update dependencies
- Scan for vulnerabilities
- Use least privilege AWS policies
- Rotate secrets regularly

## Cost Optimization

### GitHub Actions
- Use `ubuntu-latest` for most jobs
- Cache dependencies when possible
- Skip unnecessary jobs with conditions

### AWS Resources
- Use appropriate instance sizes
- Implement auto-scaling
- Monitor costs with AWS Cost Explorer
- Clean up unused resources

## Future Enhancements

### Planned Features
- [ ] Performance testing
- [ ] Security scanning with Snyk
- [ ] Automated rollback on failures
- [ ] Slack/Discord notifications
- [ ] Database migration testing
- [ ] Load testing with Artillery

### Integration Options
- [ ] AWS CodePipeline
- [ ] Jenkins CI/CD
- [ ] GitLab CI/CD
- [ ] Azure DevOps
