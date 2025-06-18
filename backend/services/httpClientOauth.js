// httpClientOauth.js
const axios = require('axios');
const tokenStore = require('./authTokenStore');
const { loginOauth, refreshOauth } = require('./OauthService');

let lastRefreshTimestamp = 0;
const REFRESH_THROTTLE_MS = 10000;
const TOKEN_PROVIDER = 'oauth2';

function httpClientOauth(baseURL) {
    const instance = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        }
    });

    // Add access token to every request
    instance.interceptors.request.use(async (config) => {
        const token = tokenStore.getAccessToken(TOKEN_PROVIDER);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // Handle 401 responses: refresh or re-login, then retry request
    instance.interceptors.response.use(
        response => response,
        async error => {
            if (error.response?.status === 401) {
                console.log('📥 Received 401, trying to refresh OAuth2 token...');

                const currentTimestamp = Date.now();
                if (currentTimestamp - lastRefreshTimestamp < REFRESH_THROTTLE_MS) {
                    console.warn('🛑 Refresh called too recently, aborting retry.');
                    return Promise.reject(new Error('OAuth2 refresh throttled.'));
                }

                try {
                    await refreshOauth();
                    lastRefreshTimestamp = currentTimestamp;

                    const newAccessToken = tokenStore.getAccessToken(TOKEN_PROVIDER);
                    error.config.headers.Authorization = `Bearer ${newAccessToken}`;

                    console.log('🔁 Retrying request with refreshed token...');
                    return instance(error.config);
                } catch (refreshError) {
                    console.error('⚠️ Refresh failed. Attempting full OAuth2 login...');
                    try {
                        await loginOauth();
                        const newAccessToken = tokenStore.getAccessToken(TOKEN_PROVIDER);
                        error.config.headers.Authorization = `Bearer ${newAccessToken}`;

                        console.log('🔁 Retrying request after full login...');
                        return instance(error.config);
                    } catch (loginError) {
                        console.error('❌ OAuth2 login failed after refresh attempt.');
                        return Promise.reject(loginError);
                    }
                }
            }

            return Promise.reject(error);
        }
    );

    return instance;
}

module.exports = httpClientOauth;
