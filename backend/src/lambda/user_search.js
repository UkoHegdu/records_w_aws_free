// lambda/user_search.js
const axios = require('axios');
const { validateAndSanitizeInput, checkRateLimit } = require('./securityUtils');

exports.handler = async (event, context) => {
    console.log('🔥 userSearch Lambda triggered!', event);

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

    // Rate limiting
    const clientIP = event.requestContext?.identity?.sourceIp || 'unknown';
    if (!checkRateLimit(`user_search:${clientIP}`, 20, 60000)) { // 20 searches per minute
        return {
            statusCode: 429,
            headers: headers,
            body: JSON.stringify({ error: 'Too many search requests. Please try again later.' })
        };
    }

    const { username } = event.queryStringParameters || {};

    // Validate and sanitize username input
    const usernameValidation = validateAndSanitizeInput(username, 'username', { required: true });

    if (!usernameValidation.isValid) {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ error: usernameValidation.error })
        };
    }

    const { sanitized: sanitizedUsername } = usernameValidation;

    const url = `https://trackmania.exchange/api/users?Name=${encodeURIComponent(sanitizedUsername)}&fields=Name%2CUserId`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (data.More) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    message: 'Too many results, please write an exact username'
                })
            };
        }

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(data.Results)
        };
    } catch (error) {
        console.error('Error searching user:', error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
