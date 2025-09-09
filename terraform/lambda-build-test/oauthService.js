// lambda/oauthService.js
const axios = require('axios');
const qs = require('qs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const OCLIENT_ID = process.env.OCLIENT_ID;
const OCLIENT_SECRET = process.env.OCLIENT_SECRET;

// Token storage functions (reuse from authService)
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

const setTokens = async (provider, accessToken, refreshToken = null) => {
    try {
        // OAuth2 tokens typically expire in 1 hour (3600 seconds)
        const accessTokenExpiry = Math.floor(Date.now() / 1000) + 3600;

        await docClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: {
                provider: provider,
                token_type: 'access',
                token: accessToken,
                expires_at: accessTokenExpiry
            }
        }));

        // Only store refresh token if provided (OAuth2 client_credentials doesn't have refresh tokens)
        if (refreshToken) {
            const refreshTokenExpiry = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

            await docClient.send(new PutItemCommand({
                TableName: TABLE_NAME,
                Item: {
                    provider: provider,
                    token_type: 'refresh',
                    token: refreshToken,
                    expires_at: refreshTokenExpiry
                }
            }));
        }

        console.log(`✅ OAuth2 tokens stored for ${provider}`);
    } catch (error) {
        console.error('Error storing OAuth2 tokens in DynamoDB:', error);
        throw error;
    }
};

// OAuth2 login function
const loginOauth = async () => {
    try {
        if (!OCLIENT_ID || !OCLIENT_SECRET) {
            throw new Error('OAuth client ID or secret is missing from environment variables.');
        }

        console.log('🔐 Starting OAuth2 client_credentials flow...');

        const response = await axios.post(
            'https://api.trackmania.com/api/access_token',
            qs.stringify({
                grant_type: 'client_credentials',
                client_id: OCLIENT_ID,
                client_secret: OCLIENT_SECRET,
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        const { access_token, expires_in } = response.data;

        if (!access_token) {
            console.error('⚠️ OAuth login succeeded but no token was returned.');
            throw new Error('No access token received from OAuth2 API');
        }

        await setTokens('oauth2', access_token, null); // OAuth2 client_credentials doesn't have refresh tokens
        console.log(`✅ OAuth2 token fetched (valid for ${expires_in}s)`);

        return { accessToken: access_token, expiresIn: expires_in };
    } catch (error) {
        if (error.response) {
            console.error(`❌ OAuth login failed with status ${error.response.status}:`, error.response.data);
        } else if (error.request) {
            console.error('❌ OAuth request made, but no response received:', error.request);
        } else {
            console.error('❌ Unexpected error during OAuth login:', error.message);
        }
        throw error;
    }
};

// OAuth2 refresh function (for client_credentials, this is just a re-login)
const refreshOauth = async () => {
    try {
        console.log('🔄 OAuth2 client_credentials flow - refreshing token...');
        // For client_credentials grant type, we need to do a full login since there's no refresh token
        return await loginOauth();
    } catch (error) {
        console.error('❌ OAuth2 refresh failed:', error.message);
        throw error;
    }
};

// Main function to get valid OAuth2 access token
const getValidOAuth2Token = async () => {
    try {
        const { accessToken } = await getTokens('oauth2');

        if (accessToken) {
            // Token exists, return it (DynamoDB TTL will handle expiration)
            return accessToken;
        } else {
            // No token exists, do full login
            console.log('🔑 No OAuth2 token found, performing initial login...');
            const { accessToken: loginAccessToken } = await loginOauth();
            return loginAccessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid OAuth2 access token:', error);
        throw error;
    }
};

exports.handler = async (event, context) => {
    console.log('🔐 OAuth2 Service Lambda triggered!', event);

    try {
        const { action } = event;

        switch (action) {
            case 'getValidToken':
                const accessToken = await getValidOAuth2Token();
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
                const loginResult = await loginOauth();
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
                const refreshResult = await refreshOauth();
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
        console.error('❌ OAuth2 Service error:', error);
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
