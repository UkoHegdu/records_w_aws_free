// lambda/shared/oauthApiClient.js
const axios = require('axios');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// OAuth2 token refresh logic
const getValidOAuth2Token = async () => {
    try {
        // 1) Check DynamoDB for OAuth2 tokens
        const accessTokenResult = await dynamoClient.send(new GetItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: marshall({
                provider: 'oauth2',
                token_type: 'access'
            })
        }));

        const refreshTokenResult = await dynamoClient.send(new GetItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: marshall({
                provider: 'oauth2',
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
            console.log('✅ Using existing OAuth2 access token (less than 24 hours old)');
            return accessTokenItem.token;
        }

        // 3) Token is older than 24 hours or doesn't exist, try to refresh
        if (refreshTokenItem?.token) {
            console.log('🔄 OAuth2 access token is older than 24 hours, attempting refresh...');
            try {
                const newTokens = await refreshOAuth2Token(refreshTokenItem.token);
                return newTokens.accessToken;
            } catch (refreshError) {
                console.log('🔄 OAuth2 refresh failed, attempting full login...');
                const newTokens = await performOAuth2Login();
                return newTokens.accessToken;
            }
        } else {
            // 4) No refresh token, perform full login
            console.log('🔑 No OAuth2 refresh token found, performing full login...');
            const newTokens = await performOAuth2Login();
            return newTokens.accessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid OAuth2 access token:', error);
        throw error;
    }
};

// Refresh OAuth2 token function
const refreshOAuth2Token = async (refreshTokenValue) => {
    try {
        console.log('🔄 Attempting OAuth2 token refresh...');

        const response = await axios.post(
            'https://api.trackmania.com/api/access_token',
            {
                grant_type: 'refresh_token',
                refresh_token: refreshTokenValue,
                client_id: process.env.OCLIENT_ID,
                client_secret: process.env.OCLIENT_SECRET
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        );

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token || refreshTokenValue;

        // Store tokens with current timestamp
        await storeOAuth2Tokens(newAccessToken, newRefreshToken);
        console.log('✅ OAuth2 token refresh successful');

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.error('❌ OAuth2 token refresh failed:', error.message);
        throw error;
    }
};

// Full OAuth2 login function
const performOAuth2Login = async () => {
    try {
        console.log('📤 Performing full OAuth2 login...');

        const response = await axios.post(
            'https://api.trackmania.com/api/access_token',
            {
                grant_type: 'client_credentials',
                client_id: process.env.OCLIENT_ID,
                client_secret: process.env.OCLIENT_SECRET
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        );

        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token;

        if (!accessToken) {
            throw new Error('Missing access token in OAuth2 response');
        }

        // Store tokens with current timestamp
        await storeOAuth2Tokens(accessToken, refreshToken);
        console.log('✅ Full OAuth2 login successful');

        return { accessToken, refreshToken };
    } catch (error) {
        console.error('❌ Full OAuth2 login failed:', error.message);
        throw error;
    }
};

// Store OAuth2 tokens in DynamoDB with timestamp
const storeOAuth2Tokens = async (accessToken, refreshToken) => {
    try {
        const now = Date.now();
        const accessTokenExpiry = Math.floor(now / 1000) + (24 * 60 * 60); // 24 hours
        const refreshTokenExpiry = Math.floor(now / 1000) + (30 * 24 * 60 * 60); // 30 days

        await dynamoClient.send(new PutItemCommand({
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Item: marshall({
                provider: 'oauth2',
                token_type: 'access',
                token: accessToken,
                created_at: now,
                expires_at: accessTokenExpiry
            })
        }));

        if (refreshToken) {
            await dynamoClient.send(new PutItemCommand({
                TableName: process.env.DYNAMODB_TABLE_NAME,
                Item: marshall({
                    provider: 'oauth2',
                    token_type: 'refresh',
                    token: refreshToken,
                    created_at: now,
                    expires_at: refreshTokenExpiry
                })
            }));
        }

        console.log('✅ OAuth2 tokens stored with timestamp');
    } catch (error) {
        console.error('Error storing OAuth2 tokens in DynamoDB:', error);
        throw error;
    }
};

// Main OAuth2 API client
const oauthApiClient = {
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
                // Get valid OAuth2 access token (with 24-hour check)
                const accessToken = await getValidOAuth2Token();

                const response = await axios({
                    ...config,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
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
                                provider: 'oauth2',
                                token_type: 'refresh'
                            })
                        }));

                        if (refreshTokenResult.Item) {
                            const refreshTokenItem = unmarshall(refreshTokenResult.Item);
                            const newTokens = await refreshOAuth2Token(refreshTokenItem.token);
                            console.log('🔄 OAuth2 token refreshed after 401, retrying request...');
                            continue; // Retry with new token
                        } else {
                            console.log('🔄 No OAuth2 refresh token, performing full login...');
                            await performOAuth2Login();
                            continue; // Retry with new token
                        }
                    } catch (refreshError) {
                        console.error('❌ OAuth2 token refresh after 401 failed:', refreshError.message);
                        throw refreshError;
                    }
                }
                throw error;
            }
        }
    }
};

module.exports = oauthApiClient;
