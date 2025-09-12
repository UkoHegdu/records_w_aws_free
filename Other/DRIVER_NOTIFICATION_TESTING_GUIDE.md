# Driver Notification Testing Guide

This guide provides comprehensive testing strategies for the driver notification system without requiring actual top 5 positions in Trackmania.

## 🎯 Testing Objectives

1. **Verify notification logic** - Test position change detection and notification triggering
2. **Test email composition** - Ensure mapper alerts and driver notifications combine correctly
3. **Validate complete workflow** - Test the entire system from API to email delivery
4. **Performance testing** - Ensure system handles multiple notifications efficiently

## 🧪 Testing Strategies

### Strategy 1: Mock Data Testing (Recommended)

Use mock leaderboard data to simulate position changes without driving actual top times.

**Advantages:**
- No need to achieve top 5 positions
- Controlled test scenarios
- Repeatable results
- Fast execution

**Implementation:**
```javascript
// Mock leaderboard data for testing
const mockLeaderboardData = {
    "test_map_position_3": {
        tops: [{
            top: [
                { accountId: "account1", position: 1, score: 45000 },
                { accountId: "account2", position: 2, score: 46000 },
                { accountId: "test_user_account", position: 3, score: 47000 },
                { accountId: "account4", position: 4, score: 48000 },
                { accountId: "account5", position: 5, score: 49000 }
            ]
        }]
    }
};
```

### Strategy 2: Database Manipulation Testing

Directly modify database records to simulate position changes.

**Advantages:**
- Tests actual database operations
- Validates data integrity
- Tests real notification logic

**Implementation:**
```sql
-- Update notification position to simulate change
UPDATE driver_notifications 
SET current_position = 4, last_checked = NOW() 
WHERE id = 123;
```

### Strategy 3: API Endpoint Testing

Test the REST API endpoints with mock data.

**Advantages:**
- Tests complete API flow
- Validates authentication
- Tests error handling

**Implementation:**
```bash
# Test creating notification
curl -X POST https://your-api.com/api/v1/driver/notifications \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{"mapUid": "test_map_001", "mapName": "Test Map"}'
```

## 📧 Email Composition Testing

### Test Scenarios

1. **Mapper Alerts Only**
   - User has mapper alerts but no driver notifications
   - Verify only mapper section appears

2. **Driver Notifications Only**
   - User has driver notifications but no mapper alerts
   - Verify only driver section appears

3. **Both Types Present**
   - User has both mapper alerts and driver notifications
   - Verify both sections appear correctly

4. **No Notifications**
   - User has no notifications for the day
   - Verify appropriate "no notifications" message

### Email Format Validation

```javascript
// Expected email format
const expectedEmailFormat = `
🎯 MAPPER ALERTS
New times have been driven on your map(s):

🗺️ Map: Speed Circuit
  🏎️ Player: FastDriver1
  📍 Zone: Zone 1
  🥇 Position: 1
  📅 Date: 2024-01-15 10:30:00

🏎️ DRIVER NOTIFICATIONS
Your position has changed on the following maps:

🏎️ Map: Racing Challenge
📍 Position changed: #3 → #4
📅 Detected: 2024-01-15 10:30:00

---
Trackmania Record Tracker
Visit: https://your-domain.com
`;
```

## 🔄 Complete Workflow Testing

### Test Steps

1. **Setup Test Data**
   - Create test user with Trackmania username
   - Create test driver notification
   - Create test mapper alert

2. **Test Scheduler**
   - Send message to scheduler queue
   - Verify mapper content is added to email body

3. **Test Driver Processor**
   - Send message to driver notification queue
   - Verify driver content is added to email body

4. **Test Email Sender**
   - Verify complete email is composed
   - Test email delivery (in test mode)

5. **Cleanup**
   - Remove test data
   - Verify no side effects

## 🚀 Running Tests

### Option 1: Individual Test Files

```bash
# Test driver notification logic
node lambda/testDriverNotifications.js

# Test email composition
node lambda/testEmailComposition.js

# Test complete integration
node lambda/testDriverNotificationIntegration.js
```

### Option 2: Test Runner Script

```bash
# Run the interactive test script
./testDriverNotifications.sh
```

### Option 3: Lambda Function Testing

Deploy test functions and invoke them:

```bash
# Deploy test functions
./deploy.sh

# Invoke test functions
aws lambda invoke --function-name test-driver-notifications response.json
```

## 📊 Test Scenarios

### Position Change Scenarios

1. **Position Worsening (3 → 4)**
   - Should trigger notification
   - Should update database
   - Should add to email body

2. **Fall Out of Top 5 (4 → 6)**
   - Should trigger notification
   - Should deactivate notification
   - Should add to email body

3. **Position Improvement (4 → 3)**
   - Should NOT trigger notification
   - Should update database
   - Should NOT add to email body

4. **No Position Change**
   - Should NOT trigger notification
   - Should update last_checked timestamp

### Error Scenarios

1. **Invalid Map UID**
   - Should return 400 error
   - Should not create notification

2. **User Not in Top 5**
   - Should return 400 error
   - Should not create notification

3. **Missing Trackmania Username**
   - Should return 400 error
   - Should not create notification

4. **Rate Limiting**
   - Should return 429 error after 5 attempts
   - Should prevent spam

## 🔍 Monitoring and Validation

### CloudWatch Logs

Monitor Lambda function logs for:
- Successful notification processing
- Error handling
- Performance metrics

### Database Validation

Check database for:
- Correct position updates
- Proper status changes
- Timestamp updates

### Email Validation

Verify email content:
- Correct formatting
- Both sections present when applicable
- Proper timestamps
- No duplicate content

## 🛠️ Troubleshooting

### Common Issues

1. **Test Data Not Found**
   - Ensure test user exists in database
   - Verify test notification was created
   - Check database connections

2. **Email Not Composed**
   - Verify DynamoDB table exists
   - Check IAM permissions
   - Validate data format

3. **SQS Messages Not Processed**
   - Check queue permissions
   - Verify message format
   - Monitor dead letter queues

### Debug Commands

```bash
# Check database connection
psql $NEON_DB_CONNECTION_STRING -c "SELECT COUNT(*) FROM driver_notifications;"

# Check DynamoDB table
aws dynamodb scan --table-name daily-emails --limit 5

# Check SQS queue
aws sqs get-queue-attributes --queue-url $DRIVER_NOTIFICATION_QUEUE_URL
```

## 📈 Performance Testing

### Load Testing

Test with multiple notifications:
- 10 notifications per user
- 100 users with notifications
- Concurrent processing

### Monitoring Metrics

- Processing time per notification
- Database query performance
- SQS message processing rate
- Email composition time

## ✅ Success Criteria

Tests are successful when:

1. **Logic Tests Pass**
   - Position changes detected correctly
   - Notifications triggered appropriately
   - Database updated properly

2. **Email Tests Pass**
   - Email composed correctly
   - Both sections present when applicable
   - Formatting is correct

3. **Integration Tests Pass**
   - Complete workflow executes
   - No errors in logs
   - Test data cleaned up

4. **Performance Tests Pass**
   - Processing time acceptable
   - No memory leaks
   - Scalable to expected load

## 🔧 Customization

### Adding New Test Scenarios

1. Add scenario to test data
2. Update test logic
3. Add validation checks
4. Update documentation

### Modifying Test Data

Update mock data in test files:
- Leaderboard positions
- User accounts
- Map information
- Timestamps

This comprehensive testing approach ensures the driver notification system works correctly without requiring actual top 5 positions in Trackmania.
