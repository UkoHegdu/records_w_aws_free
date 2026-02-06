// lambda/shared/apiClient.js - Backend: Postgres token store (no DynamoDB)
const axios = require('axios');
const tokenStore = require('../../tokenStore');

const PROVIDER = 'auth';

// Token refresh logic
const getValidAccessToken = async () => {
    try {
        const { access: accessItem, refresh: refreshItem } = await tokenStore.getTokens(PROVIDER);

        const now = Date.now();
        const tokenAge = now - (accessItem?.created_at || 0);
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (accessItem?.token && tokenAge < twentyFourHours) {
            console.log('✅ Using existing access token (less than 24 hours old)');
            return accessItem.token;
        }

        if (refreshItem?.token) {
            console.log('🔄 Access token is older than 24 hours, attempting refresh...');
            try {
                const newTokens = await refreshToken(refreshItem.token);
                return newTokens.accessToken;
            } catch (refreshError) {
                console.log('🔄 Refresh failed, attempting full login...');
                const newTokens = await performLogin();
                return newTokens.accessToken;
            }
        } else {
            console.log('🔑 No refresh token found, performing full login...');
            const newTokens = await performLogin();
            return newTokens.accessToken;
        }
    } catch (error) {
        console.error('❌ Error getting valid access token:', error);
        throw error;
    }
};

const refreshToken = async (refreshTokenValue) => {
    try {
        console.log('🔄 Attempting token refresh...');

        const response = await axios.post(
            'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
            {},
            {
                timeout: 30000,
                headers: {
                    Authorization: `nadeo_v1 t=${refreshTokenValue}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const newAccessToken = response.data.accessToken;
        const newRefreshToken = response.data.refreshToken || refreshTokenValue;

        await tokenStore.setTokens(PROVIDER, newAccessToken, newRefreshToken);
        console.log('✅ Token refresh successful');

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.error('❌ Token refresh failed:', error.message);
        throw error;
    }
};

const performLogin = async () => {
    try {
        const credentials = Buffer.from(process.env.AUTHORIZATION);

        console.log('📤 Performing full login...');

        const response = await axios.post(process.env.AUTH_API_URL,
            { audience: 'NadeoLiveServices' },
            {
                timeout: 30000,
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

        await tokenStore.setTokens(PROVIDER, accessToken, refreshToken);
        console.log('✅ Full login successful');

        return { accessToken, refreshToken };
    } catch (error) {
        console.error('❌ Full login failed:', error.message);
        throw error;
    }
};

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
                const accessToken = await getValidAccessToken();

                const response = await axios({
                    ...config,
                    timeout: 30000,
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

                    try {
                        const { refresh: refreshItem } = await tokenStore.getTokens(PROVIDER);
                        if (refreshItem?.token) {
                            const newTokens = await refreshToken(refreshItem.token);
                            console.log('🔄 Token refreshed after 401, retrying request...');
                            continue;
                        } else {
                            console.log('🔄 No refresh token, performing full login...');
                            await performLogin();
                            continue;
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

module.exports = {
    ...apiClient,
    getValidAccessToken
};
