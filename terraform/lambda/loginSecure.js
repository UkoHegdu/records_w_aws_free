// lambda/loginSecure.js - Example of secure login with input validation
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

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
    console.log('🔐 Secure Login Lambda triggered!', event);

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

    // Rate limiting
    const clientIP = event.requestContext?.identity?.sourceIp || 'unknown';
    if (!checkRateLimit(`login:${clientIP}`, 5, 300000)) { // 5 attempts per 5 minutes
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ msg: 'Too many login attempts. Please try again later.' })
        };
    }

    // Validate and sanitize inputs
    const emailValidation = validateAndSanitizeInput(body.email, 'email', { required: true });
    const passwordValidation = validateAndSanitizeInput(body.password, 'password', { required: true });

    if (!emailValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: emailValidation.error })
        };
    }

    if (!passwordValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: passwordValidation.error })
        };
    }

    const { sanitized: email } = emailValidation;
    const password = passwordValidation.sanitized;

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Find user by email
        const result = await client.query(
            'SELECT id, email, password, username FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ msg: 'Invalid credentials' })
            };
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ msg: 'Invalid credentials' })
            };
        }

        // Generate JWT tokens
        const accessToken = jwt.sign(
            { user_id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { user_id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('✅ User logged in successfully:', user.email);

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username
                }
            })
        };

    } catch (error) {
        console.error('❌ Login error:', error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ msg: 'Internal server error' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};
