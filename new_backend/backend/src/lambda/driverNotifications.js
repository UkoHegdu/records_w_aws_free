// lambda/driverNotifications.js
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const apiClient = require('./shared/apiClient');
const { formatTime } = require('./shared/timeFormatter');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

// Database connection using Neon
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

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.user_id;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
};

exports.handler = async (event, context) => {
    console.log('🚗 Driver Notifications Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    try {
        console.log('🔍 Step 1: Function started successfully');

        const httpMethod = event.httpMethod;
        console.log('🔍 Step 2: HTTP method extracted:', httpMethod);

        // Handle OPTIONS request
        if (httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: headers,
                body: ''
            };
        }

        // Get user_id from JWT token
        console.log('🔍 Step 3: About to check JWT token');
        const userId = getUserIdFromToken(event);
        console.log('🔍 Step 4: JWT token check completed, userId:', userId);

        if (!userId) {
            console.log('🔍 Step 5: No valid user ID, returning 401');
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ msg: 'Unauthorized - invalid or missing token' })
            };
        }

        console.log(`🔐 Authenticated user ID: ${userId}`);

        // Handle GET request - fetch driver notifications
        if (httpMethod === 'GET') {
            return await handleGetNotifications(userId, headers);
        }

        // Handle POST request - create driver notification
        if (httpMethod === 'POST') {
            return await handleCreateNotification(event, userId, headers);
        }

        // Handle DELETE request - remove driver notification
        if (httpMethod === 'DELETE') {
            return await handleDeleteNotification(event, userId, headers);
        }

        return {
            statusCode: 405,
            headers: headers,
            body: JSON.stringify({ msg: 'Method not allowed' })
        };
    } catch (error) {
        console.error('❌ Driver Notifications Lambda error:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error details:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data
            } : null
        });

        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                error: 'Internal server error'
            })
        };
    }
}

async function handleGetNotifications(userId, headers) {
    console.log('📋 Fetching driver notifications...');

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Fetch driver notifications for the user
        const result = await client.query(
            'SELECT id, map_uid, map_name, current_position, personal_best, status, created_at, last_checked, is_active FROM driver_notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        const notifications = result.rows.map(row => ({
            id: row.id.toString(),
            mapUid: row.map_uid,
            mapName: row.map_name,
            currentPosition: row.current_position,
            personalBest: row.personal_best,
            personalBestFormatted: formatTime(row.personal_best),
            status: row.status || 'active',
            createdAt: row.created_at,
            lastChecked: row.last_checked,
            isActive: row.is_active
        }));

        console.log(`✅ Found ${notifications.length} driver notifications for user ${userId}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ notifications })
        };

    } catch (err) {
        console.error('❌ Get driver notifications error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to fetch driver notifications' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

async function handleCreateNotification(event, userId, headers) {
    console.log('➕ Creating driver notification...');

    // Rate limiting per user
    if (!checkRateLimit(`create_driver_notification:${userId}`, 5, 300000)) { // 5 notifications per 5 minutes
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ msg: 'Too many notification creation attempts. Please try again later.' })
        };
    }

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

    // Validate and sanitize inputs
    const mapUidValidation = validateAndSanitizeInput(body.mapUid, 'mapUid', { required: true });
    const mapNameValidation = validateAndSanitizeInput(body.mapName, 'string', { required: true, maxLength: 500 });

    if (!mapUidValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: mapUidValidation.error })
        };
    }

    if (!mapNameValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: mapNameValidation.error })
        };
    }

    const { sanitized: mapUid } = mapUidValidation;
    const { sanitized: mapName } = mapNameValidation;

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Get user information including TM account ID
        const userResult = await client.query(
            'SELECT username, tm_username, tm_account_id FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ msg: 'User not found' })
            };
        }

        const user = userResult.rows[0];

        // Check if user has TM username set
        if (!user.tm_username || !user.tm_account_id) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    msg: 'Please set your Trackmania username first before creating notifications',
                    requiresTmUsername: true
                })
            };
        }

        console.log(`Creating notification for user: ${user.username} (TM: ${user.tm_username})`);

        // Check if user is in top 5 on this map using account ID
        const positionCheck = await checkUserPosition(mapUid, user.tm_account_id);

        if (!positionCheck.isValid) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    msg: `Cannot create notification: ${positionCheck.error}`
                })
            };
        }

        // Check if notification already exists
        const existingResult = await client.query(
            'SELECT id FROM driver_notifications WHERE user_id = $1 AND map_uid = $2',
            [userId, mapUid]
        );

        if (existingResult.rows.length > 0) {
            return {
                statusCode: 409,
                headers: headers,
                body: JSON.stringify({ msg: 'Notification already exists for this map' })
            };
        }

        // Insert driver notification
        await client.query(
            'INSERT INTO driver_notifications (user_id, map_uid, map_name, current_position, personal_best, created_at, last_checked, is_active) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), TRUE)',
            [userId, mapUid, mapName, positionCheck.position, positionCheck.personalBest]
        );

        console.log(`✅ Driver notification created successfully for user ${userId} on map ${mapUid}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                msg: 'Driver notification created successfully',
                position: positionCheck.position,
                personalBest: positionCheck.personalBest,
                personalBestFormatted: positionCheck.personalBestFormatted
            })
        };

    } catch (err) {
        console.error('❌ Create driver notification error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to create driver notification' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

async function handleDeleteNotification(event, userId, headers) {
    console.log('🗑️ Deleting driver notification...');

    // Get notification ID from path parameters
    const notificationId = event.pathParameters?.id;

    if (!notificationId) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: 'Notification ID is required' })
        };
    }

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Delete the notification (only if it belongs to the user)
        const result = await client.query(
            'DELETE FROM driver_notifications WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );

        if (result.rowCount === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ msg: 'Notification not found or not authorized' })
            };
        }

        console.log(`✅ Driver notification ${notificationId} deleted successfully for user ${userId}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ success: true, msg: 'Driver notification deleted successfully' })
        };

    } catch (err) {
        console.error('❌ Delete driver notification error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Failed to delete driver notification' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Check if user is in top 5 on the map using account ID
async function checkUserPosition(mapUid, tmAccountId) {
    try {
        console.log(`🔍 Checking position for account ${tmAccountId} on map ${mapUid}`);

        // Get only top 5 records (no onlyWorld needed for top 5)
        const baseUrl = process.env.LEAD_API;
        const url = `${baseUrl}/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?length=5`;

        console.log(`📡 Making API call to: ${url}`);
        const response = await apiClient.get(url, { timeout: 10000 });
        console.log(`📡 API call successful, status: ${response.status}`);
        const leaderboardData = response.data;

        if (!leaderboardData?.tops?.[0]?.top) {
            return { isValid: false, error: 'No leaderboard data available for this map' };
        }

        // Check if user's account ID is in top 5
        const top5Records = leaderboardData.tops[0].top;
        const userRecord = top5Records.find(record => record.accountId === tmAccountId);

        if (!userRecord) {
            return { isValid: false, error: 'User not found in top 5 positions on this map' };
        }

        console.log(`✅ User is in position ${userRecord.position} on map ${mapUid} with time ${userRecord.score}ms`);
        return {
            isValid: true,
            position: userRecord.position,
            accountId: tmAccountId,
            personalBest: userRecord.score,
            personalBestFormatted: formatTime(userRecord.score)
        };

    } catch (error) {
        console.error('Error checking user position:', error);
        if (error.code === 'ECONNABORTED') {
            return { isValid: false, error: 'API request timed out - please try again' };
        } else if (error.response?.status === 404) {
            return { isValid: false, error: 'Map not found or not accessible' };
        } else if (error.response?.status === 401) {
            return { isValid: false, error: 'Authentication failed with Trackmania API' };
        } else {
            return { isValid: false, error: `Failed to check user position: ${error.message}` };
        }
    }
}
