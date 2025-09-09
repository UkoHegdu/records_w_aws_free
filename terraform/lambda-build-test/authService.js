// lambda/authService.js
const axios = require('axios');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const AUTH_API_URL = process.env.AUTH_API_URL;
const AUTHORIZATION = process.env.AUTHORIZATION;
const USER_AGENT = process.env.USER_AGENT;

// Token storage functions
const getTokens = async (provider) => {
    try {
        const accessTokenResult = await docClient.send(new GetItemCommand({
            TableName: TABLE_NAME,
            Key: {
                provider: provider,
                token_type: 'access'
            }
        }));

        const refreshTokenResult = await docClient.send(new GetItemCommand({
            TableName: TABLE_NAME,
            Key: {
                provider: provider,
                token_type: 'refresh'
            }
        }));

        return {
            accessToken: accessTokenResult.Item?.token || null,
            refreshToken: refreshTokenResult.Item?.token || null
        };
    } catch (error) {
        console.error('Error getting tokens from DynamoDB:', error);
        return { accessToken: null, refreshToken: null };
    }
};

const setTokens = async (provider, accessToken, refreshToken) => {
    try {
        const accessTokenExpiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
        const refreshTokenExpiry = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

        await docClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: {
                provider: provider,
                token_type: 'access',
                token: accessToken,
                expires_at: accessTokenExpiry
            }
        }));

        await docClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: {
                provider: provider,
                token_type: 'refresh',
                token: refreshToken,
                expires_at: refreshTokenExpiry
            }
        }));

        console.log(`✅ Tokens stored for ${provider}`);
    } catch (error) {
        console.error('Error storing tokens in DynamoDB:', error);
        throw error;
    }
};

// Login function
const login = async () => {
    try {
        const credentials = Buffer.from(AUTHORIZATION);

        console.log('📤 Sending login request with headers:', {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT
        });

        const response = await axios.post(AUTH_API_URL,
            { audience: 'NadeoLiveServices' },
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT
                }
            }
        );

        const { accessToken, refreshToken } = response.data;

        if (!accessToken || !refreshToken) {
            console.error('⚠️ Login successful but tokens are missing in response!');
            throw new Error('Missing tokens in response');
        }

        await setTokens('auth', accessToken, refreshToken);
        console.log('✅ Logged in successfully. Tokens set.');

        return { accessToken, refreshToken };
    } catch (error) {
        if (error.response) {
            console.error(`❌ Login failed with status ${error.response.status}:`, error.response.data);
        } else if (error.request) {
            console.error('❌ Login request made, but no response received:', error.request);
        } else {
            console.error('❌ Unexpected error during login:', error.message);
        }
        throw error;
    }
};

// Refresh token function
const refreshToken = async (refreshTokenValue) => {
    try {
        console.log('🔄 Attempting token refresh...');

        const response = await axios.post(
            'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
            {},
            {
                headers: {
                    Authorization: `nadeo_v1 t=${refreshTokenValue}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const newAccessToken = response.data.accessToken;
        const newRefreshToken = response.data.refreshToken || refreshTokenValue;

        await setTokens('auth', newAccessToken, newRefreshToken);
        console.log('✅ Token refresh successful');

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.error('❌ Token refresh failed:', error.message);
        throw error;
    }
};

// Main function to get valid access token
const getValidAccessToken = async () => {
    try {
        const { accessToken, refreshToken: storedRefreshToken } = await getTokens('auth');

        if (accessToken) {
            // Token exists, return it (DynamoDB TTL will handle expiration)
            return accessToken;
        }

        if (storedRefreshToken) {
            try {
                // Try to refresh the token
                const { accessToken: newAccessToken } = await refreshToken(storedRefreshToken);
                return newAccessToken;
            } catch (refreshError) {
                console.log('🔄 Refresh failed, attempting full login...');
                // Refresh failed, do full login
                const { accessToken: loginAccessToken } = await login();
                return loginAccessToken;
            }
        } else {
            // No tokens exist, do full login
            console.log('🔑 No tokens found, performing initial login...');
            const { accessToken: loginAccessToken } = await login();
            return loginAccessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid access token:', error);
        throw error;
    }
};

exports.handler = async (event, context) => {
    console.log('🔐 Auth Service Lambda triggered!', event);

    try {
        const { action } = event;

        switch (action) {
            case 'getValidToken':
                const accessToken = await getValidAccessToken();
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS'
                    },
                    body: JSON.stringify({ accessToken })
                };

            case 'login':
                const loginResult = await login();
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS'
                    },
                    body: JSON.stringify(loginResult)
                };

            case 'refresh':
                const { refreshToken: tokenToRefresh } = event;
                const refreshResult = await refreshToken(tokenToRefresh);
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS'
                    },
                    body: JSON.stringify(refreshResult)
                };

            default:
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS'
                    },
                    body: JSON.stringify({ error: 'Invalid action. Use: getValidToken, login, or refresh' })
                };
        }
    } catch (error) {
        console.error('❌ Auth Service error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
