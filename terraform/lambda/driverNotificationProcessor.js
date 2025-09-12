// lambda/driverNotificationProcessor.js
const { Client } = require('pg');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const apiClient = require('./shared/apiClient');
const accountNames = require('./accountNames');

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

exports.handler = async (event, context) => {
    console.log('🔄 Driver Notification Processor Lambda triggered!', event);

    try {
        // Process messages from SQS
        const messages = await receiveMessages();

        for (const message of messages) {
            try {
                await processDriverNotificationJob(message);
                await deleteMessage(message.ReceiptHandle);
            } catch (error) {
                console.error('Error processing message:', error);
                // Message will be retried by SQS
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Processed ${messages.length} driver notification jobs`,
                processedMessages: messages.length
            })
        };

    } catch (error) {
        console.error('Driver notification processor error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};

// Receive messages from SQS
async function receiveMessages() {
    const params = {
        QueueUrl: process.env.DRIVER_NOTIFICATION_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20
    };

    try {
        const result = await sqsClient.send(new ReceiveMessageCommand(params));
        return result.Messages || [];
    } catch (error) {
        console.error('Error receiving messages from SQS:', error);
        return [];
    }
}

// Delete message from SQS after processing
async function deleteMessage(receiptHandle) {
    const params = {
        QueueUrl: process.env.DRIVER_NOTIFICATION_QUEUE_URL,
        ReceiptHandle: receiptHandle
    };

    try {
        await sqsClient.send(new DeleteMessageCommand(params));
        console.log('✅ Message deleted from SQS');
    } catch (error) {
        console.error('Error deleting message from SQS:', error);
    }
}

// Process a single driver notification job
async function processDriverNotificationJob(message) {
    console.log('🔄 Processing driver notification job:', message.MessageId);

    try {
        const jobData = JSON.parse(message.Body);
        const { jobId } = jobData;

        // Update job status to processing
        await updateJobStatus(jobId, 'processing');

        // Process all active driver notifications
        const notifications = await getActiveDriverNotifications();
        console.log(`📊 Found ${notifications.length} active driver notifications to process`);

        let processedCount = 0;
        let notificationCount = 0;

        for (const notification of notifications) {
            try {
                const result = await processDriverNotification(notification);
                if (result.notificationSent) {
                    notificationCount++;
                }
                processedCount++;
            } catch (error) {
                console.error(`Error processing notification ${notification.id}:`, error);
            }
        }

        // Update job status to completed
        await updateJobStatus(jobId, 'completed', {
            processedNotifications: processedCount,
            notificationsSent: notificationCount
        });

        console.log(`✅ Driver notification job completed: ${processedCount} processed, ${notificationCount} notifications sent`);

    } catch (error) {
        console.error('Error processing driver notification job:', error);
        throw error;
    }
}

// Get all active driver notifications
async function getActiveDriverNotifications() {
    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        const result = await client.query(
            'SELECT dn.*, u.username FROM driver_notifications dn JOIN users u ON dn.user_id = u.id WHERE dn.is_active = TRUE ORDER BY dn.last_checked ASC'
        );

        return result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            username: row.username,
            mapUid: row.map_uid,
            mapName: row.map_name,
            currentPosition: row.current_position,
            lastChecked: row.last_checked
        }));

    } catch (error) {
        console.error('Error fetching active driver notifications:', error);
        return [];
    } finally {
        await client.end();
    }
}

// Process a single driver notification
async function processDriverNotification(notification) {
    console.log(`🔍 Processing notification ${notification.id} for user ${notification.username} on map ${notification.mapUid}`);

    try {
        // Get current leaderboard for the map
        const leaderboardData = await getMapLeaderboard(notification.mapUid);

        if (!leaderboardData || !Array.isArray(leaderboardData)) {
            console.warn(`No leaderboard data for map ${notification.mapUid}`);
            await updateNotificationLastChecked(notification.id);
            return { notificationSent: false, reason: 'No leaderboard data' };
        }

        // Find user's current position
        const currentPosition = await findUserPosition(leaderboardData, notification.username);

        if (!currentPosition) {
            console.warn(`User ${notification.username} not found in leaderboard for map ${notification.mapUid}`);
            await updateNotificationLastChecked(notification.id);
            return { notificationSent: false, reason: 'User not in leaderboard' };
        }

        // Check if position has changed (worsened)
        if (currentPosition > notification.currentPosition) {
            console.log(`📧 Position worsened for user ${notification.username}: ${notification.currentPosition} -> ${currentPosition}`);

            // Update position in database
            await updateNotificationPosition(notification.id, currentPosition);

            // Send notification (placeholder - implement email sending)
            await sendPositionNotification(notification, notification.currentPosition, currentPosition);

            return { notificationSent: true, oldPosition: notification.currentPosition, newPosition: currentPosition };
        } else {
            console.log(`✅ Position unchanged for user ${notification.username}: ${currentPosition}`);
            await updateNotificationLastChecked(notification.id);
            return { notificationSent: false, reason: 'Position unchanged' };
        }

    } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);
        throw error;
    }
}

// Get leaderboard data for a map
async function getMapLeaderboard(mapUid) {
    try {
        const baseUrl = process.env.LEAD_API;
        const url = `${baseUrl}/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;

        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching leaderboard for map ${mapUid}:`, error);
        return null;
    }
}

// Find user's position in leaderboard
async function findUserPosition(leaderboardData, username) {
    try {
        for (const group of leaderboardData) {
            if (group.tops && Array.isArray(group.tops)) {
                for (let i = 0; i < group.tops.length; i++) {
                    const record = group.tops[i];
                    if (record.accountId) {
                        // Get display name for this account
                        try {
                            const accountNamesResult = await accountNames.translateAccountNames([record.accountId]);
                            const displayName = accountNamesResult[record.accountId];

                            if (displayName && displayName.toLowerCase() === username.toLowerCase()) {
                                return i + 1; // Position is 1-based
                            }
                        } catch (error) {
                            console.warn(`Failed to get display name for account ${record.accountId}:`, error.message);
                        }
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Error finding user position:', error);
        return null;
    }
}

// Update notification last checked timestamp
async function updateNotificationLastChecked(notificationId) {
    const client = getDbConnection();

    try {
        await client.connect();
        await client.query(
            'UPDATE driver_notifications SET last_checked = NOW() WHERE id = $1',
            [notificationId]
        );
    } catch (error) {
        console.error('Error updating notification last checked:', error);
    } finally {
        await client.end();
    }
}

// Update notification position
async function updateNotificationPosition(notificationId, newPosition) {
    const client = getDbConnection();

    try {
        await client.connect();
        await client.query(
            'UPDATE driver_notifications SET current_position = $1, last_checked = NOW() WHERE id = $2',
            [newPosition, notificationId]
        );
    } catch (error) {
        console.error('Error updating notification position:', error);
    } finally {
        await client.end();
    }
}

// Send position notification (placeholder)
async function sendPositionNotification(notification, oldPosition, newPosition) {
    console.log(`📧 Sending notification to user ${notification.username}: Position on ${notification.mapName} changed from ${oldPosition} to ${newPosition}`);

    // TODO: Implement actual email notification
    // This would integrate with your existing email service
    // For now, just log the notification
}

// Update job status in DynamoDB
async function updateJobStatus(jobId, status, metadata = {}) {
    const params = {
        TableName: process.env.DRIVER_NOTIFICATION_JOBS_TABLE_NAME,
        Key: marshall({ job_id: jobId }),
        UpdateExpression: 'SET #status = :status, updated_at = :updated_at, #metadata = :metadata',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#metadata': 'metadata'
        },
        ExpressionAttributeValues: marshall({
            ':status': status,
            ':updated_at': Date.now(),
            ':metadata': metadata
        })
    };

    try {
        await dynamoClient.send(new PutItemCommand(params));
        console.log(`✅ Job ${jobId} status updated to ${status}`);
    } catch (error) {
        console.error('Error updating job status:', error);
    }
}
