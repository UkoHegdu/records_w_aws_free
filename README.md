# Trackmania Record Tracker

A serverless web application that tracks Trackmania player records and provides mapper alerts with email notifications.

## Architecture

Fully serverless AWS application following best practices for "forever free" usage within AWS free tier limits.

### Core Features
- **User Authentication:** JWT-based with access/refresh tokens, session management in DynamoDB
- **Map Search:** Users can search for maps and view recent records (last 1d/1w/1m)
- **Mapper Alerts:** Users can follow specific mappers and receive email notifications for new records
- **Player Name Resolution:** OAuth2 integration with Trackmania API to resolve account IDs to display names

### Technical Stack

**Frontend:**
- React + TypeScript + Vite
- Deployed on S3 + CloudFront
- Axios with automatic token refresh interceptors
- Centralized auth client (`src/auth.ts`)

**Backend (Serverless):**
- **Lambda Functions:** Node.js 18.x runtime
- **API Gateway:** RESTful API with CORS
- **Database:** Neon PostgreSQL (user data, alerts)
- **Storage:** DynamoDB (sessions, auth tokens, job results)
- **Email:** AWS SES for notifications
- **Scheduling:** EventBridge for daily mapper checks
- **Auth:** 2 types of authentications, one for leaderboards (apiClient.js), one for account names (oauthApiClient.js)

**Key Lambda Functions:**
- `mapSearch` → `mapSearchBackground` (async job processing)
- `scheduler` → `schedulerProcessor` (daily mapper checks)
- `accountNames` (OAuth2 player name resolution)
- `login/register/logout/refreshToken` (auth flow)

### Infrastructure (Terraform)
- **DynamoDB Tables:** `user_sessions`, `auth_tokens`, `map_search_results`
- **SQS Queues:** Job processing with dead letter queues
- **CloudWatch:** Logs with 14-day retention (free tier optimization)
- **IAM:** Least privilege access policies
- **Parameter Store:** Environment variables and secrets

### Best Practices Implemented
- **Security:** JWT tokens, bcrypt hashing, proper session management
- **Reliability:** SQS queues, dead letter queues, retry logic, error handling
- **Cost Optimization:** Log retention policies, reserved concurrency limits
- **Scalability:** Scalable serverless architecture with controlled concurrency limits
