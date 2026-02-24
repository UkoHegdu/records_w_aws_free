// lambda/getNotificationHistory.js - Get notification history for a user
const { Client } = require('pg');

exports.handler = async (event, context) => {
    console.log('📊 Get Notification History Lambda triggered!', event);

    try {
        // Check if user is authenticated
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'Authorization header required' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const jwt = require('jsonwebtoken');

        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.user_id;
        } catch (jwtError) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'Invalid token' })
            };
        }

        // Database connection
        const getDbConnection = () => {
            const connectionString = process.env.NEON_DB_CONNECTION_STRING;
            return new Client({
                connectionString: connectionString,
                ssl: {
                    rejectUnauthorized: true
                }
            });
        };

        const client = getDbConnection();
        await client.connect();

        // Get notification history for the last 5 days
        const query = `
            SELECT 
                notification_type,
                status,
                message,
                records_found,
                processing_date,
                created_at
            FROM notification_history
            WHERE user_id = $1
            AND processing_date >= CURRENT_DATE - INTERVAL '5 days'
            ORDER BY processing_date DESC, notification_type ASC
        `;

        const { rows } = await client.query(query, [userId]);
        await client.end();

        // Group by date and type
        const historyByDate = {};

        rows.forEach(row => {
            const date = row.processing_date.toISOString().split('T')[0];

            if (!historyByDate[date]) {
                historyByDate[date] = {
                    date: date,
                    mapper_alert: null,
                    driver_notification: null
                };
            }

            historyByDate[date][row.notification_type] = {
                status: row.status,
                message: row.message,
                records_found: row.records_found,
                created_at: row.created_at
            };
        });

        // Convert to array - only include dates that have actual data
        const result = Object.values(historyByDate);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Notification history retrieved successfully',
                history: result
            })
        };
    } catch (error) {
        console.error('❌ Error getting notification history:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message
            })
        };
    }
};
