# Architecture Overview

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Lambda        │
│   (React)       │◄──►│   (REST API)    │◄──►│   Functions     │
│   S3+CloudFront │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                │                       │
                                ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   DynamoDB      │    │   PostgreSQL    │
                    │   (Sessions,    │    │   (User Data,   │
                    │   Cache, Tokens)│    │   Alerts)       │
                    └─────────────────┘    └─────────────────┘
                                │                       │
                                │                       │
                                ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   SQS Queues    │    │   SES Email     │
                    │   (Job Processing)│   │   (Notifications)│
                    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌─────────────────┐
                    │   EventBridge   │
                    │   (Scheduling)  │
                    └─────────────────┘
```

## Component Details

### Frontend Layer
- **Technology**: React + TypeScript + Vite
- **Hosting**: AWS S3 + CloudFront
- **Authentication**: JWT tokens stored in localStorage
- **API Communication**: Axios with automatic token refresh

### API Layer
- **Technology**: AWS API Gateway (REST)
- **Authentication**: JWT validation
- **CORS**: Configured for frontend domain
- **Rate Limiting**: Built-in API Gateway limits

### Compute Layer
- **Technology**: AWS Lambda (Node.js 18.x)
- **Functions**: 30+ specialized functions
- **Cold Start**: Optimized with connection pooling
- **Timeout**: 15 minutes max for background processing

## Feature-to-Lambda Map (quick overview)

The goal of this section is to answer: “if I touch feature X, which Lambdas are involved, and what’s the typical flow?”

### Auth.feature (used by other features)

- **Register**: `register.js` → PostgreSQL (`users`)
- **Login**: `login.js` → PostgreSQL (`users`) → JWT access/refresh tokens → DynamoDB (`USER_SESSIONS_TABLE_NAME`)
- **Refresh access token**: `refreshToken.js` → DynamoDB session lookup/update → new JWTs
- **Logout**: `logout.js` → DynamoDB session delete
- **Authenticated endpoints (pattern)**: feature Lambda verifies `Authorization: Bearer <jwt>` using `JWT_SECRET`, then authorizes via `user_id` / `role` claims.

### Map search (mapper “what happened recently?”)

- **Flow**:

  `mapSearch.js` (API) → DynamoDB job row (`MAP_SEARCH_RESULTS_TABLE_NAME`, status=pending) → SQS (`MAP_SEARCH_QUEUE_URL`) → `mapSearchBackground.js` (SQS consumer) → Trackmania APIs + `accountNames.js` helper → DynamoDB job row updated (status=completed, result=...)

- **Client polling**:

  Frontend → `checkJobStatus.js` (API) → DynamoDB job row → status/result returned

- **Notes**:
  - `mapSearchBackground.js` may initialize map position rows for “inaccurate mode” users (it calls `checkMapPositions.js` and writes PostgreSQL `map_positions`).

### Daily mapper alerts (new records on maps you follow)

- **Flow**:

  EventBridge schedule → `scheduler.js` → PostgreSQL (`alerts`) → SQS (`SCHEDULER_QUEUE_URL`, jobs of type `map_alert_check`) → `schedulerProcessor.js` (SQS consumer) → Trackmania API (via `mapSearch.fetchMapsAndLeaderboards`) → DynamoDB daily email row (`DAILY_EMAILS_TABLE_NAME`, `mapper_content`) + PostgreSQL notification history (`notification_history`)

### Daily driver notifications (your top-5 position changed)

- **User management (API)**: Auth.feature → `driverNotifications.js` (CRUD for `driver_notifications` in PostgreSQL; validates the user is currently in top 5 before allowing creation)
- **Scheduled processing – two implementations exist in this repo**:
  - **SQS-based (implemented in `schedulerProcessor.js`)**:

    EventBridge schedule → `scheduler.js` → PostgreSQL (`driver_notifications` via `users`) → SQS (`SCHEDULER_QUEUE_URL`, jobs of type `driver_notification_check`) → `schedulerProcessor.js` → `checkDriverPositions.js` (+ DynamoDB cache lookups) → DynamoDB daily email row updated (`driver_content`) + PostgreSQL notification history

  - **Step Functions-based (wired in Terraform)**:

    EventBridge schedule → Step Functions state machine → `driverNotificationProcessor.js` → `driverNotificationStatusCheck.js` → `emailSender.js`

### Email delivery (aggregated daily email)

- **Flow**:

  `emailSender.js` → DynamoDB scan of today’s rows in `DAILY_EMAILS_TABLE_NAME` → SES send (skips rows that have no mapper + no driver content)

### Admin panel / operations

- **Reads**: Auth.feature (admin role) → `getAdminUsers.js`, `getAdminConfig.js`, `getAdminDailyOverview.js`
- **Writes**: Auth.feature (admin role) → `updateAdminConfig.js`, `updateUserAlertType.js`

### Feedback

- **Submit**: (optionally Auth.feature) → `submitFeedback.js` → PostgreSQL
- **Admin view**: Auth.feature (admin role) → `getFeedback.js` → PostgreSQL

### Alert subscriptions (follow a mapper / manage alert maps)

- **Alert CRUD (API)**: Auth.feature → `create_alert.js` (GET/POST/DELETE for `alerts`)
- **Map list for alerts**:
  - Not fully represented as a single “alert maps” Lambda in Terraform; the current async work is centered around the scheduler + `schedulerProcessor.js`.

### Map lookup for driver notifications (search Trackmania Exchange)

- **Flow**: Auth.feature → `mapSearchDriver.js` → Trackmania Exchange API (`https://trackmania.exchange/api/maps`)
- **Purpose**: lightweight search by map name / map UID (paged), mainly to let users select a map when creating a driver notification.

### Trackmania identity binding (set tm_username / tm_account_id)

- **Flow**: Auth.feature → `verifyTmUsername.js` → Trackmania API (OAuth-backed) → PostgreSQL (`users.tm_username`, `users.tm_account_id`)

### “Records for a map” (UI support)

- **Flow**: (likely public) → `getMapRecords.js` → Trackmania leaderboard API (via `shared/apiClient.js`)

### Search users (admin / helper)

- **Flow**: Auth.feature (role-dependent) → `user_search.js` → PostgreSQL

### Notification history (UI support)

- **Flow**: Auth.feature → `getNotificationHistory.js` → PostgreSQL (`notification_history`)

### Utilities / diagnostics

- **Health check**: `health.js`
- **Direct position check helpers**:
  - `checkMapPositions.js` (map “position API” helper used by `schedulerProcessor.js` / `mapSearchBackground.js`)
  - `checkDriverPositions.js` (driver position helper used by `schedulerProcessor.js`)

### Test-only Lambdas (deployed in Terraform)

Terraform currently defines `test.js` and `testAdvanced.js` as Lambda functions. If you don’t intentionally hit these in prod, they’re good candidates to remove (or restrict) to reduce surface area.

### Data Layer
- **PostgreSQL**: Neon database for persistent data
  - Users, alerts, driver notifications
  - Admin configuration
  - Notification history
- **DynamoDB**: NoSQL for temporary data
  - JWT tokens and sessions
  - Map search results cache
  - Leaderboard cache
  - Job status tracking

### Messaging Layer
- **SQS**: Queue-based job processing
  - Map search jobs
  - Scheduler jobs
  - Driver notification jobs
- **Dead Letter Queues**: Error handling
- **EventBridge**: Scheduled tasks (daily processing)

### External Services
- **Trackmania API**: Player data and leaderboards
- **SES**: Email notifications
- **Parameter Store**: Environment variables and secrets

## Data Flow

### 1. User Authentication Flow
```
User Login → Lambda (login.js) → PostgreSQL → JWT Generation → DynamoDB (sessions)
```

### 2. Map Search Flow
```
User Request → API Gateway → Lambda (mapSearch.js) → DynamoDB (job row, pending) → SQS Queue →
Background Lambda (mapSearchBackground.js) → Trackmania API (+ account name resolution) →
DynamoDB (job row updated with status/result) → User Polling (checkJobStatus.js) → Results Returned
```

### 3. Daily Notification Flow
```
EventBridge (5 AM CET) → Lambda (scheduler.js) → PostgreSQL (alerts + driver notifications users) →
SQS Queue → Lambda (schedulerProcessor.js) → Trackmania API →
DynamoDB (DAILY_EMAILS_TABLE_NAME mapper_content/driver_content) + PostgreSQL (notification_history)
```

### 4. Driver Notification Flow
```
EventBridge (6 AM CET) → Step Functions → Lambda (driverNotificationProcessor.js) →
Lambda (driverNotificationStatusCheck.js) → Lambda (emailSender.js) → SES
```

## Security Architecture

### Authentication
- JWT access tokens (15 minutes) + refresh tokens (7 days)
- Refresh-token flow backed by DynamoDB sessions
- Session management in DynamoDB
- Role-based access control (user/admin)

### Authorization
- API Gateway authorizers
- Lambda function-level JWT validation
- Admin-only endpoints protected
- Database-level user isolation

### Data Protection
- Environment variables in Parameter Store
- Secure string parameters for secrets
- DynamoDB encryption at rest
- PostgreSQL connection encryption

## Scalability Considerations

### Auto-scaling
- Lambda functions auto-scale based on demand
- DynamoDB on-demand billing
- SQS handles burst traffic
- CloudFront global distribution

### Performance Optimization
- DynamoDB caching for API responses
- Connection pooling in Lambda functions
- SQS batching for efficiency
- CloudFront caching for static assets

### Cost Optimization
- Reserved concurrency limits
- CloudWatch log retention (14 days)
- DynamoDB TTL for automatic cleanup
- Free tier optimization

## Monitoring and Observability

### CloudWatch
- Lambda function metrics (invocations, errors, duration)
- Custom dashboards
- Alarms for error rates and performance
- Log aggregation

### Error Handling
- SNS notifications for critical errors
- Dead letter queues for failed messages
- Comprehensive error logging
- User-friendly error messages

## Disaster Recovery

### Backup Strategy
- PostgreSQL automated backups (Neon)
- DynamoDB point-in-time recovery
- Terraform state backup
- Code repository backup

### Recovery Procedures
- Infrastructure recreation via Terraform
- Database restoration from backups
- Lambda function redeployment
- Frontend redeployment from S3

## Development Workflow

### Local Development
- Frontend: Vite dev server
- Lambda: Local testing with mock events
- Database: Shared development instance
- API: Mock responses for development

### Deployment Pipeline
1. Code changes committed
2. Lambda functions packaged
3. Terraform infrastructure updated
4. Frontend built and deployed
5. CloudFront cache invalidated
6. Health checks performed

### Testing Strategy
- Unit tests for Lambda functions
- Integration tests for API endpoints
- End-to-end tests for critical workflows
- Manual testing with provided scripts
