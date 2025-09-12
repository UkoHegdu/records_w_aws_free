// lambda/create_alert.js
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// Database connection using Neon
const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
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
    console.log('🚨 Alert Lambda triggered!', event);

    const httpMethod = event.httpMethod;
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    };

    // Handle GET request - fetch alerts
    if (httpMethod === 'GET') {
        return await handleGetAlerts(event, headers);
    }

    // Handle POST request - create alert
    if (httpMethod === 'POST') {
        return await handleCreateAlert(event, headers);
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

        // Debug: Check what alerts exist in the database
        const allAlerts = await client.query('SELECT id, username, email, user_id, created_at FROM alerts ORDER BY created_at DESC');
        console.log('🔍 All alerts in database:', allAlerts.rows);

        // Fetch alerts for the user
        const result = await client.query(
            'SELECT id, username, email, created_at FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        const alerts = result.rows.map(row => ({
            id: row.id.toString(),
            mapName: `Map for ${row.username}`, // Placeholder - you might want to join with maps table
            mapId: `map_${row.id}`, // Placeholder
            createdAt: row.created_at,
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

        // Insert alert with actual user_id from JWT token
        await client.query(
            'INSERT INTO alerts (username, email, user_id, created_at) VALUES ($1, $2, $3, NOW())',
            [username, email, userId]
        );

        console.log(`✅ Alert created successfully for user ${userId}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ success: true, msg: 'Alert created successfully' })
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

        // Delete the alert (only if it belongs to the user)
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
