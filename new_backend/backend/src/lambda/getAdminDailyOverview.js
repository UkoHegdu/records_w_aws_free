// lambda/getAdminDailyOverview.js - Get admin daily overview for last 5 days
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
    console.log('📊 Admin Daily Overview Lambda triggered!', event);

    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Authorization header required' }) };
        }

        const token = authHeader.replace('Bearer ', '');
        let userRole;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userRole = decoded.role;
        } catch (jwtError) {
            return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid token' }) };
        }

        if (userRole !== 'admin') {
            return { statusCode: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const client = new Client({
            connectionString: process.env.NEON_DB_CONNECTION_STRING,
            ssl: { rejectUnauthorized: true }
        });
        await client.connect();

        // Daily stats: num_users (distinct), num_mapper_alerts, num_driver_notifications, num_notifications_sent, num_errors
        const dailyQuery = `
            SELECT 
                processing_date,
                COUNT(DISTINCT user_id) as num_users,
                COUNT(*) FILTER (WHERE notification_type = 'mapper_alert') as num_mapper_alerts,
                COUNT(*) FILTER (WHERE notification_type = 'driver_notification') as num_driver_notifications,
                COUNT(*) FILTER (WHERE status = 'sent') as num_notifications_sent,
                COUNT(*) FILTER (WHERE status = 'technical_error') as num_errors
            FROM notification_history
            WHERE processing_date >= CURRENT_DATE - INTERVAL '5 days'
            GROUP BY processing_date
            ORDER BY processing_date DESC
        `;
        const { rows: dailyRows } = await client.query(dailyQuery);

        // Overall stats (last 5 days): maps_checked (total in alert_maps), notifications_sent, total_errors
        const overallQuery = `
            SELECT
                (SELECT COUNT(*)::int FROM alert_maps) as maps_checked,
                (SELECT COUNT(*)::int FROM notification_history WHERE status = 'sent' AND processing_date >= CURRENT_DATE - INTERVAL '5 days') as notifications_sent,
                (SELECT COUNT(*)::int FROM notification_history WHERE status = 'technical_error' AND processing_date >= CURRENT_DATE - INTERVAL '5 days') as total_errors
        `;
        const { rows: overallRows } = await client.query(overallQuery);

        const detailQuery = `
            SELECT processing_date, username, notification_type, status, message, records_found
            FROM notification_history
            WHERE processing_date >= CURRENT_DATE - INTERVAL '5 days'
            ORDER BY processing_date DESC, username ASC, notification_type ASC
        `;
        const { rows: detailData } = await client.query(detailQuery);

        await client.end();

        const overall = overallRows[0] || { maps_checked: 0, notifications_sent: 0, total_errors: 0 };
        const today = new Date();
        const dailySummaries = [];

        for (let i = 0; i < 5; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const dayRow = dailyRows.find(row => row.processing_date.toISOString().split('T')[0] === dateStr);
            if (!dayRow) continue;

            const numUsers = Number(dayRow.num_users) || 0;
            const numMapperAlerts = Number(dayRow.num_mapper_alerts) || 0;
            const numDriverNotifications = Number(dayRow.num_driver_notifications) || 0;
            const numNotificationsSent = Number(dayRow.num_notifications_sent) || 0;
            const numErrors = Number(dayRow.num_errors) || 0;

            const hasErrors = numErrors > 0;
            const overallStatus = hasErrors ? (numNotificationsSent > 0 ? 'partial' : 'error') : 'success';
            const statusMessage = hasErrors ? 'Errors encountered during daily job' : 'Daily batch job complete';

            const dayDetails = detailData.filter(row => row.processing_date.toISOString().split('T')[0] === dateStr);
            const userBreakdown = {};
            dayDetails.forEach(row => {
                if (!userBreakdown[row.username]) {
                    userBreakdown[row.username] = { username: row.username, mapper_alert: null, driver_notification: null };
                }
                userBreakdown[row.username][row.notification_type] = {
                    status: row.status,
                    message: row.message,
                    records_found: row.records_found
                };
            });

            dailySummaries.push({
                date: dateStr,
                display_date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                relative_date: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`,
                overall_status: overallStatus,
                status_message: statusMessage,
                stats: {
                    num_users: numUsers,
                    num_mapper_alerts: numMapperAlerts,
                    num_driver_notifications: numDriverNotifications,
                    num_notifications_sent: numNotificationsSent,
                    num_errors: numErrors
                },
                user_breakdown: Object.values(userBreakdown)
            });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                message: 'Admin daily overview retrieved successfully',
                daily_summaries: dailySummaries,
                overall: {
                    maps_checked: Number(overall.maps_checked) || 0,
                    notifications_sent: Number(overall.notifications_sent) || 0,
                    total_errors: Number(overall.total_errors) || 0
                }
            })
        };
    } catch (error) {
        console.error('❌ Error getting admin daily overview:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};
