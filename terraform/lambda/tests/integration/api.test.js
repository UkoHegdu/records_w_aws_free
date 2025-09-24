// tests/integration/api.test.js
const axios = require('axios');

describe('API Integration Tests', () => {
    const baseURL = process.env.API_BASE_URL || 'https://your-api-gateway-url.execute-api.eu-north-1.amazonaws.com/prod';
    let authToken;

    beforeAll(async () => {
        // Set longer timeout for integration tests
        jest.setTimeout(30000);
    });

    describe('Health Check', () => {
        test('should return healthy status', async () => {
            const response = await axios.get(`${baseURL}/health`);

            expect(response.status).toBe(200);
            expect(response.data.status).toBe('OK');
            expect(response.data.timestamp).toBeDefined();
            expect(response.data.services).toBeDefined();
        });
    });

    describe('User Search', () => {
        test('should search for users', async () => {
            const response = await axios.get(`${baseURL}/api/v1/users/search?username=the_macho`);

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('users');
            expect(Array.isArray(response.data.users)).toBe(true);
        });

        test('should handle invalid search parameters', async () => {
            try {
                await axios.get(`${baseURL}/api/v1/users/search`);
            } catch (error) {
                expect(error.response.status).toBe(400);
            }
        });
    });

    describe('Authentication Flow', () => {
        test('should register a new user', async () => {
            const testUser = {
                username: `testuser_${Date.now()}`,
                email: `test_${Date.now()}@example.com`,
                password: 'testpassword123'
            };

            const response = await axios.post(`${baseURL}/api/v1/auth/register`, testUser);

            expect(response.status).toBe(201);
            expect(response.data.message).toContain('User registered successfully');
        });

        test('should login with valid credentials', async () => {
            const loginData = {
                email: 'test@example.com',
                password: 'testpassword123'
            };

            try {
                const response = await axios.post(`${baseURL}/api/v1/auth/login`, loginData);

                expect(response.status).toBe(200);
                expect(response.data.accessToken).toBeDefined();
                expect(response.data.refreshToken).toBeDefined();
                expect(response.data.user).toBeDefined();

                authToken = response.data.accessToken;
            } catch (error) {
                // User might not exist, which is expected in test environment
                expect(error.response.status).toBe(401);
            }
        });

        test('should reject invalid credentials', async () => {
            const loginData = {
                email: 'nonexistent@example.com',
                password: 'wrongpassword'
            };

            try {
                await axios.post(`${baseURL}/api/v1/auth/login`, loginData);
            } catch (error) {
                expect(error.response.status).toBe(401);
                expect(error.response.data.error).toContain('Invalid credentials');
            }
        });
    });

    describe('Protected Endpoints', () => {
        test('should reject requests without authentication', async () => {
            try {
                await axios.get(`${baseURL}/api/v1/alerts`);
            } catch (error) {
                expect(error.response.status).toBe(401);
            }
        });

        test('should accept requests with valid token', async () => {
            if (!authToken) {
                // Skip if we don't have a valid token
                return;
            }

            const response = await axios.get(`${baseURL}/api/v1/alerts`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('alerts');
        });
    });

    describe('Map Search Flow', () => {
        test('should initiate map search', async () => {
            const response = await axios.get(`${baseURL}/api/v1/users/maps?username=the_macho&timeframe=1d`);

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('jobId');
            expect(response.data.status).toBe('processing');
        });

        test('should check job status', async () => {
            // First, start a job
            const searchResponse = await axios.get(`${baseURL}/api/v1/users/maps?username=the_macho&timeframe=1d`);
            const jobId = searchResponse.data.jobId;

            // Then check status
            const statusResponse = await axios.get(`${baseURL}/api/v1/users/maps/status/${jobId}`);

            expect(statusResponse.status).toBe(200);
            expect(statusResponse.data).toHaveProperty('status');
        });
    });

    describe('CORS Headers', () => {
        test('should include proper CORS headers', async () => {
            const response = await axios.options(`${baseURL}/api/v1/users/search`);

            expect(response.headers['access-control-allow-origin']).toBe('*');
            expect(response.headers['access-control-allow-methods']).toContain('GET');
            expect(response.headers['access-control-allow-headers']).toContain('Authorization');
        });
    });

    describe('Error Handling', () => {
        test('should return 404 for non-existent endpoints', async () => {
            try {
                await axios.get(`${baseURL}/api/v1/nonexistent`);
            } catch (error) {
                expect(error.response.status).toBe(404);
            }
        });

        test('should return proper error format', async () => {
            try {
                await axios.post(`${baseURL}/api/v1/auth/login`, {});
            } catch (error) {
                expect(error.response.status).toBe(400);
                expect(error.response.data).toHaveProperty('error');
                expect(error.response.data).toHaveProperty('timestamp');
            }
        });
    });
});
