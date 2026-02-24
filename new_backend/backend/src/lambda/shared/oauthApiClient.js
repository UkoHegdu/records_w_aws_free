// lambda/shared/oauthApiClient.js - Backend: Postgres token store (no DynamoDB)
const axios = require('axios');
const tokenStore = require('../../tokenStore');

const PROVIDER = 'oauth2';

const getValidOAuth2Token = async () => {
    try {
        const { access: accessItem, refresh: refreshItem } = await tokenStore.getTokens(PROVIDER);

        const now = Date.now();
        const tokenAge = now - (accessItem?.created_at || 0);
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (accessItem?.token && tokenAge < twentyFourHours) {
            return accessItem.token;
        }

        if (refreshItem?.token) {
            console.log('🔄 OAuth2 access token is older than 24 hours, attempting refresh...');
            try {
                const newTokens = await refreshOAuth2Token(refreshItem.token);
                return newTokens.accessToken;
            } catch (refreshError) {
                console.log('🔄 OAuth2 refresh failed, attempting full login...');
                const newTokens = await performOAuth2Login();
                return newTokens.accessToken;
            }
        } else {
            console.log('🔑 No OAuth2 refresh token found, performing full login...');
            const newTokens = await performOAuth2Login();
            return newTokens.accessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid OAuth2 access token:', error);
        throw error;
    }
};

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
                timeout: 30000,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token || refreshTokenValue;

        await tokenStore.setTokens(PROVIDER, newAccessToken, newRefreshToken);
        console.log('✅ OAuth2 token refresh successful');

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.error('❌ OAuth2 token refresh failed:', error.message);
        throw error;
    }
};

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
                timeout: 30000,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token;

        if (!accessToken) {
            throw new Error('Missing access token in OAuth2 response');
        }

        await tokenStore.setTokens(PROVIDER, accessToken, refreshToken);
        console.log('✅ Full OAuth2 login successful');

        return { accessToken, refreshToken };
    } catch (error) {
        console.error('❌ Full OAuth2 login failed:', error.message);
        throw error;
    }
};

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
                const accessToken = await getValidOAuth2Token();

                const response = await axios({
                    ...config,
                    timeout: 30000,
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

                    try {
                        const { refresh: refreshItem } = await tokenStore.getTokens(PROVIDER);
                        if (refreshItem?.token) {
                            const newTokens = await refreshOAuth2Token(refreshItem.token);
                            console.log('🔄 OAuth2 token refreshed after 401, retrying request...');
                            continue;
                        } else {
                            console.log('🔄 No OAuth2 refresh token, performing full login...');
                            await performOAuth2Login();
                            continue;
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
