// lambda/scheduler.js - Modified to use SQS for scalability
const { Client } = require('pg');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

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

// Queue user check jobs
const queueUserChecks = async () => {
    console.log('Running scheduled check...');
    const client = getDbConnection();
    let usersQueued = 0;

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        const { rows: alerts } = await client.query('SELECT username, email FROM alerts');
        console.log(`📧 Found ${alerts.length} alerts to process`);

        if (alerts.length === 0) {
            console.log('ℹ️ No alerts configured - no jobs to queue');
            return;
        }

        // Phase 1: Queue map alert checks for all users
        console.log('📋 Phase 1: Queuing map alert checks...');
        for (const { username, email } of alerts) {
            console.log(`📤 Queuing map alert check for ${username}...`);

            try {
                await sqsClient.send(new SendMessageCommand({
                    QueueUrl: process.env.SCHEDULER_QUEUE_URL,
                    MessageBody: JSON.stringify({
                        username: username,
                        email: email,
                        type: 'map_alert_check',
                        phase: 1,
                        timestamp: Date.now()
                    }),
                    MessageAttributes: {
                        username: {
                            DataType: 'String',
                            StringValue: username
                        },
                        type: {
                            DataType: 'String',
                            StringValue: 'map_alert_check'
                        },
                        phase: {
                            DataType: 'String',
                            StringValue: '1'
                        }
                    }
                }));

                usersQueued++;
                console.log(`✅ Queued map alert check for ${username}`);
            } catch (error) {
                console.error(`❌ Error queuing map alert check for ${username}:`, error.message);
                // Continue with other users even if one fails
            }
        }

        // Phase 2: Queue driver notification checks for all users
        console.log('📋 Phase 2: Queuing driver notification checks...');
        for (const { username, email } of alerts) {
            console.log(`📤 Queuing driver notification check for ${username}...`);

            try {
                await sqsClient.send(new SendMessageCommand({
                    QueueUrl: process.env.SCHEDULER_QUEUE_URL,
                    MessageBody: JSON.stringify({
                        username: username,
                        email: email,
                        type: 'driver_notification_check',
                        phase: 2,
                        timestamp: Date.now()
                    }),
                    MessageAttributes: {
                        username: {
                            DataType: 'String',
                            StringValue: username
                        },
                        type: {
                            DataType: 'String',
                            StringValue: 'driver_notification_check'
                        },
                        phase: {
                            DataType: 'String',
                            StringValue: '2'
                        }
                    }
                }));

                usersQueued++;
                console.log(`✅ Queued driver notification check for ${username}`);
            } catch (error) {
                console.error(`❌ Error queuing driver notification check for ${username}:`, error.message);
                // Continue with other users even if one fails
            }
        }

        console.log(`📬 Summary: Queued ${usersQueued} user checks`);

    } catch (err) {
        console.error('❌ Error during scheduled check:', err.message);
        console.error(err.stack);
        throw err;
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};

exports.handler = async (event, context) => {
    console.log('📅 Scheduler Lambda triggered!', event);

    try {
        await queueUserChecks();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scheduled check queued successfully',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('❌ Scheduler Lambda error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Scheduled check failed',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
