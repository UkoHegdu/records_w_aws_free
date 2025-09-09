// lambda/shared/apiClient.js
const axios = require('axios');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Token refresh logic
const getValidAccessToken = async () => {
    try {
        // 1) Check DynamoDB for tokens
        const accessTokenResult = await dynamoClient.send(new GetItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: marshall({
                provider: 'auth',
                token_type: 'access'
            })
        }));

        const refreshTokenResult = await dynamoClient.send(new GetItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: marshall({
                provider: 'auth',
                token_type: 'refresh'
            })
        }));

        const accessTokenItem = accessTokenResult.Item ? unmarshall(accessTokenResult.Item) : null;
        const refreshTokenItem = refreshTokenResult.Item ? unmarshall(refreshTokenResult.Item) : null;

        // 2) Check if access token is newer than 24 hours
        const now = Date.now();
        const tokenAge = now - (accessTokenItem?.created_at || 0);
        const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        if (accessTokenItem?.token && tokenAge < twentyFourHours) {
            console.log('✅ Using existing access token (less than 24 hours old)');
            return accessTokenItem.token;
        }

        // 3) Token is older than 24 hours or doesn't exist, try to refresh
        if (refreshTokenItem?.token) {
            console.log('🔄 Access token is older than 24 hours, attempting refresh...');
            try {
                const newTokens = await refreshToken(refreshTokenItem.token);
                return newTokens.accessToken;
            } catch (refreshError) {
                console.log('🔄 Refresh failed, attempting full login...');
                const newTokens = await performLogin();
                return newTokens.accessToken;
            }
        } else {
            // 4) No refresh token, perform full login
            console.log('🔑 No refresh token found, performing full login...');
            const newTokens = await performLogin();
            return newTokens.accessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid access token:', error);
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

        // Store tokens with current timestamp
        await storeTokens(newAccessToken, newRefreshToken);
        console.log('✅ Token refresh successful');

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.error('❌ Token refresh failed:', error.message);
        throw error;
    }
};

// Full login function
const performLogin = async () => {
    try {
        const credentials = Buffer.from(process.env.AUTHORIZATION);

        console.log('📤 Performing full login...');

        const response = await axios.post(process.env.AUTH_API_URL,
            { audience: 'NadeoLiveServices' },
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json',
                    'User-Agent': process.env.USER_AGENT
                }
            }
        );

        const { accessToken, refreshToken } = response.data;

        if (!accessToken || !refreshToken) {
            throw new Error('Missing tokens in response');
        }

        // Store tokens with current timestamp
        await storeTokens(accessToken, refreshToken);
        console.log('✅ Full login successful');

        return { accessToken, refreshToken };
    } catch (error) {
        console.error('❌ Full login failed:', error.message);
        throw error;
    }
};

// Store tokens in DynamoDB with timestamp
const storeTokens = async (accessToken, refreshToken) => {
    try {
        const now = Date.now();
        const accessTokenExpiry = Math.floor(now / 1000) + (24 * 60 * 60); // 24 hours
        const refreshTokenExpiry = Math.floor(now / 1000) + (30 * 24 * 60 * 60); // 30 days

        await dynamoClient.send(new PutItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Item: marshall({
                provider: 'auth',
                token_type: 'access',
                token: accessToken,
                created_at: now,
                expires_at: accessTokenExpiry
            })
        }));

        await dynamoClient.send(new PutItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Item: marshall({
                provider: 'auth',
                token_type: 'refresh',
                token: refreshToken,
                created_at: now,
                expires_at: refreshTokenExpiry
            })
        }));

        console.log('✅ Tokens stored with timestamp');
    } catch (error) {
        console.error('Error storing tokens in DynamoDB:', error);
        throw error;
    }
};

// Main API client
const apiClient = {
    async get(url, options = {}) {
        return this.request({ ...options, method: 'GET', url });
    },

    async post(url, data, options = {}) {
        return this.request({ ...options, method: 'POST', url, data });
    },

    async request(config) {
        const maxRetries = 1;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
            try {
                // Get valid access token (with 24-hour check)
                const accessToken = await getValidAccessToken();

                const response = await axios({
                    ...config,
                    headers: {
                        'Authorization': `nadeo_v1 t=${accessToken}`,
                        'Content-Type': 'application/json',
                        ...config.headers
                    }
                });

                return response;
            } catch (error) {
                if (error.response?.status === 401 && retryCount < maxRetries) {
                    retryCount++;
                    console.log(`🔄 Got 401, retry attempt ${retryCount}/${maxRetries}`);

                    // Force refresh token on 401
                    try {
                        const refreshTokenResult = await dynamoClient.send(new GetItemCommand({
                            TableName: process.env.DYNAMODB_TABLE_NAME,
                            Key: marshall({
                                provider: 'auth',
                                token_type: 'refresh'
                            })
                        }));

                        if (refreshTokenResult.Item) {
                            const refreshTokenItem = unmarshall(refreshTokenResult.Item);
                            const newTokens = await refreshToken(refreshTokenItem.token);
                            console.log('🔄 Token refreshed after 401, retrying request...');
                            continue; // Retry with new token
                        } else {
                            console.log('🔄 No refresh token, performing full login...');
                            await performLogin();
                            continue; // Retry with new token
                        }
                    } catch (refreshError) {
                        console.error('❌ Token refresh after 401 failed:', refreshError.message);
                        throw refreshError;
                    }
                }
                throw error;
            }
        }
    }
};

module.exports = apiClient;
