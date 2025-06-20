// httpClient.js
const axios = require('axios');
const tokenStore = require('./authTokenStore');
const { login } = require('./authService');

let lastRefreshTimestamp = 0;
let lastLoginTimestamp = 0;
let isRefreshing = false;

function httpClient(baseURL) {
    const instance = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        }
    });

    instance.interceptors.request.use((config) => {
        const accessToken = tokenStore.getAccessToken('auth');
        if (accessToken) {
            config.headers.Authorization = `nadeo_v1 t=${accessToken}`;
        }
        return config;
    });

    instance.interceptors.response.use(
        response => response,
        async error => {
            const originalRequest = error.config;

            if (error.response?.status === 401) {
                const refreshToken = tokenStore.getRefreshToken('auth');

                console.log('📥 Received 401, attempting token refresh...');
                console.error(`🕒 [${new Date().toISOString()}] ❌ Received 401 error. Original request failed with:`, {
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers,
                    data: error.config?.data,
                    response: error.response?.data
                });


                // Prevent infinite retry loops
                if (!originalRequest._retry) {
                    originalRequest._retry = 1;
                } else if (originalRequest._retry >= 2) {
                    console.error('❌ Too many retries. Aborting request.');
                    return Promise.reject(error);
                } else {
                    originalRequest._retry++;
                }

                const now = Date.now();
                if (now - lastRefreshTimestamp < 1000) {
                    console.log('⏱ Refresh requested too recently. Aborting...');
                    return Promise.reject(new Error('Refresh cooldown active.'));
                }

                isRefreshing = true;

                try {
                    // Try refresh
                    const res = await axios.post(
                        'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
                        {},
                        {
                            headers: {
                                Authorization: `nadeo_v1 t=${refreshToken}`,
                                'Content-Type': 'application/json',
                            }
                        }
                    );

                    const newAccessToken = res.data.accessToken;
                    const newRefreshToken = res.data.refreshToken || refreshToken; // fallback if refreshToken is not returned

                    // ✅ Save both access and refresh tokens
                    tokenStore.setTokens('auth', newAccessToken, newRefreshToken);
                    console.log(`🔑 New access token: ${newAccessToken}`);
                    console.log(`🔄 New refresh token: ${newRefreshToken}`);

                    lastRefreshTimestamp = now;
                    isRefreshing = false;

                    console.log(`🔁 Retrying original request to ${originalRequest.url} with refreshed token at ${new Date().toISOString()}`);
                    originalRequest.headers.Authorization = `nadeo_v1 t=${newAccessToken}`;

                    return instance(originalRequest);

                } catch (refreshError) {
                    console.error('⚠️ Refresh failed. Attempting full login...');
                    isRefreshing = false;

                    if (Date.now() - lastLoginTimestamp < 1000) {
                        console.error('⏱ Login attempted too soon. Aborting...');
                        return Promise.reject(new Error('Login cooldown active.'));
                    }

                    try {
                        lastLoginTimestamp = Date.now();
                        await login();
                        const newAccessToken = tokenStore.getAccessToken('auth');

                        originalRequest.headers.Authorization = `nadeo_v1 t=${newAccessToken}`;
                        return instance(originalRequest);
                    } catch (loginError) {
                        console.error('❌ Login failed after refresh attempt.');
                        return Promise.reject(loginError);
                    }
                }
            }

            return Promise.reject(error);
        }
    );

    return instance;
}

module.exports = httpClient;
