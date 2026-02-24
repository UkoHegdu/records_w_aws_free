// lambda/getSiteStats.js - Public site statistics (no auth required)
const { Client } = require('pg');

exports.handler = async (event) => {
    try {
        const connectionString = process.env.NEON_DB_CONNECTION_STRING;
        if (!connectionString) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Database not configured' })
            };
        }

        const client = new Client({
            connectionString,
            ssl: { rejectUnauthorized: true }
        });
        await client.connect();

        let rows;
        try {
            const result = await client.query(`
                SELECT
                    (SELECT COUNT(*)::int FROM users) as total_users,
                    (SELECT COUNT(*)::int FROM notification_history WHERE notification_type = 'mapper_alert' AND status = 'sent') as total_alerts_sent,
                    (SELECT COUNT(*)::int FROM driver_notifications) as maps_being_watched
            `);
            rows = result.rows;
        } finally {
            await client.end();
        }

        const row = rows[0] || {};
        const siteStats = {
            total_users: Number(row.total_users) || 0,
            total_alerts_sent: Number(row.total_alerts_sent) || 0,
            maps_being_watched: Number(row.maps_being_watched) || 0
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(siteStats)
        };
    } catch (error) {
        console.error('Error getting site stats:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
