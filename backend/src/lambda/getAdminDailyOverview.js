// lambda/getAdminDailyOverview.js - Get admin daily overview for last 5 days
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
    console.log('📊 Admin Daily Overview Lambda triggered!', event);

    try {
        // Check if user is authenticated and is admin
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

        let userId, userRole;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.user_id;
            userRole = decoded.role;
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

        // Check if user is admin
        if (userRole !== 'admin') {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'Admin access required' })
            };
        }

        // Database connection
        const getDbConnection = () => {
            const connectionString = process.env.NEON_DB_CONNECTION_STRING;
            return new Client({
                connectionString: connectionString,
                ssl: {
                    rejectUnauthorized: false
                }
            });
        };

        const client = getDbConnection();
        await client.connect();

        // Get daily overview for the last 5 days
        const query = `
            SELECT 
                processing_date,
                COUNT(*) as total_users,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_mapper_alerts,
                COUNT(CASE WHEN status = 'no_new_times' THEN 1 END) as no_new_times_mapper_alerts,
                COUNT(CASE WHEN status = 'technical_error' THEN 1 END) as error_mapper_alerts,
                SUM(CASE WHEN status = 'sent' THEN records_found ELSE 0 END) as total_mapper_records
            FROM notification_history
            WHERE notification_type = 'mapper_alert'
            AND processing_date >= CURRENT_DATE - INTERVAL '5 days'
            GROUP BY processing_date
            ORDER BY processing_date DESC
        `;

        const { rows: mapperData } = await client.query(query);

        // Get driver notification data
        const driverQuery = `
            SELECT 
                processing_date,
                COUNT(*) as total_users,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_driver_notifications,
                COUNT(CASE WHEN status = 'no_new_times' THEN 1 END) as no_new_times_driver_notifications,
                COUNT(CASE WHEN status = 'technical_error' THEN 1 END) as error_driver_notifications,
                SUM(CASE WHEN status = 'sent' THEN records_found ELSE 0 END) as total_driver_notifications
            FROM notification_history
            WHERE notification_type = 'driver_notification'
            AND processing_date >= CURRENT_DATE - INTERVAL '5 days'
            GROUP BY processing_date
            ORDER BY processing_date DESC
        `;

        const { rows: driverData } = await client.query(driverQuery);

        // Get detailed user breakdown for each day
        const detailQuery = `
            SELECT 
                processing_date,
                username,
                notification_type,
                status,
                message,
                records_found
            FROM notification_history
            WHERE processing_date >= CURRENT_DATE - INTERVAL '5 days'
            ORDER BY processing_date DESC, username ASC, notification_type ASC
        `;

        const { rows: detailData } = await client.query(detailQuery);

        await client.end();

        // Process the data into daily summaries
        const dailySummaries = [];
        const today = new Date();

        for (let i = 0; i < 5; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const mapperDay = mapperData.find(row => row.processing_date.toISOString().split('T')[0] === dateStr);
            const driverDay = driverData.find(row => row.processing_date.toISOString().split('T')[0] === dateStr);

            // Check if we have any data for this day
            const hasData = mapperDay || driverDay;

            // If no data exists, skip this day entirely
            if (!hasData) {
                continue;
            }

            // Calculate overall status only when data exists
            let overallStatus = 'success'; // green
            let statusMessage = 'Daily batch job complete';

            const totalErrors = (mapperDay?.error_mapper_alerts || 0) + (driverDay?.error_driver_notifications || 0);
            const totalUsers = Math.max(mapperDay?.total_users || 0, driverDay?.total_users || 0);
            const totalSuccess = (mapperDay?.successful_mapper_alerts || 0) + (mapperDay?.no_new_times_mapper_alerts || 0) +
                (driverDay?.successful_driver_notifications || 0) + (driverDay?.no_new_times_driver_notifications || 0);

            if (totalErrors > 0) {
                if (totalSuccess > 0) {
                    overallStatus = 'partial'; // orange
                    statusMessage = 'Errors encountered during daily job';
                } else {
                    overallStatus = 'error'; // red
                    statusMessage = 'Errors encountered during daily job';
                }
            }

            // Get user details for this day
            const dayDetails = detailData.filter(row => row.processing_date.toISOString().split('T')[0] === dateStr);
            const userBreakdown = {};

            dayDetails.forEach(row => {
                if (!userBreakdown[row.username]) {
                    userBreakdown[row.username] = {
                        username: row.username,
                        mapper_alert: null,
                        driver_notification: null
                    };
                }
                userBreakdown[row.username][row.notification_type] = {
                    status: row.status,
                    message: row.message,
                    records_found: row.records_found
                };
            });

            dailySummaries.push({
                date: dateStr,
                display_date: date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                relative_date: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`,
                overall_status: overallStatus,
                status_message: statusMessage,
                stats: {
                    total_users: totalUsers,
                    mapper_alerts: {
                        successful: mapperDay?.successful_mapper_alerts || 0,
                        no_new_times: mapperDay?.no_new_times_mapper_alerts || 0,
                        errors: mapperDay?.error_mapper_alerts || 0,
                        total_records: mapperDay?.total_mapper_records || 0
                    },
                    driver_notifications: {
                        successful: driverDay?.successful_driver_notifications || 0,
                        no_new_times: driverDay?.no_new_times_driver_notifications || 0,
                        errors: driverDay?.error_driver_notifications || 0,
                        total_notifications: driverDay?.total_driver_notifications || 0
                    }
                },
                user_breakdown: Object.values(userBreakdown)
            });
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Admin daily overview retrieved successfully',
                daily_summaries: dailySummaries
            })
        };
    } catch (error) {
        console.error('❌ Error getting admin daily overview:', error);
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
