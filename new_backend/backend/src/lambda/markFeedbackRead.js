// lambda/markFeedbackRead.js - Mark feedback as read (admin only)
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString,
        ssl: { rejectUnauthorized: true }
    });
};

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }

        const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: 'Admin access required' })
            };
        }

        const feedbackId = event.pathParameters?.id;
        if (!feedbackId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Feedback ID required' })
            };
        }

        const client = getDbConnection();
        await client.connect();

        const result = await client.query(
            'UPDATE feedback SET read_at = COALESCE(read_at, NOW()) WHERE id = $1',
            [feedbackId]
        );
        await client.end();

        if (result.rowCount === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Feedback not found' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Feedback marked as read' })
        };
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid token' })
            };
        }
        console.error('markFeedbackRead error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
