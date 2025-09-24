// lambda/test.js - Simple test function to isolate API Gateway issues

exports.handler = async (event, context) => {
    console.log('🧪 Test Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    };

    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    // Return success response
    return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({
            success: true,
            message: 'Test Lambda called successfully!',
            lambda_called: 1,
            timestamp: new Date().toISOString(),
            method: event.httpMethod,
            path: event.path
        })
    };
};
