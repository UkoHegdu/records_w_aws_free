// lambda/getUserProfile.js
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

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
    console.log('👤 GetUserProfile Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    // Handle GET request
    if (event.httpMethod === 'GET') {
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

            // Fetch user information
            const result = await client.query(
                'SELECT id, email, username, created_at FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return {
                    statusCode: 404,
                    headers: headers,
                    body: JSON.stringify({ msg: 'User not found' })
                };
            }

            const user = result.rows[0];
            console.log(`✅ Found user: ${user.username}`);

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    createdAt: user.created_at
                })
            };

        } catch (err) {
            console.error('❌ Get user profile error:', err);
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ msg: 'Failed to fetch user profile' })
            };
        } finally {
            await client.end();
            console.log('🔌 Database connection closed');
        }
    }

    return {
        statusCode: 405,
        headers: headers,
        body: JSON.stringify({ msg: 'Method not allowed' })
    };
};
