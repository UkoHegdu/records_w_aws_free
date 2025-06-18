const axios = require('axios');
const tokenStore = require('./authTokenStore');
const { login } = require('./authService');

let lastRefreshTimestamp = 0;
let lastLoginTimestamp = 0;
let isRefreshing = false;
let pendingRequests = [];

function waitForTokenRefresh() {
    return new Promise((resolve, reject) => {
        pendingRequests.push({ resolve, reject });
    });
}

function resolvePendingRequests(token) {
    pendingRequests.forEach(p => p.resolve(token));
    pendingRequests = [];
}

function rejectPendingRequests(err) {
    pendingRequests.forEach(p => p.reject(err));
    pendingRequests = [];
}

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

                // Prevent infinite retry loops
                if (!originalRequest._retry) {
                    originalRequest._retry = 1;
                } else if (originalRequest._retry >= 2) {
                    console.error('❌ Too many retries. Aborting request.');
                    return Promise.reject(error);
                } else {
                    originalRequest._retry++;
                }

                // Handle concurrent refresh attempts
                if (isRefreshing) {
                    try {
                        const newToken = await waitForTokenRefresh();
                        originalRequest.headers.Authorization = `nadeo_v1 t=${newToken}`;
                        return instance(originalRequest);
                    } catch (e) {
                        return Promise.reject(e);
                    }
                }

                const now = Date.now();
                if (now - lastRefreshTimestamp < 10000) {
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
                    lastRefreshTimestamp = now;
                    isRefreshing = false;
                    resolvePendingRequests(newAccessToken);

                    console.log('🔁 Retrying request with refreshed token');
                    originalRequest.headers.Authorization = `nadeo_v1 t=${newAccessToken}`;
                    return instance(originalRequest);

                } catch (refreshError) {
                    console.error('⚠️ Refresh failed. Attempting full login...');
                    rejectPendingRequests(refreshError);
                    isRefreshing = false;

                    if (Date.now() - lastLoginTimestamp < 10000) {
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
