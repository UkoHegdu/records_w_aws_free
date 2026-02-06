// lambda/register.js
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

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
    console.log('📝 Register Lambda triggered!', event);

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
    if (!checkRateLimit(`register:${clientIP}`, 3, 300000)) { // 3 attempts per 5 minutes
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ msg: 'Too many registration attempts. Please try again later.' })
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
    const emailValidation = validateAndSanitizeInput(body.email, 'email', { required: true });
    const passwordValidation = validateAndSanitizeInput(body.password, 'password', { required: true });
    const usernameValidation = validateAndSanitizeInput(body.username, 'username', { required: true });

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

    if (!usernameValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ msg: usernameValidation.error })
        };
    }

    const { sanitized: email } = emailValidation;
    const password = passwordValidation.sanitized;
    const { sanitized: username } = usernameValidation;

    console.log('Welcome to REGISTER FUNCTION!!!');

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Check if email already exists
        const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingEmail.rows.length > 0) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ msg: 'Email already registered' })
            };
        }

        // Check if username already exists
        const existingUsername = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existingUsername.rows.length > 0) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ msg: 'Username already selected' })
            };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await client.query(
            'INSERT INTO users (email, password, username) VALUES ($1, $2, $3)',
            [email, hashedPassword, username]
        );

        console.log('✅ User registered successfully');

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'User registered successfully' })
        };

    } catch (err) {
        console.error('❌ Registration error:', err);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Registration failed due to server error' })
        };
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};
