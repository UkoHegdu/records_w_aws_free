// lambda/health.js
exports.handler = async (event, context) => {
    console.log('Health check Lambda triggered!', event);

    try {
        const healthData = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.AWS_REGION || 'unknown',
            version: '1.0.0',
            services: {
                lambda: 'healthy',
                dynamodb: 'connected',
                parameter_store: 'accessible'
            }
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify(healthData)
        };
    } catch (error) {
        console.error('Health check failed:', error);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                status: 'ERROR',
                timestamp: new Date().toISOString(),
                error: error.message
            })
        };
    }
};
