// lambda/refreshToken.js
const jwt = require('jsonwebtoken');
const { getSession, updateSession } = require('../sessionStore');

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

        // Get session from memory (backend has no AWS)
        const session = getSession(decoded.session_id);

        if (!session) {
            console.log('❌ Session not found');
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

        // Update session in memory (backend has no AWS)
        updateSession(session.session_id, {
            refresh_token: newRefreshToken,
            last_accessed: new Date().toISOString()
        });

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
