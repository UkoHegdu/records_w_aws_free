// lambda/getAdminUsers.js - Get admin users list
const { Client } = require('pg');

exports.handler = async (event, context) => {
    console.log('👥 Get Admin Users Lambda triggered!', event);

    try {
        // Check if user is admin
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

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'admin') {
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

        // Get all users with alert info, map count from alert_maps, and driver notifications count
        const query = `
            SELECT * FROM (
                SELECT DISTINCT ON (u.id)
                    u.id,
                    u.username,
                    u.tm_username,
                    u.email,
                    u.created_at,
                    a.alert_type,
                    a.id as alert_id,
                    a.created_at as alert_created_at,
                    COALESCE(a.map_count, (SELECT COUNT(*) FROM alert_maps am WHERE am.alert_id = a.id))::int as map_count,
                    (SELECT COUNT(*)::int FROM driver_notifications dn WHERE dn.user_id = u.id) as driver_notifications_count
                FROM users u
                LEFT JOIN alerts a ON u.id = a.user_id
                ORDER BY u.id, a.created_at DESC NULLS LAST
            ) sub
            ORDER BY created_at DESC
        `;

        const { rows } = await client.query(query);
        await client.end();

        const users = rows.map(row => ({
            id: row.id,
            username: row.username,
            tm_username: row.tm_username,
            email: row.email,
            created_at: row.created_at,
            alert_type: row.alert_type || 'none',
            alert_id: row.alert_id,
            map_count: Number(row.map_count) || 0,
            driver_notifications_count: Number(row.driver_notifications_count) || 0,
            alert_created_at: row.alert_created_at
        }));

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Users retrieved successfully',
                users: users,
                total_users: users.length
            })
        };
    } catch (error) {
        console.error('❌ Error getting admin users:', error);
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
