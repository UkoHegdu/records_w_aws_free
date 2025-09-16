# Trackmania Record Tracker

A serverless web application that tracks Trackmania player records and provides mapper alerts with email notifications. Features advanced admin controls, efficient driver notifications, and intelligent caching for optimal performance.

## Architecture

Fully serverless AWS application following best practices for "forever free" usage within AWS free tier limits.

### Core Features
- **User Authentication:** JWT-based with access/refresh tokens, session management in DynamoDB
- **Map Search:** Users can search for maps and view recent records (last 1d/1w/1m)
- **Mapper Alerts:** Users can follow specific mappers and receive email notifications for new records
- **Driver Notifications:** Users can track specific maps and get notified when their times are beaten
- **Player Name Resolution:** OAuth2 integration with Trackmania API to resolve account IDs to display names
- **Admin Panel:** Role-based admin controls for user management and system configuration
- **Smart Caching:** DynamoDB-based caching system for efficient API usage
- **Two-Phase Processing:** Optimized batch processing with map alerts and driver notifications

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
- `scheduler` → `schedulerProcessor` (daily mapper checks with two-phase processing)
- Position checking functions (efficient API usage)
- Map position tracking (for optimized alerts)
- `accountNames` (OAuth2 player name resolution)
- `login/register/logout/refreshToken` (auth flow)
- Admin configuration management functions
- User management functions
- Notification history functions
- Admin monitoring functions

### Infrastructure (Terraform)
- **DynamoDB Tables:** User sessions, authentication tokens, search results, caching
- **PostgreSQL Tables:** User data, alerts, notifications, position tracking, admin configuration
- **SQS Queues:** Job processing with dead letter queues
- **CloudWatch:** Logs with 14-day retention (free tier optimization)
- **IAM:** Least privilege access policies
- **Parameter Store:** Environment variables and secrets

### Best Practices Implemented
- **Security:** JWT tokens, bcrypt hashing, proper session management, role-based access control
- **Reliability:** SQS queues, dead letter queues, retry logic, error handling, notification history tracking
- **Cost Optimization:** Log retention policies, reserved concurrency limits, intelligent caching
- **Scalability:** Scalable serverless architecture with controlled concurrency limits
- **Performance:** Two-phase processing, efficient API usage, DynamoDB caching
- **User Experience:** Real-time admin controls, notification history, status tracking

## New Features (v1.1)

### Admin Panel
- **Role-based Access Control:** Admin users can access special pages and controls
- **User Management:** View all users, their map counts, and alert types
- **System Configuration:** Dynamic configuration of limits and settings
- **Daily Overview:** 5-day summary of notification processing with detailed breakdowns

### Driver Notifications
- **Efficient Position Checking:** Uses optimized API to check multiple maps per request
- **Smart Processing:** Only fetches full leaderboards when positions change
- **Increased Limits:** Support for up to 200 driver notifications per user

### Smart Alert System
- **Accurate vs Inaccurate Modes:** Automatic switching for users with many maps
- **Position Tracking:** Efficient checking for new players on maps
- **Popular Map Protection:** Truncated notifications for maps with >20 new records

### Notification History
- **5-Day History:** Users can view their notification status for the last 5 days
- **Status Tracking:** Shows sent, no new times, or technical error status
- **Admin Monitoring:** Comprehensive daily job overview with user breakdowns

### Performance Optimizations
- **Two-Phase Processing:** Separate map alerts and driver notifications for efficiency
- **DynamoDB Caching:** Cached leaderboard data reduces API calls
- **Sequential Processing:** Respects TrackMania API rate limits (2 req/sec)
- **CSS Optimization:** Hybrid approach with utility classes and CSS for better performance
