// lambda/updateUserAlertType.js - Update user alert type (admin only)
const { Client } = require('pg');

exports.handler = async (event, context) => {
    console.log('🔄 Update User Alert Type Lambda triggered!', event);

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
        const { user_id, alert_type } = body;

        if (!user_id || !alert_type) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'user_id and alert_type are required' })
            };
        }

        if (!['accurate', 'inaccurate'].includes(alert_type)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'alert_type must be "accurate" or "inaccurate"' })
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

        try {
            // Check if user exists and has alerts
            const userQuery = `
                SELECT u.username, a.id as alert_id, a.alert_type as current_type
                FROM users u
                LEFT JOIN alerts a ON u.id = a.user_id
                WHERE u.id = $1
            `;

            const { rows: userRows } = await client.query(userQuery, [user_id]);

            if (userRows.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                    },
                    body: JSON.stringify({ error: 'User not found' })
                };
            }

            const user = userRows[0];

            if (!user.alert_id) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                    },
                    body: JSON.stringify({ error: 'User has no alerts configured' })
                };
            }

            // If switching from inaccurate to accurate, clean up position data
            if (user.current_type === 'inaccurate' && alert_type === 'accurate') {
                console.log(`🧹 Cleaning up position data for user ${user.username}`);

                // Get user's map UIDs
                const mapsQuery = `
                    SELECT am.mapid
                    FROM alert_maps am
                    WHERE am.alert_id = $1
                `;

                const { rows: mapRows } = await client.query(mapsQuery, [user.alert_id]);
                const mapUids = mapRows.map(row => row.mapid);

                if (mapUids.length > 0) {
                    // Delete position data for these maps
                    const deleteQuery = `
                        DELETE FROM map_positions 
                        WHERE map_uid = ANY($1)
                    `;

                    await client.query(deleteQuery, [mapUids]);
                    console.log(`🗑️ Deleted position data for ${mapUids.length} maps`);
                }
            }

            // Update alert type
            const updateQuery = `
                UPDATE alerts 
                SET alert_type = $1, updated_at = NOW()
                WHERE user_id = $2
                RETURNING alert_type, map_count
            `;

            const { rows: updateRows } = await client.query(updateQuery, [alert_type, user_id]);

            if (updateRows.length === 0) {
                throw new Error('Failed to update alert type');
            }

            const updatedAlert = updateRows[0];

            await client.end();

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({
                    message: 'User alert type updated successfully',
                    user_id: user_id,
                    username: user.username,
                    alert_type: updatedAlert.alert_type,
                    map_count: updatedAlert.map_count
                })
            };

        } catch (dbError) {
            await client.end();
            throw dbError;
        }

    } catch (error) {
        console.error('❌ Error updating user alert type:', error);
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
