// lambda/httpClientOauth.js
const axios = require('axios');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize Lambda client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// Call the OAuth2 service Lambda to get a valid access token
const getValidOAuth2Token = async () => {
    try {
        const command = new InvokeCommand({
            FunctionName: process.env.OAUTH_SERVICE_FUNCTION_NAME,
            Payload: JSON.stringify({ action: 'getValidToken' })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(Buffer.from(response.Payload).toString());

        if (result.statusCode === 200) {
            const body = JSON.parse(result.body);
            return body.accessToken;
        } else {
            throw new Error('Failed to get OAuth2 access token from OAuth service');
        }
    } catch (error) {
        console.error('Error calling OAuth service:', error);
        throw error;
    }
};

// Create an authenticated HTTP client for OAuth2 API calls
const createOAuth2Client = (baseURL) => {
    const instance = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        }
    });

    // Add OAuth2 access token to every request
    instance.interceptors.request.use(async (config) => {
        try {
            const token = await getValidOAuth2Token();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error('Failed to get OAuth2 token for request:', error);
            // Continue without token - the request will likely fail with 401
        }
        return config;
    });

    // Handle 401 responses: refresh token and retry request
    instance.interceptors.response.use(
        response => response,
        async error => {
            if (error.response?.status === 401) {
                console.log('📥 Received 401, refreshing OAuth2 token and retrying...');

                try {
                    // Get a fresh token
                    const newToken = await getValidOAuth2Token();
                    error.config.headers.Authorization = `Bearer ${newToken}`;

                    console.log('🔁 Retrying request with refreshed OAuth2 token...');
                    return instance(error.config);
                } catch (refreshError) {
                    console.error('❌ OAuth2 token refresh failed:', refreshError);
                    return Promise.reject(error);
                }
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

module.exports = {
    createOAuth2Client,
    getValidOAuth2Token
};
