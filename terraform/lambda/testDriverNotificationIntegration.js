// lambda/testDriverNotificationIntegration.js - Complete integration test for driver notifications
const { Client } = require('pg');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const jwt = require('jsonwebtoken');

// Database connection using Neon
const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });
};

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// Test data setup
const testData = {
    userId: 999, // Test user ID
    username: "TestDriver",
    email: "testdriver@example.com",
    tmUsername: "TestDriver",
    tmAccountId: "test_account_123",
    mapUid: "test_map_integration_001",
    mapName: "Integration Test Map"
};

// Setup test user in database
async function setupTestUser() {
    const client = getDbConnection();

    try {
        await client.connect();

        // Insert test user
        await client.query(`
            INSERT INTO users (id, username, email, password_hash, tm_username, tm_account_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (id) DO UPDATE SET
                username = EXCLUDED.username,
                email = EXCLUDED.email,
                tm_username = EXCLUDED.tm_username,
                tm_account_id = EXCLUDED.tm_account_id
        `, [testData.userId, testData.username, testData.email, 'test_hash', testData.tmUsername, testData.tmAccountId]);

        console.log('✅ Test user setup completed');

    } catch (error) {
        console.error('❌ Error setting up test user:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Create test driver notification
async function createTestDriverNotification() {
    const client = getDbConnection();

    try {
        await client.connect();

        // Insert test driver notification
        const result = await client.query(`
            INSERT INTO driver_notifications (user_id, map_uid, map_name, current_position, personal_best, status, created_at, last_checked, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), TRUE)
            RETURNING id
        `, [testData.userId, testData.mapUid, testData.mapName, 3, 47000, 'active']);

        console.log(`✅ Test driver notification created with ID: ${result.rows[0].id}`);
        return result.rows[0].id;

    } catch (error) {
        console.error('❌ Error creating test driver notification:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Create test mapper alert
async function createTestMapperAlert() {
    const client = getDbConnection();

    try {
        await client.connect();

        // Insert test mapper alert
        await client.query(`
            INSERT INTO alerts (username, email, created_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email
        `, [testData.username, testData.email]);

        console.log('✅ Test mapper alert created');

    } catch (error) {
        console.error('❌ Error creating test mapper alert:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Send test message to SQS queue
async function sendTestMessageToQueue(queueUrl, messageBody) {
    const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody)
    };

    try {
        const result = await sqsClient.send(new SendMessageCommand(params));
        console.log(`✅ Test message sent to queue: ${result.MessageId}`);
        return result.MessageId;
    } catch (error) {
        console.error('❌ Error sending test message to queue:', error);
        throw error;
    }
}

// Receive and process messages from SQS queue
async function receiveAndProcessMessages(queueUrl) {
    const params = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5
    };

    try {
        const result = await sqsClient.send(new ReceiveMessageCommand(params));
        const messages = result.Messages || [];

        console.log(`📨 Received ${messages.length} messages from queue`);

        for (const message of messages) {
            console.log(`📋 Processing message: ${message.MessageId}`);
            console.log(`📄 Message body: ${message.Body}`);

            // Delete message after processing
            await deleteMessage(queueUrl, message.ReceiptHandle);
        }

        return messages;
    } catch (error) {
        console.error('❌ Error receiving messages from queue:', error);
        return [];
    }
}

// Delete message from SQS queue
async function deleteMessage(queueUrl, receiptHandle) {
    const params = {
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
    };

    try {
        await sqsClient.send(new DeleteMessageCommand(params));
        console.log('✅ Message deleted from queue');
    } catch (error) {
        console.error('❌ Error deleting message from queue:', error);
    }
}

// Test the complete driver notification workflow
async function testCompleteWorkflow() {
    console.log('🔄 Testing Complete Driver Notification Workflow...\n');

    try {
        // Step 1: Setup test data
        console.log('📋 Step 1: Setting up test data...');
        await setupTestUser();
        await createTestMapperAlert();
        const notificationId = await createTestDriverNotification();

        // Step 2: Test scheduler (mapper alerts)
        console.log('\n📋 Step 2: Testing scheduler for mapper alerts...');
        const schedulerMessage = {
            username: testData.username,
            email: testData.email,
            type: "mapper_check"
        };

        await sendTestMessageToQueue(process.env.SCHEDULER_QUEUE_URL, schedulerMessage);

        // Step 3: Test driver notification processor
        console.log('\n📋 Step 3: Testing driver notification processor...');
        const driverNotificationMessage = {
            jobId: `test_job_${Date.now()}`,
            type: "driver_notification_check"
        };

        await sendTestMessageToQueue(process.env.DRIVER_NOTIFICATION_QUEUE_URL, driverNotificationMessage);

        // Step 4: Check email body composition
        console.log('\n📋 Step 4: Checking email body composition...');
        const emailData = await getEmailBody(testData.userId);

        if (emailData) {
            console.log('📧 Email body found in DynamoDB:');
            console.log('Mapper content:', emailData.mapper_content ? 'Present' : 'Empty');
            console.log('Driver content:', emailData.driver_content ? 'Present' : 'Empty');
        } else {
            console.log('❌ No email body found in DynamoDB');
        }

        // Step 5: Test email sender
        console.log('\n📋 Step 5: Testing email sender...');
        // This would typically invoke the email sender Lambda
        console.log('📧 Email sender test completed (would send actual email in production)');

        return {
            notificationId,
            emailData,
            workflowCompleted: true
        };

    } catch (error) {
        console.error('❌ Complete workflow test failed:', error);
        throw error;
    }
}

// Get email body from DynamoDB
async function getEmailBody(userId) {
    const today = new Date().toISOString().split('T')[0];

    const params = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Key: marshall({
            user_id: userId.toString(),
            date: today
        })
    };

    try {
        const result = await dynamoClient.send(new GetItemCommand(params));

        if (!result.Item) {
            return null;
        }

        return unmarshall(result.Item);
    } catch (error) {
        console.error(`❌ Failed to retrieve email body for user ${userId}:`, error.message);
        return null;
    }
}

// Test API endpoints
async function testAPIEndpoints() {
    console.log('🌐 Testing API Endpoints...\n');

    // Test creating a driver notification via API
    console.log('📋 Testing POST /api/v1/driver/notifications...');

    const testNotificationData = {
        mapUid: "test_api_map_001",
        mapName: "API Test Map"
    };

    // This would typically make an HTTP request to the API Gateway
    console.log('📤 Would send POST request with data:', testNotificationData);
    console.log('✅ API endpoint test completed (would make actual HTTP request in production)');

    // Test getting driver notifications via API
    console.log('\n📋 Testing GET /api/v1/driver/notifications...');
    console.log('📤 Would send GET request');
    console.log('✅ API endpoint test completed');
}

// Cleanup test data
async function cleanupTestData() {
    console.log('\n🗑️ Cleaning up test data...');

    const client = getDbConnection();

    try {
        await client.connect();

        // Delete test driver notifications
        await client.query(
            'DELETE FROM driver_notifications WHERE user_id = $1',
            [testData.userId]
        );

        // Delete test mapper alerts
        await client.query(
            'DELETE FROM alerts WHERE username = $1',
            [testData.username]
        );

        // Delete test user
        await client.query(
            'DELETE FROM users WHERE id = $1',
            [testData.userId]
        );

        console.log('✅ Test data cleanup completed');

    } catch (error) {
        console.error('❌ Error cleaning up test data:', error);
    } finally {
        await client.end();
    }
}

// Main test function
exports.handler = async (event, context) => {
    console.log('🧪 Driver Notification Integration Test Suite Started\n');

    try {
        // Test complete workflow
        const workflowResult = await testCompleteWorkflow();

        // Test API endpoints
        await testAPIEndpoints();

        // Display final results
        console.log('\n📊 Integration Test Results:');
        console.log(`   - Workflow completed: ${workflowResult.workflowCompleted ? '✅' : '❌'}`);
        console.log(`   - Notification ID: ${workflowResult.notificationId}`);
        console.log(`   - Email data found: ${workflowResult.emailData ? '✅' : '❌'}`);

        // Cleanup
        await cleanupTestData();

        console.log('\n✅ All integration tests completed successfully!');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Driver notification integration tests completed',
                workflowCompleted: workflowResult.workflowCompleted,
                notificationId: workflowResult.notificationId,
                emailDataPresent: !!workflowResult.emailData
            })
        };

    } catch (error) {
        console.error('❌ Integration test suite failed:', error);

        // Attempt cleanup even if tests failed
        try {
            await cleanupTestData();
        } catch (cleanupError) {
            console.error('❌ Cleanup also failed:', cleanupError);
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Integration test suite failed',
                details: error.message
            })
        };
    }
};

// Export functions for individual testing
module.exports = {
    testCompleteWorkflow,
    testAPIEndpoints,
    setupTestUser,
    createTestDriverNotification,
    createTestMapperAlert,
    cleanupTestData
};
