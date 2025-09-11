// frontend/src/auth.ts
import axios from 'axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Create axios instance for API calls
const apiClient = axios.create({
    baseURL: backendUrl,
});

// Token refresh function
const refreshToken = async (): Promise<boolean> => {
    try {
        const refreshTokenValue = localStorage.getItem('refresh_token');
        if (!refreshTokenValue) {
            return false;
        }

        const response = await axios.post(`${backendUrl}/api/v1/users/refresh`, {
            refresh_token: refreshTokenValue
        });

        // Update stored tokens
        localStorage.setItem('access_token', response.data.access_token);
        localStorage.setItem('refresh_token', response.data.refresh_token);

        return true;
    } catch (error) {
        console.error('Token refresh failed:', error);
        // Clear invalid tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        return false;
    }
};

// Request interceptor to add access token
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't already tried to refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const refreshed = await refreshToken();
            if (refreshed) {
                // Retry the original request with new token
                const newToken = localStorage.getItem('access_token');
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(originalRequest);
            } else {
                // Refresh failed, redirect to login
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;
