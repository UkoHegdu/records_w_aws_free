// lambda/getAdminConfig.js - Get admin configuration values
const { Client } = require('pg');

exports.handler = async (event, context) => {
    console.log('⚙️ Get Admin Config Lambda triggered!', event);

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
                    rejectUnauthorized: false
                }
            });
        };

        const client = getDbConnection();
        await client.connect();

        // Get all admin configuration values (excluding API rate limit)
        const query = `
            SELECT config_key, config_value, description, updated_at
            FROM admin_config
            WHERE config_key != 'api_rate_limit_per_second'
            ORDER BY config_key
        `;

        const { rows } = await client.query(query);
        await client.end();

        const configs = rows.map(row => ({
            config_key: row.config_key,
            config_value: row.config_value,
            description: row.description,
            updated_at: row.updated_at
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
                message: 'Admin configuration retrieved successfully',
                configs: configs
            })
        };
    } catch (error) {
        console.error('❌ Error getting admin config:', error);
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
