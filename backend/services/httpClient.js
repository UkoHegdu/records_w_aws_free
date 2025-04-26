// httpClient.js
const axios = require('axios');
const tokenStore = require('./authTokenStore');

let lastRefreshTimestamp = 0; // Variable to track the last refresh timestamp

function httpClient(baseURL) {
    const instance = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        }
    });

    instance.interceptors.request.use((config) => {
        const token = tokenStore.getAccessToken();
        if (token) {
            config.headers.Authorization = `nadeo_v1 t=${token}`;
        }
        console.log('📤 rekvests aiziet <3');
        //console.log('📤 Sending request with headers:', config.headers);
        return config;
    });

    // Response interceptor: refresh token on 401
    instance.interceptors.response.use(
        response => response,
        async error => {
            if (error.response?.status === 401) {
                const refreshToken = tokenStore.getRefreshToken();
                console.log('📥 SANJEMTS 401, jāizmanto refresh tokens');
                //  if (!refreshToken) {
                //     console.log('refreshtokena nav (nav reāli)');
                //     return Promise.reject(error); // No refresh token, reject the error
                // }

                // Check if refresh token was used recently (within 5 seconds)
                const currentTimestamp = Date.now();
                if (currentTimestamp - lastRefreshTimestamp < 10000) {
                    console.log('Refresh token requested too recently, aborting...');
                    return Promise.reject(new Error('Refresh token request too frequent.'));
                }

                // Refresh token request
                try {
                    const res = await axios.post(
                        'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
                        {},
                        {
                            headers: {
                                'Authorization': `nadeo_v1 t=${refreshToken}`,
                                'Content-Type': 'application/json',
                            }
                        }
                    );

                    const newAccessToken = res.data.accessToken;
                    tokenStore.setTokens(newAccessToken, refreshToken);
                    lastRefreshTimestamp = currentTimestamp; // Update the last refresh time
                    // Retry original request with new access token
                    error.config.headers.Authorization = `nadeo_v1 ${newAccessToken}`;
                    return instance(error.config); // Retry
                } catch (refreshError) {
                    console.error('Refresh token failed');
                    throw refreshError;
                }
            }
            throw error;
        }
    );

    return instance;
}

module.exports = httpClient;
