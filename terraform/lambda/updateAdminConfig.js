// lambda/updateAdminConfig.js - Update admin configuration values
const { Client } = require('pg');

exports.handler = async (event, context) => {
    console.log('⚙️ Update Admin Config Lambda triggered!', event);

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

        // Parse request body
        const body = JSON.parse(event.body);
        const { config_key, config_value } = body;

        if (!config_key || config_value === undefined) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'config_key and config_value are required' })
            };
        }

        // Validate config value based on key
        const validationResult = validateConfigValue(config_key, config_value);
        if (!validationResult.valid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: validationResult.error })
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

        // Update configuration value
        const query = `
            UPDATE admin_config 
            SET config_value = $1, updated_at = NOW()
            WHERE config_key = $2
            RETURNING config_key, config_value, description, updated_at
        `;

        const { rows } = await client.query(query, [config_value, config_key]);
        await client.end();

        if (rows.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'Configuration key not found' })
            };
        }

        const updatedConfig = rows[0];

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Configuration updated successfully',
                config: {
                    config_key: updatedConfig.config_key,
                    config_value: updatedConfig.config_value,
                    description: updatedConfig.description,
                    updated_at: updatedConfig.updated_at
                }
            })
        };
    } catch (error) {
        console.error('❌ Error updating admin config:', error);
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

// Validate configuration values
function validateConfigValue(configKey, value) {
    const numValue = parseInt(value);

    switch (configKey) {
        case 'max_maps_per_user':
            if (isNaN(numValue) || numValue < 1 || numValue > 1000) {
                return { valid: false, error: 'Max maps per user must be between 1 and 1000' };
            }
            break;
        case 'max_driver_notifications':
            if (isNaN(numValue) || numValue < 1 || numValue > 1000) {
                return { valid: false, error: 'Max driver notifications must be between 1 and 1000' };
            }
            break;
        case 'max_users_registration':
            if (isNaN(numValue) || numValue < 1 || numValue > 10000) {
                return { valid: false, error: 'Max users registration must be between 1 and 10000' };
            }
            break;
        case 'max_new_records_per_map':
            if (isNaN(numValue) || numValue < 1 || numValue > 100) {
                return { valid: false, error: 'Max new records per map must be between 1 and 100' };
            }
            break;
        default:
            return { valid: true };
    }

    return { valid: true };
}
