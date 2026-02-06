# Severe Abuse Analysis & Mitigation

## 1. Where the Distinction is Made

The distinction between how user map records are fetched is made in **`terraform/lambda/schedulerProcessor.js`** in the `processMapAlertCheck()` function.

### Location: `terraform/lambda/schedulerProcessor.js` (lines 236-291)

**Threshold**: 200 maps (configurable via `MAX_MAPS_PER_USER` environment variable)

**Two Modes**:

1. **Accurate Mode** (users with ≤200 maps):
   - **Location**: Lines 262-278
   - **Method**: Uses `fetchMapsAndLeaderboards(username, '1d')` 
   - **What it does**: Fetches **full leaderboards** for each map from Trackmania API
   - **API Calls**: 1 API call per map (can be 1-200+ calls per user)
   - **Cost**: High - each map requires a full leaderboard fetch

2. **Inaccurate Mode** (users with >200 maps):
   - **Location**: Lines 280-290
   - **Method**: Uses `processInaccurateMode(username, client)` which calls `checkMapPositions()`
   - **What it does**: Uses position API (`https://webservices.openplanet.dev/live/leaderboards/position`) to check if new players appeared
   - **API Calls**: Batched - up to 50 maps per API call
   - **Cost**: Low - efficient batching, only checks positions, not full leaderboards

**Auto-switching**: Lines 239-257 automatically switch users from accurate to inaccurate mode if they exceed the limit.

---

## 2. Severe Abuse Scenarios & Mitigation

### 🔴 **Scenario 1: Coordinated Rate Limit Bypass**

**Attack Vector**:
- Multiple users coordinate to bypass in-memory rate limiting
- Each user triggers new Lambda instances with fresh rate limit counters
- Can make unlimited requests by exploiting Lambda cold starts

**Current Protection**:
- ❌ In-memory rate limiting (resets between invocations)
- ❌ No API Gateway throttling
- ✅ Some per-user rate limits (but bypassable)

**Impact**:
- **Lambda**: Could exceed 1M free requests/month
- **API Gateway**: Could exceed 1M free requests/month
- **Cost**: $0.20 per 1M Lambda requests, $3.50 per 1M API Gateway requests

**Mitigation**:
1. **Implement DynamoDB-based rate limiting** (HIGH PRIORITY)
   - Store rate limit counters in DynamoDB with TTL
   - Use atomic increment operations
   - Check limits before processing
   - Example: `rate_limit:user_id:endpoint` with TTL

2. **Add API Gateway throttling** (HIGH PRIORITY)
   - Configure throttling: 100 requests/second per account
   - Burst limit: 200 requests
   - This is the first line of defense

3. **Add AWS WAF** (MEDIUM PRIORITY)
   - Rate-based rules: Block IPs making >2000 requests in 5 minutes
   - Geographic restrictions if needed
   - IP reputation filtering

---

### 🔴 **Scenario 2: Map Search Abuse**

**Attack Vector**:
- User searches for mappers with 1000+ maps
- Each search triggers background job that fetches full leaderboards for all maps
- No iteration limit on pagination loop (line 88 in `mapSearchBackground.js`)
- Can create unlimited search jobs

**Current Protection**:
- ✅ Rate limit: 2 searches per minute per user (but in-memory, bypassable)
- ❌ No total limit on maps processed
- ❌ No iteration limit on pagination loop
- ❌ No timeout on map search operation

**Impact**:
- **Lambda**: 15-minute timeout × many concurrent searches = high compute time
- **External API**: Hundreds of API calls per search
- **DynamoDB**: Many job status writes
- **Cost**: Could exceed 400K GB-seconds free tier

**Mitigation**:
1. **Add iteration limit to pagination loop** (HIGH PRIORITY)
   ```javascript
   let iterationCount = 0;
   const MAX_ITERATIONS = 100; // Limit to 100 pages
   while (hasMore && iterationCount < MAX_ITERATIONS) {
       iterationCount++;
       // ... existing code
   }
   ```

2. **Limit total maps processed per search** (HIGH PRIORITY)
   - Cap at first 500 maps
   - Return message: "Showing first 500 maps. Please narrow your search."

3. **Add timeout to map search** (MEDIUM PRIORITY)
   - Fail job if processing takes >10 minutes
   - Return partial results

4. **Enforce rate limiting on job status checks** (MEDIUM PRIORITY)
   - Frontend polls every 3 seconds
   - Add rate limit: 10 status checks per minute per job

---

### 🔴 **Scenario 3: Alert Accumulation Abuse**

**Attack Vector**:
- User creates alerts slowly over time (respecting 10 per 5 minutes limit)
- Accumulates 50+ alerts
- Each alert processed daily in scheduler
- No hard limit on total alerts per user

**Current Protection**:
- ✅ Rate limit: 10 alerts per 5 minutes (but bypassable)
- ✅ Auto-switch to inaccurate mode if >200 maps
- ❌ No limit on total alerts per user
- ❌ No cleanup of old/inactive alerts

**Impact**:
- **Daily scheduler**: Processes all alerts for all users
- **API calls**: Each alert triggers API calls (accurate mode) or position checks (inaccurate mode)
- **Cost**: Scales linearly with number of alerts
- **Example**: 100 users × 10 alerts each = 1000 alerts processed daily

**Mitigation**:
1. **Add hard limit on total alerts per user** (HIGH PRIORITY)
   ```javascript
   // In create_alert.js
   const MAX_ALERTS_PER_USER = 5;
   const existingAlerts = await client.query(
       'SELECT COUNT(*) FROM alerts WHERE user_id = $1',
       [userId]
   );
   if (existingAlerts.rows[0].count >= MAX_ALERTS_PER_USER) {
       return { statusCode: 400, ... };
   }
   ```

2. **Add alert cleanup job** (MEDIUM PRIORITY)
   - Remove alerts with no activity for 90 days
   - Archive old alerts instead of deleting

3. **Monitor total alerts in system** (MEDIUM PRIORITY)
   - CloudWatch metric: Total alerts count
   - Alert if >1000 alerts total

---

### 🔴 **Scenario 4: Driver Notification Abuse**

**Attack Vector**:
- User creates 200 driver notifications (current max)
- Each notification checked daily
- Position API called for all notifications
- No limit on how many users can have max notifications

**Current Protection**:
- ✅ Hard limit: 200 driver notifications per user (enforced)
- ✅ Rate limit: 5 per 5 minutes (but bypassable)
- ✅ Efficient batching: 50 maps per API call

**Impact**:
- **API calls**: 200 notifications ÷ 50 per batch = 4 API calls per user
- **Cost**: Moderate - batching is efficient
- **Scale**: 100 users × 200 notifications = 20,000 notifications processed daily

**Mitigation**:
1. **Reduce max driver notifications** (LOW PRIORITY)
   - Consider reducing from 200 to 100
   - Or make it configurable per user tier

2. **Add global limit on total notifications** (MEDIUM PRIORITY)
   - Limit total notifications across all users
   - Example: Max 10,000 total notifications

3. **Monitor notification processing time** (MEDIUM PRIORITY)
   - Alert if daily processing takes >30 minutes

---

### 🔴 **Scenario 5: Frontend Polling Abuse**

**Attack Vector**:
- User opens multiple browser tabs
- Each tab polls job status every 3 seconds
- 10 tabs × 20 polls each = 200 requests per search
- No rate limiting on status check endpoint

**Current Protection**:
- ✅ Frontend prevents multiple simultaneous searches
- ❌ No rate limiting on `checkJobStatus.js`
- ❌ No limit on number of tabs/windows

**Impact**:
- **API Gateway**: 200 requests per search × many users
- **Lambda**: Status checks are cheap but add up
- **Cost**: Could exceed 1M API Gateway requests/month

**Mitigation**:
1. **Add rate limiting to status check endpoint** (HIGH PRIORITY)
   ```javascript
   // In checkJobStatus.js
   if (!checkRateLimit(`job_status:${jobId}`, 20, 60000)) {
       return { statusCode: 429, ... };
   }
   ```

2. **Increase polling interval** (MEDIUM PRIORITY)
   - Change from 3 seconds to 5-10 seconds
   - Reduces requests by 50-70%

3. **Implement exponential backoff** (MEDIUM PRIORITY)
   - Start at 3 seconds, increase to 10 seconds after 10 attempts

---

### 🔴 **Scenario 6: Registration Spam**

**Attack Vector**:
- Automated registration of many accounts
- Each account can create alerts/notifications
- No verification required
- Rate limit: 3 registrations per 5 minutes per IP (bypassable)

**Current Protection**:
- ✅ Rate limit: 3 registrations per 5 minutes (but in-memory, bypassable)
- ✅ Config limit: `max_users_registration` = 100 (but not enforced)
- ❌ No email verification
- ❌ No CAPTCHA

**Impact**:
- **Database**: Many user accounts
- **Daily scheduler**: Processes all users
- **Cost**: Scales with number of users

**Mitigation**:
1. **Enforce user registration limit** (HIGH PRIORITY)
   ```javascript
   // In register.js
   const maxUsers = parseInt(process.env.MAX_USERS_REGISTRATION || '100');
   const userCount = await client.query('SELECT COUNT(*) FROM users');
   if (userCount.rows[0].count >= maxUsers) {
       return { statusCode: 403, ... };
   }
   ```

2. **Add email verification** (MEDIUM PRIORITY)
   - Require email verification before account activation
   - Prevents automated account creation

3. **Add CAPTCHA** (MEDIUM PRIORITY)
   - Google reCAPTCHA on registration form
   - Prevents bot registrations

---

### 🔴 **Scenario 7: Scheduler Processing Abuse**

**Attack Vector**:
- Many users with many alerts/notifications
- Daily scheduler processes all users sequentially
- No limit on total processing time
- Could exceed Lambda 15-minute timeout

**Current Protection**:
- ✅ Reserved concurrency: 1 (sequential processing)
- ✅ Batch size: 1 (one user at a time)
- ❌ No limit on total users processed
- ❌ No circuit breaker

**Impact**:
- **Lambda**: Long execution times (up to 15 minutes)
- **Cost**: High compute time usage
- **Reliability**: Timeout risk if too many users

**Mitigation**:
1. **Add user limit check** (HIGH PRIORITY)
   - Stop processing if >100 users
   - Log warning and continue next day

2. **Add processing time monitoring** (MEDIUM PRIORITY)
   - CloudWatch metric: Scheduler execution time
   - Alert if >10 minutes

3. **Implement circuit breaker** (MEDIUM PRIORITY)
   - Stop processing if errors exceed threshold
   - Resume after cooldown period

---

## Summary: Priority Mitigations

### Critical (Implement Immediately)
1. ✅ **DynamoDB-based rate limiting** - Replace in-memory rate limiting
2. ✅ **API Gateway throttling** - First line of defense (100 req/sec)
3. ✅ **Hard limit on total alerts per user** - Max 5 alerts
4. ✅ **Iteration limit on pagination loops** - Max 100 iterations
5. ✅ **Limit maps processed per search** - Max 500 maps

### High Priority
6. ✅ **Rate limiting on status check endpoint** - 20 requests/minute
7. ✅ **Enforce user registration limit** - Max 100 users
8. ✅ **Add timeout to map search** - 10 minute timeout

### Medium Priority
9. ⚠️ **Increase frontend polling interval** - 5-10 seconds
10. ⚠️ **Monitor scheduler processing time** - Alert if >10 minutes
11. ⚠️ **Add email verification** - Prevent bot registrations
12. ⚠️ **Add CAPTCHA** - Additional bot protection

---

## Cost Impact Estimates

### Current Free Tier Limits
- **Lambda**: 1M requests/month, 400K GB-seconds/month
- **API Gateway**: 1M requests/month
- **DynamoDB**: 25 WCU, 25 RCU, 25 GB storage
- **SQS**: 1M requests/month

### Abuse Scenarios Cost

**Scenario 1 (Rate Limit Bypass)**:
- 10M requests/month = $1.80 (Lambda) + $31.50 (API Gateway) = **$33.30/month**

**Scenario 2 (Map Search Abuse)**:
- 1000 searches × 500 maps each = 500K API calls
- 1000 searches × 15 min = 15K minutes = 900K GB-seconds = **$0.20/month**

**Scenario 3 (Alert Accumulation)**:
- 1000 alerts × daily processing = 30K Lambda invocations/month
- Cost: **$0.006/month** (minimal)

**Combined Severe Abuse**:
- Estimated cost: **$35-50/month** if all scenarios occur simultaneously

---

## Monitoring & Alerts

### CloudWatch Alarms to Set Up

1. **Lambda Invocations** (Alert at 500K/month)
2. **API Gateway Requests** (Alert at 500K/month)
3. **DynamoDB Read/Write Units** (Alert at 20 WCU/RCU)
4. **Scheduler Execution Time** (Alert if >10 minutes)
5. **Total Users Count** (Alert if >80 users)
6. **Total Alerts Count** (Alert if >500 alerts)

### AWS Billing Alerts

1. Alert at $1/month
2. Alert at $5/month
3. Alert at $10/month

---

*Last updated: 2025-01-XX*


