// lambda/getFeedback.js - Get feedback for admin users
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// Database connection using Neon with connection reuse
let dbClient = null;

const getDbConnection = async () => {
    if (!dbClient) {
        const connectionString = process.env.NEON_DB_CONNECTION_STRING;
        dbClient = new Client({
            connectionString: connectionString,
            ssl: {
                rejectUnauthorized: true
            }
        });
        await dbClient.connect();
        console.log('✅ Connected to Neon database');
    }
    return dbClient;
};

const closeDbConnection = async () => {
    if (dbClient) {
        await dbClient.end();
        dbClient = null;
        console.log('🔌 Database connection closed');
    }
};

exports.handler = async (event, context) => {
    console.log('📋 Get Feedback Lambda triggered!');

    // Security headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    try {
        // Get user info from JWT token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({
                    error: 'Authentication required'
                })
            };
        }

        const token = authHeader.substring(7);
        let userRole;

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userRole = decoded.role;
        } catch (error) {
            console.error('❌ Error verifying JWT token:', error);
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({
                    error: 'Invalid token'
                })
            };
        }

        // Check if user is admin
        if (userRole !== 'admin') {
            return {
                statusCode: 403,
                headers: headers,
                body: JSON.stringify({
                    error: 'Admin access required'
                })
            };
        }

        const client = await getDbConnection();

        // Get feedback from database, ordered by most recent first
        const feedbackQuery = `
            SELECT id, username, message, type, created_at
            FROM feedback
            ORDER BY created_at DESC
            LIMIT 100
        `;

        const { rows } = await client.query(feedbackQuery);

        console.log(`📋 Retrieved ${rows.length} feedback entries`);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                feedback: rows
            })
        };

    } catch (error) {
        console.error('❌ Get Feedback Lambda error:', error);

        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                error: 'Internal server error'
            })
        };
    } finally {
        await closeDbConnection();
    }
};
