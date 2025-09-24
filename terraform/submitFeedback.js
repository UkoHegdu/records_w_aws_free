// lambda/submitFeedback.js - Submit user feedback
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

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
    console.log('💬 Submit Feedback Lambda triggered!');

    // Security headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
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
        // Safe JSON parsing with size limits
        const bodySize = event.body ? event.body.length : 0;
        if (bodySize > 1024 * 1024) { // 1MB limit
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ error: 'Request body too large' })
            };
        }

        const body = JSON.parse(event.body || '{}');

        // Additional safety check for prototype pollution
        if (body && typeof body === 'object' && body.constructor !== Object) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ error: 'Invalid request body' })
            };
        }

        const { message, type = 'general' } = body;

        // Rate limiting per user
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.user_id;
                if (!checkRateLimit(`submit_feedback:${userId}`, 5, 300000)) { // 5 feedback per 5 minutes
                    return {
                        statusCode: 429,
                        headers: headers,
                        body: JSON.stringify({
                            error: 'Rate limit exceeded. Please wait before submitting more feedback.'
                        })
                    };
                }
            } catch (tokenError) {
                // Continue with validation if token parsing fails
            }
        }

        // Validate and sanitize inputs
        const messageValidation = validateAndSanitizeInput(message, 'string', { required: true, maxLength: 2000 });
        const typeValidation = validateAndSanitizeInput(type, 'string', { required: false, maxLength: 50 });

        if (!messageValidation.isValid) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: messageValidation.error
                })
            };
        }

        if (!typeValidation.isValid) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: typeValidation.error
                })
            };
        }

        // Get user info from JWT token
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
        let userId;

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.user_id;
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

        const client = await getDbConnection();

        // Get username from database
        const userQuery = `SELECT username FROM users WHERE id = $1`;
        const userResult = await client.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({
                    error: 'User not found'
                })
            };
        }

        const username = userResult.rows[0].username;

        // Insert feedback into database
        const insertQuery = `
            INSERT INTO feedback (user_id, username, message, type, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id
        `;

        const { rows } = await client.query(insertQuery, [
            userId,
            username,
            messageValidation.sanitized,
            typeValidation.sanitized
        ]);

        console.log(`✅ Feedback submitted by ${username} (ID: ${rows[0].id})`);

        return {
            statusCode: 201,
            headers: headers,
            body: JSON.stringify({
                message: 'Feedback submitted successfully',
                feedback_id: rows[0].id
            })
        };

    } catch (error) {
        console.error('❌ Submit Feedback Lambda error:', error);

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
