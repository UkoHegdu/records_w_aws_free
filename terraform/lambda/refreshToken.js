// lambda/refreshToken.js
const jwt = require('jsonwebtoken');
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
    console.log('🔄 Refresh Token Lambda triggered!', event);

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

    const { refresh_token } = body;

    if (!refresh_token) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Refresh token is required' })
        };
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
        console.log('✅ Refresh token verified for user:', decoded.user_id);

        // Get session from DynamoDB
        const getSessionParams = {
            TableName: process.env.USER_SESSIONS_TABLE_NAME,
            Key: marshall({
                session_id: decoded.session_id
            })
        };

        const sessionResult = await dynamoClient.send(new GetItemCommand(getSessionParams));

        if (!sessionResult.Item) {
            console.log('❌ Session not found in DynamoDB');
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({ msg: 'Invalid refresh token' })
            };
        }

        const session = unmarshall(sessionResult.Item);
        console.log('✅ Session found:', session.session_id);

        // Check if session is still valid
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at < now) {
            console.log('❌ Session expired');
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({ msg: 'Refresh token expired' })
            };
        }

        // Generate new access token (15 minutes)
        const newAccessToken = jwt.sign(
            {
                user_id: session.user_id,
                session_id: session.session_id,
                role: session.role || 'user'
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Generate new refresh token (7 days)
        const newRefreshToken = jwt.sign(
            {
                user_id: session.user_id,
                session_id: session.session_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Update session with new refresh token and last accessed time
        const updateSessionParams = {
            TableName: process.env.USER_SESSIONS_TABLE_NAME,
            Key: marshall({
                session_id: session.session_id
            }),
            UpdateExpression: 'SET refresh_token = :refresh_token, last_accessed = :last_accessed',
            ExpressionAttributeValues: marshall({
                ':refresh_token': newRefreshToken,
                ':last_accessed': new Date().toISOString()
            })
        };

        await dynamoClient.send(new UpdateItemCommand(updateSessionParams));

        console.log('✅ New tokens generated for user:', session.user_id);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                access_token: newAccessToken,
                refresh_token: newRefreshToken,
                expires_in: 900, // 15 minutes
                token_type: 'Bearer'
            })
        };

    } catch (error) {
        console.error('❌ Refresh token error:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({ msg: 'Invalid refresh token' })
            };
        }

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ msg: 'Internal server error' })
        };
    }
};
