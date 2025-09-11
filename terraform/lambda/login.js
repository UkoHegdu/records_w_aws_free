// lambda/login.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

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

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        console.error('Error parsing request body:', error);
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Invalid JSON in request body' })
        };
    }

    const { email, password } = body;

    if (!email || !password) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Email and password are required' })
        };
    }

    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Query user by email
        const user = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        console.log("DB user query result:", user.rows);

        if (!user.rows.length) {
            console.log("No user found with that email.");
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({ msg: 'Invalid credentials' })
            };
        }

        // Compare password
        const match = await bcrypt.compare(password, user.rows[0].password);
        console.log("Password match result:", match);
        console.log("user ", email, " tried to log in");

        if (!match) {
            console.log("Password does not match.");
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
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
                session_id: sessionId
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
