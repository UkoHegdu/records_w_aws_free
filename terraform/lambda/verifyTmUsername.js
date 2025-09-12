// lambda/verifyTmUsername.js
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const oauthApiClient = require('./shared/oauthApiClient');

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
    console.log('🔍 TM Username Verification Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    // Get user_id from JWT token
    const userId = getUserIdFromToken(event);
    if (!userId) {
        return {
            statusCode: 401,
            headers: headers,
            body: JSON.stringify({ error: 'Unauthorized - invalid or missing token' })
        };
    }

    console.log(`🔐 Authenticated user ID: ${userId}`);

    // Handle GET request - check if user has TM username set
    if (event.httpMethod === 'GET') {
        return await handleGetTmUsername(userId, headers);
    }

    // Handle POST request - verify and set TM username
    if (event.httpMethod === 'POST') {
        return await handleVerifyTmUsername(event, userId, headers);
    }

    return {
        statusCode: 405,
        headers: headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};

async function handleGetTmUsername(userId, headers) {
    console.log('📋 Checking TM username status...');

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Check if user has TM username set
        const result = await client.query(
            'SELECT tm_username, tm_account_id FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ error: 'User not found' })
            };
        }

        const user = result.rows[0];
        const hasTmUsername = !!(user.tm_username && user.tm_account_id);

        console.log(`✅ TM username status: ${hasTmUsername ? 'Set' : 'Not set'}`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                hasTmUsername,
                tmUsername: user.tm_username || null,
                tmAccountId: user.tm_account_id || null
            })
        };

    } catch (err) {
        console.error('❌ Get TM username error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Failed to check TM username status' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

async function handleVerifyTmUsername(event, userId, headers) {
    console.log('✅ Verifying TM username...');

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        console.error('Error parsing request body:', error);
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ error: 'Invalid JSON in request body' })
        };
    }

    const { tmUsername } = body;

    if (!tmUsername) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ error: 'TM username is required' })
        };
    }

    try {
        // Call TM API to verify username and get account ID
        console.log(`🔍 Verifying TM username: ${tmUsername}`);
        const response = await oauthApiClient.get(
            `https://api.trackmania.com/api/display-names/account-ids?displayName[]=${encodeURIComponent(tmUsername)}`
        );

        const accountId = response.data[tmUsername];

        if (!accountId) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ error: 'TM username not found' })
            };
        }

        console.log(`✅ TM username verified: ${tmUsername} -> ${accountId}`);

        // Store TM username and account ID in database
        const client = getDbConnection();
        await client.connect();

        await client.query(
            'UPDATE users SET tm_username = $1, tm_account_id = $2 WHERE id = $3',
            [tmUsername, accountId, userId]
        );

        await client.end();

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                tmUsername,
                accountId,
                message: 'TM username verified and saved successfully'
            })
        };

    } catch (error) {
        console.error('❌ TM username verification error:', error);

        if (error.response?.status === 404) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ error: 'TM username not found' })
            };
        }

        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Failed to verify TM username' })
        };
    }
}
