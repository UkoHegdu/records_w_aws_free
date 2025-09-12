// lambda/testAdvanced.js - Advanced test function with JWT validation
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
    console.log('🧪 Advanced Test Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    };

    // Handle OPTIONS request for CORS
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
            body: JSON.stringify({
                success: false,
                message: 'Unauthorized - invalid or missing token',
                lambda_called: 0
            })
        };
    }

    console.log(`🔐 Authenticated user ID: ${userId}`);

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Get user information from database
        const userResult = await client.query(
            'SELECT username, email FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({
                    success: false,
                    message: 'User not found',
                    lambda_called: 0
                })
            };
        }

        const { username, email } = userResult.rows[0];
        console.log(`✅ Found user: ${username} (${email})`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                message: 'Advanced Test Lambda called successfully!',
                lambda_called: 1,
                timestamp: new Date().toISOString(),
                method: event.httpMethod,
                path: event.path,
                user: {
                    id: userId,
                    username: username,
                    email: email
                }
            })
        };

    } catch (err) {
        console.error('❌ Advanced test error:', err);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                success: false,
                message: 'Database error',
                lambda_called: 0,
                error: err.message
            })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};
