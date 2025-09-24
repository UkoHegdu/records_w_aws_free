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
User Request → API Gateway → Lambda (mapSearch.js) → SQS Queue → 
Background Lambda (mapSearchBackground.js) → Trackmania API → 
DynamoDB (results) → User Polling → Results Returned
```

### 3. Daily Notification Flow
```
EventBridge (5 AM) → Lambda (scheduler.js) → PostgreSQL (get users) → 
SQS Queue → Lambda (schedulerProcessor.js) → Trackmania API → 
Email Composition → Lambda (emailSender.js) → SES → User Email
```

### 4. Driver Notification Flow
```
EventBridge (6 AM) → Step Functions → Lambda (driverNotificationProcessor.js) → 
Lambda (driverNotificationStatusCheck.js) → Lambda (emailSender.js) → SES
```

## Security Architecture

### Authentication
- JWT tokens with 24-hour expiration
- Refresh tokens for seamless renewal
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
