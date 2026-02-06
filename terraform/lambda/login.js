// lambda/login.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

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

exports.handler = async (event, context) => {
    console.log('🔐 Login Lambda triggered!', event);

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

    // Rate limiting
    const clientIP = event.requestContext?.identity?.sourceIp || 'unknown';
    if (!checkRateLimit(`login:${clientIP}`, 5, 300000)) { // 5 attempts per 5 minutes
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ msg: 'Too many login attempts. Please try again later.' })
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

    // Validate and sanitize inputs (stricter: format checks via securityUtils)
    // Frontend may send email or username; validate by format
    const emailOrUsername = body.email || body.username;
    const isEmail = typeof emailOrUsername === 'string' && emailOrUsername.includes('@');
    const identifierValidation = validateAndSanitizeInput(
        emailOrUsername,
        isEmail ? 'email' : 'username',
        { required: true }
    );

    if (!identifierValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: identifierValidation.error })
        };
    }

    const passwordValidation = validateAndSanitizeInput(body.password, 'password', { required: true });
    if (!passwordValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: passwordValidation.error })
        };
    }

    const { sanitized: emailOrUsernameSanitized } = identifierValidation;
    const password = body.password; // Use raw password for bcrypt.compare

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Query user by email or username
        const user = await client.query('SELECT * FROM users WHERE email = $1 OR username = $1', [emailOrUsernameSanitized]);
        console.log("DB user query result:", user.rows);

        if (!user.rows.length) {
            console.log("No user found with that email/username.");
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ msg: 'Invalid credentials' })
            };
        }

        // Compare password
        const match = await bcrypt.compare(password, user.rows[0].password);
        console.log("Password match result:", match);
        console.log("user ", emailOrUsernameSanitized, " tried to log in");

        if (!match) {
            console.log("Password does not match.");
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ msg: 'Invalid credentials' })
            };
        }

        // Generate session ID
        const sessionId = uuidv4();
        const userId = user.rows[0].id.toString();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Generate access token (15 minutes)
        const accessToken = jwt.sign(
            {
                user_id: userId,
                session_id: sessionId,
                role: user.rows[0].role || 'user'
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Generate refresh token (7 days)
        const refreshToken = jwt.sign(
            {
                user_id: userId,
                session_id: sessionId
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Store session in DynamoDB
        const sessionData = {
            session_id: sessionId,
            user_id: userId,
            role: user.rows[0].role || 'user',
            access_token: accessToken,
            refresh_token: refreshToken,
            created_at: now.toISOString(),
            expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp for TTL
            last_accessed: now.toISOString(),
            user_agent: event.headers['User-Agent'] || 'Unknown',
            ip_address: event.requestContext?.identity?.sourceIp || 'Unknown'
        };

        const putSessionParams = {
            TableName: process.env.USER_SESSIONS_TABLE_NAME,
            Item: marshall(sessionData)
        };

        await dynamoClient.send(new PutItemCommand(putSessionParams));
        console.log('✅ Session created in DynamoDB:', sessionId);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 900, // 15 minutes
                token_type: 'Bearer',
                user: {
                    id: userId,
                    username: user.rows[0].username,
                    email: user.rows[0].email
                }
            })
        };

    } catch (err) {
        console.error('❌ Login error:', err);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Login failed due to server error' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};
