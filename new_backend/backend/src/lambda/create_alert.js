// lambda/create_alert.js
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');
const { fetchMapListOnly } = require('./mapSearch');

// Database connection using Neon (brackets for forcing backend build)
const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: true
        }
    });
};

// Helper function to extract user ID from JWT token
const getUserIdFromToken = (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7); // Remove 'Bearer' prefix

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.user_id;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
};

exports.handler = async (event, context) => {
    console.log('🚨 Alert Lambda triggered!', event);

    const httpMethod = event.httpMethod;
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    // Handle GET request - fetch alerts
    if (httpMethod === 'GET') {
        return await handleGetAlerts(event, headers);
    }

    // Handle POST request - create alert
    if (httpMethod === 'POST') {
        return await handleCreateAlert(event, headers);
    }

    // Handle PUT request - update alert settings
    if (httpMethod === 'PUT') {
        return await handleUpdateAlert(event, headers);
    }

    // Handle DELETE request - remove alert
    if (httpMethod === 'DELETE') {
        return await handleDeleteAlert(event, headers);
    }

    // Handle OPTIONS request
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    return {
        statusCode: 405,
        headers: headers,
        body: JSON.stringify({ msg: 'Method not allowed' })
    };
};

const AUTO_INACCURATE_MAP_THRESHOLD = 100;
const ALLOWED_RECORD_FILTERS = new Set(['top5', 'wr', 'all']);

function normalizeRecordFilter(value) {
    if (!value) return 'top5';
    const v = String(value).trim().toLowerCase();
    return ALLOWED_RECORD_FILTERS.has(v) ? v : null;
}

/** Run after response is sent: fetch map count from TM Exchange and update the alert. */
async function updateMapCountInBackground(alertId, username, alertType = 'accurate') {
    const client = getDbConnection();
    try {
        const mapList = await fetchMapListOnly(username);
        const mapCount = mapList.length;
        await client.connect();
        await client.query('UPDATE alerts SET map_count = $1 WHERE id = $2', [mapCount, alertId]);
        console.log(`📊 Background: updated alert ${alertId} map_count to ${mapCount}`);

        const shouldInitInaccurate = mapCount > AUTO_INACCURATE_MAP_THRESHOLD || alertType === 'inaccurate';
        if (shouldInitInaccurate && mapCount > 0) {
            await client.query(
                'UPDATE alerts SET alert_type = $1 WHERE id = $2',
                ['inaccurate', alertId]
            );
            for (const map of mapList) {
                await client.query(
                    'INSERT INTO alert_maps (alert_id, mapid) VALUES ($1, $2) ON CONFLICT (alert_id, mapid) DO NOTHING',
                    [alertId, map.MapUid]
                );
            }
            const { checkMapPositions } = require('./checkMapPositions');
            const positionResults = await checkMapPositions(mapList.map(m => m.MapUid));
            for (const r of positionResults) {
                if (r.found) {
                    await client.query(
                        'INSERT INTO map_positions (map_uid, position, score, last_checked) VALUES ($1, $2, $3, NOW()) ON CONFLICT (map_uid) DO NOTHING',
                        [r.map_uid, r.position, r.score]
                    );
                }
            }
            console.log(`✅ Background: initialized inaccurate mode for ${username} (${mapCount} maps)`);
        }
    } catch (err) {
        console.warn('Background map count/init failed:', err.message);
    } finally {
        await client.end();
    }
}

async function handleGetAlerts(event, headers) {
    console.log('📋 Fetching alerts...');

    // Get user_id from JWT token
    const userId = getUserIdFromToken(event);

    if (!userId) {
        return {
            statusCode: 401,
            headers: headers,
            body: JSON.stringify({ msg: 'Unauthorized - invalid or missing token' })
        };
    }

    console.log(`🔐 Authenticated user ID: ${userId}`);

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        let result;
        try {
            result = await client.query(
                'SELECT id, username, email, created_at, record_filter FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );
        } catch (err) {
            // Backwards-compatible fallback if DB migration hasn't been applied yet.
            if (String(err?.message || '').includes('record_filter')) {
                result = await client.query(
                    'SELECT id, username, email, created_at FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
                    [userId]
                );
            } else {
                throw err;
            }
        }

        const alerts = result.rows.map(row => ({
            id: row.id.toString(),
            mapName: `${row.username}'s map alerts`,
            mapId: `map_${row.id}`, // Placeholder
            createdAt: row.created_at,
            recordFilter: row.record_filter || 'top5',
            isActive: true
        }));

        console.log(`✅ Found ${alerts.length} alerts for user ${userId}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ alerts })
        };

    } catch (err) {
        console.error('❌ Get alerts error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to fetch alerts' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

async function handleCreateAlert(event, headers) {
    console.log('➕ Creating alert...');

    // Get user_id from JWT token
    const userId = getUserIdFromToken(event);

    if (!userId) {
        return {
            statusCode: 401,
            headers: headers,
            body: JSON.stringify({ msg: 'Unauthorized - invalid or missing token' })
        };
    }

    // Rate limiting per user
    if (!checkRateLimit(`create_alert:${userId}`, 10, 300000)) { // 10 alerts per 5 minutes
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ msg: 'Too many alert creation attempts. Please try again later.' })
        };
    }

    console.log(`🔐 Authenticated user ID: ${userId}`);

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        console.error('Error parsing request body:', error);
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: 'Invalid JSON in request body' })
        };
    }

    console.log('Welcome to alert creation function, have a nice time!');

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Get user information from database using user_id from JWT token
        const userResult = await client.query(
            'SELECT username, email FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ msg: 'User not found' })
            };
        }

        const { username, email } = userResult.rows[0];
        console.log(`Creating alert for user: ${username} (${email})`);

        const alertType = body.alert_type || 'accurate';
        const initialMapCount = body.MapCount ?? 0;
        const recordFilter = normalizeRecordFilter(body.record_filter) || 'top5';

        // Insert alert immediately so the user gets a fast response
        let alertResult;
        try {
            alertResult = await client.query(
                'INSERT INTO alerts (username, email, user_id, alert_type, map_count, record_filter, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id',
                [username, email, userId, alertType, initialMapCount, recordFilter]
            );
        } catch (err) {
            // Backwards-compatible fallback if DB migration hasn't been applied yet.
            if (String(err?.message || '').includes('record_filter')) {
                alertResult = await client.query(
                    'INSERT INTO alerts (username, email, user_id, alert_type, map_count, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id',
                    [username, email, userId, alertType, initialMapCount]
                );
            } else {
                throw err;
            }
        }

        const alertId = alertResult.rows[0].id;
        console.log(`✅ Alert created successfully for user ${userId} with ID ${alertId}`);

        // Update map count in background (TM Exchange fetch can be slow for many maps)
        if (username) {
            updateMapCountInBackground(alertId, username, alertType).catch(err =>
                console.warn('Background map count update failed:', err.message)
            );
        }

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                msg: 'Alert created successfully',
                alert_id: alertId,
                alert_type: alertType,
                map_count: initialMapCount,
                record_filter: recordFilter
            })
        };

    } catch (err) {
        console.error('❌ Create alert error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to create alert' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

async function handleUpdateAlert(event, headers) {
    console.log('✏️ Updating alert...');

    const alertId = event.pathParameters?.id;
    if (!alertId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ msg: 'Alert ID is required' })
        };
    }

    const userId = getUserIdFromToken(event);
    if (!userId) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ msg: 'Unauthorized - invalid or missing token' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        console.error('Error parsing request body:', error);
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ msg: 'Invalid JSON in request body' })
        };
    }

    const recordFilter = normalizeRecordFilter(body.record_filter);
    if (!recordFilter) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ msg: 'Invalid record_filter. Allowed: top5, wr, all' })
        };
    }

    const client = getDbConnection();
    try {
        await client.connect();
        const result = await client.query(
            'UPDATE alerts SET record_filter = $1 WHERE id = $2 AND user_id = $3',
            [recordFilter, alertId, userId]
        );

        if (result.rowCount === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ msg: 'Alert not found or not authorized' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, record_filter: recordFilter })
        };
    } catch (err) {
        console.error('❌ Update alert error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ msg: 'Failed to update alert' })
        };
    } finally {
        await client.end();
    }
}

async function handleDeleteAlert(event, headers) {
    console.log('🗑️ Deleting alert...');

    // Get alert ID from path parameters
    const alertId = event.pathParameters?.id;

    if (!alertId) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: 'Alert ID is required' })
        };
    }

    // Get user_id from JWT token
    const userId = getUserIdFromToken(event);

    if (!userId) {
        return {
            statusCode: 401,
            headers: headers,
            body: JSON.stringify({ msg: 'Unauthorized - invalid or missing token' })
        };
    }

    console.log(`🔐 Authenticated user ID: ${userId}`);

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Fetch map_uids before delete (alert_maps cascade-removed with alert)
        const { rows: mapRows } = await client.query(
            'SELECT mapid FROM alert_maps WHERE alert_id = $1',
            [alertId]
        );
        const mapUids = mapRows.map(r => r.mapid);

        // Delete the alert (only if it belongs to the user); cascade removes alert_maps
        const result = await client.query(
            'DELETE FROM alerts WHERE id = $1 AND user_id = $2',
            [alertId, userId]
        );

        if (result.rowCount === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ msg: 'Alert not found or not authorized' })
            };
        }

        console.log(`✅ Alert ${alertId} deleted successfully for user ${userId}`);

        // Clean up map_positions for maps no longer in any alert_maps
        if (mapUids.length > 0) {
            const { rowCount: deleted } = await client.query(
                `DELETE FROM map_positions mp
                 WHERE mp.map_uid = ANY($1::text[])
                 AND NOT EXISTS (SELECT 1 FROM alert_maps am WHERE am.mapid = mp.map_uid)`,
                [mapUids]
            );
            if (deleted > 0) {
                console.log(`🗑️ Cleaned up ${deleted} orphaned map_positions rows`);
            }
        }

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ success: true, msg: 'Alert deleted successfully' })
        };

    } catch (err) {
        console.error('❌ Delete alert error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to delete alert' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}
