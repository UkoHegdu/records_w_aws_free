# Resource Consumption Audit

This document identifies potential areas where users could increase resource usage and cause costs to exceed AWS free tier limits.

## Critical Issues

### 1. ⚠️ In-Memory Rate Limiting (HIGH PRIORITY)

**Issue**: Rate limiting uses in-memory `Map` objects that reset between Lambda invocations.

**Location**: 
- `terraform/lambda/securityUtils.js` (lines 75-100)
- `terraform/lambda/mapSearch.js` (lines 130-157)
- `terraform/lambda/mapSearchDriver.js` (lines 6-33)

**Impact**: 
- Rate limits can be bypassed by waiting for Lambda cold starts
- Multiple concurrent Lambda instances each have their own rate limit counters
- Users can make unlimited requests by triggering new Lambda instances

**Recommendation**: 
- Implement DynamoDB-based rate limiting with TTL (as mentioned in `CODE_GUIDELINES.md`)
- Use API Gateway throttling as a first line of defense
- Consider using AWS WAF for additional protection

**Cost Impact**: High - Could lead to excessive Lambda invocations and API calls

---

### 2. ⚠️ Frontend Polling (MEDIUM PRIORITY)

**Issue**: Frontend polls job status every 3 seconds, up to 60 times (3 minutes) per search.

**Location**: `frontend/src/pages/MapperNews.tsx` (lines 81-198)

**Impact**:
- Each map search triggers ~20 status check requests (60 attempts × 3 seconds)
- Multiple users searching simultaneously multiplies requests
- No rate limiting on status check endpoint (`checkJobStatus.js`)

**Recommendation**:
- Add rate limiting to `checkJobStatus.js` endpoint
- Increase polling interval to 5-10 seconds
- Implement exponential backoff
- Add server-sent events (SSE) or WebSockets for real-time updates instead of polling

**Cost Impact**: Medium - Increases Lambda invocations and API Gateway requests

---

### 3. ⚠️ No Hard Limits on Total Resources Per User (HIGH PRIORITY)

**Issue**: While there are rate limits on creation, users can accumulate unlimited:
- Alerts (only 10 per 5 minutes creation limit)
- Driver notifications (only 5 per 5 minutes creation limit, but max 200 total)
- Map searches (only 2 per minute, but no total limit)

**Location**: 
- `terraform/lambda/create_alert.js` - No check for total alerts per user
- `terraform/lambda/driverNotifications.js` - Has max 200 limit check (line 256-270)
- `terraform/lambda/mapSearch.js` - No total limit

**Impact**:
- Users can create many alerts/notifications over time
- Daily scheduler processes all alerts/notifications, increasing costs
- No cleanup of old/inactive resources

**Recommendation**:
- Add database checks for total alerts per user (e.g., max 5 alerts)
- Enforce the 200 driver notification limit at creation time
- Add cleanup job for inactive alerts/notifications
- Consider limiting total map searches per user per day

**Cost Impact**: High - Daily scheduler costs scale with number of alerts/notifications

---

### 4. ⚠️ Map Search Can Trigger Many API Calls (MEDIUM PRIORITY)

**Issue**: Map search can fetch unlimited maps and make many API calls to Trackmania API.

**Location**: 
- `terraform/lambda/mapSearchBackground.js` (lines 74-116) - Pagination loop with no iteration limit
- `terraform/lambda/mapSearch.js` - No limit on number of maps to process

**Impact**:
- Users with many maps (e.g., 1000+ maps) trigger hundreds of API calls
- Each map requires leaderboard API call
- No timeout or iteration limit on pagination loop

**Recommendation**:
- Add `MAX_ITERATIONS` limit to pagination loop (as per `CODE_GUIDELINES.md`)
- Limit total maps processed per search (e.g., first 500 maps)
- Add timeout to map search operation
- Cache map lists to reduce API calls

**Cost Impact**: Medium-High - External API calls and Lambda execution time

---

### 5. ⚠️ No API Gateway Throttling (HIGH PRIORITY)

**Issue**: No API Gateway-level throttling configured.

**Location**: `terraform/api-gateway.tf`

**Impact**:
- Application-level rate limiting can be bypassed (see issue #1)
- No protection against DDoS or coordinated attacks
- All requests reach Lambda functions

**Recommendation**:
- Add API Gateway throttling (e.g., 100 requests/second per account)
- Configure burst limits
- Add usage plans with API keys for authenticated endpoints
- Consider AWS WAF for additional protection

**Cost Impact**: High - First line of defense against abuse

---

### 6. ⚠️ Scheduled Jobs Scale with Users (MEDIUM PRIORITY)

**Issue**: Daily scheduler processes all users' alerts and notifications.

**Location**: 
- `terraform/lambda/scheduler.js` - Queues all users
- `terraform/lambda/schedulerProcessor.js` - Processes each user sequentially

**Impact**:
- Costs scale linearly with number of users
- Each user triggers multiple API calls
- No limit on total processing time

**Recommendation**:
- Add user limit check (enforce `max_users_registration` from admin config)
- Monitor scheduler execution time and costs
- Consider batching users more efficiently
- Add circuit breaker if costs exceed threshold

**Cost Impact**: Medium - Daily fixed cost that scales with users

---

### 7. ⚠️ No Limits on Database Query Results (LOW PRIORITY)

**Issue**: Database queries can return unlimited results.

**Location**: Various Lambda functions

**Examples**:
- `getAdminUsers.js` - No LIMIT on user query
- `getFeedback.js` - Has LIMIT 100 (good)
- `getNotificationHistory.js` - No explicit limit

**Impact**:
- Large result sets increase Lambda memory usage
- Higher database query costs
- Slower response times

**Recommendation**:
- Add LIMIT clauses to all queries
- Implement pagination for large result sets
- Add query result size validation

**Cost Impact**: Low - But good practice

---

### 8. ⚠️ DynamoDB Write Operations (MEDIUM PRIORITY)

**Issue**: No limits on DynamoDB write operations.

**Location**: 
- `terraform/lambda/mapSearchBackground.js` - Writes job status
- `terraform/lambda/schedulerProcessor.js` - Writes cache data
- Various functions write to DynamoDB tables

**Impact**:
- Each map search writes job status
- Cache writes for each map processed
- No TTL cleanup on some tables

**Recommendation**:
- Ensure all DynamoDB items have TTL set
- Monitor DynamoDB write units
- Consider batching writes where possible

**Cost Impact**: Medium - DynamoDB free tier: 25 WCU (write capacity units) per second

---

### 9. ⚠️ SQS Queue Accumulation (LOW PRIORITY)

**Issue**: SQS queues could accumulate messages if processing is slow.

**Location**: 
- `terraform/main.tf` - SQS queue configurations
- Queue visibility timeout: 960 seconds (16 minutes)

**Impact**:
- Messages accumulate if Lambda functions fail or timeout
- Dead letter queues could grow
- Storage costs for queued messages

**Recommendation**:
- Monitor SQS queue depth
- Set up CloudWatch alarms for queue depth
- Ensure dead letter queues are monitored
- Consider message retention period limits

**Cost Impact**: Low - But should be monitored

---

### 10. ⚠️ No Request Size Limits (LOW PRIORITY)

**Issue**: Some endpoints don't validate request body size.

**Location**: Various Lambda functions

**Impact**:
- Large request bodies increase Lambda memory usage
- Higher costs for Lambda execution
- Potential for DoS via large payloads

**Recommendation**:
- Add request body size validation (1MB limit as per `CODE_GUIDELINES.md`)
- Configure API Gateway request size limits
- Validate all JSON parsing operations

**Cost Impact**: Low - But good security practice

---

## Summary of Recommendations by Priority

### High Priority (Implement First)
1. **Implement DynamoDB-based rate limiting** - Replace in-memory rate limiting
2. **Add API Gateway throttling** - First line of defense
3. **Add hard limits on total resources per user** - Prevent accumulation
4. **Add iteration limits to loops** - Prevent infinite loops

### Medium Priority
5. **Optimize frontend polling** - Reduce request frequency
6. **Add limits to map search operations** - Prevent excessive API calls
7. **Monitor and limit scheduled job costs** - Control daily processing costs
8. **Add DynamoDB write operation monitoring** - Track usage

### Low Priority
9. **Add database query limits** - Good practice
10. **Monitor SQS queue depth** - Prevent accumulation
11. **Add request size validation** - Security best practice

---

## AWS Free Tier Limits Reference

### Lambda
- **1M free requests per month**
- **400,000 GB-seconds compute time per month**

### API Gateway
- **1M API calls per month** (REST APIs)

### DynamoDB
- **25 WCU and 25 RCU** (write/read capacity units)
- **25 GB storage**

### SQS
- **1M requests per month**

### CloudWatch
- **10 custom metrics**
- **5 GB log ingestion**
- **10 alarms**

### S3
- **5 GB storage**
- **20,000 GET requests**
- **2,000 PUT requests**

---

## Cost Estimation Scenarios

### Scenario 1: Normal Usage (10 users)
- 10 users × 2 map searches/day = 20 searches/day = 600/month
- 10 users × 1 alert each = 10 alerts processed daily
- Estimated cost: **Within free tier**

### Scenario 2: Moderate Abuse (100 users, some abuse)
- 100 users × 5 map searches/day = 500 searches/day = 15,000/month
- 100 users × 2 alerts each = 200 alerts processed daily
- Estimated cost: **May exceed free tier** (Lambda requests)

### Scenario 3: Severe Abuse (Coordinated attack)
- 1000 requests/minute = 1.44M requests/day = 43.2M/month
- Estimated cost: **Significantly exceeds free tier**

---

## Monitoring Recommendations

1. **Set up CloudWatch alarms for**:
   - Lambda invocation count (alert at 500K/month)
   - API Gateway request count (alert at 500K/month)
   - DynamoDB read/write units (alert at 20 WCU/RCU)
   - SQS queue depth (alert at 1000 messages)

2. **Create cost alerts in AWS Billing**:
   - Alert at $1/month
   - Alert at $5/month
   - Alert at $10/month

3. **Monitor daily**:
   - Lambda invocation trends
   - API Gateway request trends
   - User registration count
   - Total alerts/notifications count

---

## Implementation Checklist

- [ ] Implement DynamoDB-based rate limiting
- [ ] Add API Gateway throttling
- [ ] Add hard limits on total alerts per user
- [ ] Add iteration limits to all loops
- [ ] Optimize frontend polling
- [ ] Add limits to map search operations
- [ ] Set up CloudWatch alarms
- [ ] Set up AWS Billing alerts
- [ ] Add database query limits
- [ ] Monitor SQS queue depth
- [ ] Add request size validation

---

*Last updated: 2025-01-XX*


