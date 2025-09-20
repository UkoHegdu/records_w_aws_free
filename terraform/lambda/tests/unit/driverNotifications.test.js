// tests/unit/driverNotifications.test.js
const jwt = require('jsonwebtoken');

// Create persistent mock clients
const mockClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
};

const mockApiClient = {
    get: jest.fn()
};

// Mock dependencies BEFORE importing the module being tested
jest.mock('jsonwebtoken');
jest.mock('pg', () => ({
    Client: jest.fn().mockImplementation(() => mockClient)
}));
jest.mock('../../shared/apiClient', () => mockApiClient);
jest.mock('../../shared/timeFormatter', () => ({
    formatTime: jest.fn((time) => `${time}ms`)
}));
jest.mock('../../securityUtils', () => ({
    validateAndSanitizeInput: jest.fn(),
    checkRateLimit: jest.fn()
}));

// Import the module AFTER mocking
const { handler } = require('../../driverNotifications');

describe('Driver Notifications Lambda', () => {
    const { validateAndSanitizeInput, checkRateLimit } = require('../../securityUtils');
    const { formatTime } = require('../../shared/timeFormatter');

    beforeEach(() => {
        // Mock environment variables
        process.env.NEON_DB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/test';
        process.env.JWT_SECRET = 'test-secret';
        process.env.LEAD_API = 'https://api.trackmania.com';

        // Clear all mocks before each test
        jest.clearAllMocks();

        // Re-setup mock clients
        mockClient.connect = jest.fn();
        mockClient.query = jest.fn();
        mockClient.end = jest.fn();

        mockApiClient.get = jest.fn();

        // Mock security utils
        validateAndSanitizeInput.mockClear();
        checkRateLimit.mockClear();

        // Mock JWT
        jwt.verify.mockClear();

        // Mock time formatter
        formatTime.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.NEON_DB_CONNECTION_STRING;
        delete process.env.JWT_SECRET;
        delete process.env.LEAD_API;
    });

    const createMockEvent = (httpMethod, body = null, pathParameters = null, authToken = 'valid-token') => ({
        httpMethod,
        body: body ? JSON.stringify(body) : null,
        pathParameters,
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });

    const expectedHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    describe('Authentication', () => {
        test('should return 401 for missing authorization header', async () => {
            const event = {
                httpMethod: 'GET',
                headers: {}
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(401);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Unauthorized - invalid or missing token'
            });
        });

        test('should return 401 for invalid JWT token', async () => {
            const event = createMockEvent('GET', null, null, 'invalid-token');

            jwt.verify.mockImplementation(() => {
                throw new Error('Invalid token');
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(401);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Unauthorized - invalid or missing token'
            });
        });

        test('should return 401 for malformed authorization header', async () => {
            const event = {
                httpMethod: 'GET',
                headers: {
                    Authorization: 'InvalidFormat token'
                }
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(401);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Unauthorized - invalid or missing token'
            });
        });

        test('should authenticate successfully with valid token', async () => {
            const event = createMockEvent('GET');

            jwt.verify.mockReturnValue({ user_id: '123' });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [] });

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
        });
    });

    describe('OPTIONS Request', () => {
        test('should handle OPTIONS request', async () => {
            const event = {
                httpMethod: 'OPTIONS',
                headers: {}
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toEqual(expectedHeaders);
            expect(result.body).toBe('');
        });
    });

    describe('GET Notifications', () => {
        beforeEach(() => {
            jwt.verify.mockReturnValue({ user_id: '123' });
        });

        test('should fetch driver notifications successfully', async () => {
            const event = createMockEvent('GET');

            const mockNotifications = [
                {
                    id: 1,
                    map_uid: 'map123',
                    map_name: 'Test Map',
                    current_position: 3,
                    personal_best: 45000,
                    status: 'active',
                    created_at: '2023-01-01T00:00:00Z',
                    last_checked: '2023-01-01T00:00:00Z',
                    is_active: true
                }
            ];

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: mockNotifications });
            formatTime.mockReturnValue('45.000s');

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toEqual(expectedHeaders);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.notifications).toHaveLength(1);
            expect(responseBody.notifications[0]).toEqual({
                id: '1',
                mapUid: 'map123',
                mapName: 'Test Map',
                currentPosition: 3,
                personalBest: 45000,
                personalBestFormatted: '45.000s',
                status: 'active',
                createdAt: '2023-01-01T00:00:00Z',
                lastChecked: '2023-01-01T00:00:00Z',
                isActive: true
            });

            expect(mockClient.query).toHaveBeenCalledWith(
                'SELECT id, map_uid, map_name, current_position, personal_best, status, created_at, last_checked, is_active FROM driver_notifications WHERE user_id = $1 ORDER BY created_at DESC',
                ['123']
            );
        });

        test('should handle database error when fetching notifications', async () => {
            const event = createMockEvent('GET');

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockRejectedValue(new Error('Database error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Failed to fetch driver notifications'
            });
            expect(mockClient.end).toHaveBeenCalled();
        });

        test('should return empty array when no notifications found', async () => {
            const event = createMockEvent('GET');

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [] });

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.notifications).toEqual([]);
        });
    });

    describe('POST Create Notification', () => {
        beforeEach(() => {
            jwt.verify.mockReturnValue({ user_id: '123' });
        });

        test('should create notification successfully', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            // Mock rate limiting
            checkRateLimit.mockReturnValue(true);

            // Mock input validation
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            // Mock user lookup
            const mockUser = {
                username: 'testuser',
                tm_username: 'tmuser',
                tm_account_id: 'tm123'
            };

            // Mock position check
            const mockPositionCheck = {
                isValid: true,
                position: 3,
                personalBest: 45000,
                personalBestFormatted: '45.000s'
            };

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [mockUser] }) // User lookup
                .mockResolvedValueOnce({ rows: [] }) // Check existing notification
                .mockResolvedValueOnce({ rows: [] }); // Insert notification

            mockApiClient.get.mockResolvedValue({
                status: 200,
                data: {
                    tops: [{
                        top: [{
                            accountId: 'tm123',
                            position: 3,
                            score: 45000
                        }]
                    }]
                }
            });

            formatTime.mockReturnValue('45.000s');

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toEqual(expectedHeaders);

            const responseBody = JSON.parse(result.body);
            expect(responseBody).toEqual({
                success: true,
                msg: 'Driver notification created successfully',
                position: 3,
                personalBest: 45000,
                personalBestFormatted: '45.000s'
            });

            expect(checkRateLimit).toHaveBeenCalledWith('create_driver_notification:123', 5, 300000);
        });

        test('should return 429 when rate limit exceeded', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(false);

            const result = await handler(event);

            expect(result.statusCode).toBe(429);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Too many notification creation attempts. Please try again later.'
            });
        });

        test('should return 400 for invalid JSON', async () => {
            const event = {
                httpMethod: 'POST',
                body: 'invalid json',
                headers: { Authorization: 'Bearer valid-token' }
            };

            jwt.verify.mockReturnValue({ user_id: '123' });
            checkRateLimit.mockReturnValue(true);

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Invalid JSON in request body'
            });
        });

        test('should return 400 for invalid mapUid', async () => {
            const event = createMockEvent('POST', {
                mapUid: '',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: false, error: 'Map UID is required' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Map UID is required'
            });
        });

        test('should return 400 for invalid mapName', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: ''
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: false, error: 'Map name is required' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Map name is required'
            });
        });

        test('should return 404 when user not found', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [] }); // No user found

            const result = await handler(event);

            expect(result.statusCode).toBe(404);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'User not found'
            });
        });

        test('should return 400 when user has no TM username', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            const mockUser = {
                username: 'testuser',
                tm_username: null,
                tm_account_id: null
            };

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [mockUser] });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Please set your Trackmania username first before creating notifications',
                requiresTmUsername: true
            });
        });

        test('should return 400 when user not in top 5', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            const mockUser = {
                username: 'testuser',
                tm_username: 'tmuser',
                tm_account_id: 'tm123'
            };

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [mockUser] });

            mockApiClient.get.mockResolvedValue({
                status: 200,
                data: {
                    tops: [{
                        top: [{
                            accountId: 'different_user',
                            position: 1,
                            score: 40000
                        }]
                    }]
                }
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Cannot create notification: User not found in top 5 positions on this map'
            });
        });

        test('should return 409 when notification already exists', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            const mockUser = {
                username: 'testuser',
                tm_username: 'tmuser',
                tm_account_id: 'tm123'
            };

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [mockUser] }) // User lookup
                .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Existing notification

            // Mock position check to succeed so we reach the duplicate check
            mockApiClient.get.mockResolvedValue({
                status: 200,
                data: {
                    tops: [{
                        top: [{
                            accountId: 'tm123',
                            position: 3,
                            score: 45000
                        }]
                    }]
                }
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(409);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Notification already exists for this map'
            });
        });

        test('should handle API timeout error', async () => {
            const event = createMockEvent('POST', {
                mapUid: 'map123',
                mapName: 'Test Map'
            });

            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'map123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'Test Map' });

            const mockUser = {
                username: 'testuser',
                tm_username: 'tmuser',
                tm_account_id: 'tm123'
            };

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rows: [mockUser] });

            const timeoutError = new Error('Request timeout');
            timeoutError.code = 'ECONNABORTED';
            mockApiClient.get.mockRejectedValue(timeoutError);

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Cannot create notification: API request timed out - please try again'
            });
        });
    });

    describe('DELETE Notification', () => {
        beforeEach(() => {
            jwt.verify.mockReturnValue({ user_id: '123' });
        });

        test('should delete notification successfully', async () => {
            const event = createMockEvent('DELETE', null, { id: '456' });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rowCount: 1 });

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                success: true,
                msg: 'Driver notification deleted successfully'
            });

            expect(mockClient.query).toHaveBeenCalledWith(
                'DELETE FROM driver_notifications WHERE id = $1 AND user_id = $2',
                ['456', '123']
            );
        });

        test('should return 400 when notification ID is missing', async () => {
            const event = createMockEvent('DELETE');

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Notification ID is required'
            });
        });

        test('should return 404 when notification not found', async () => {
            const event = createMockEvent('DELETE', null, { id: '456' });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockResolvedValue({ rowCount: 0 });

            const result = await handler(event);

            expect(result.statusCode).toBe(404);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Notification not found or not authorized'
            });
        });

        test('should handle database error when deleting', async () => {
            const event = createMockEvent('DELETE', null, { id: '456' });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockRejectedValue(new Error('Database error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Failed to delete driver notification'
            });
            expect(mockClient.end).toHaveBeenCalled();
        });
    });

    describe('Method Not Allowed', () => {
        beforeEach(() => {
            jwt.verify.mockReturnValue({ user_id: '123' });
        });

        test('should return 405 for unsupported HTTP method', async () => {
            const event = createMockEvent('PUT');

            const result = await handler(event);

            expect(result.statusCode).toBe(405);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Method not allowed'
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle JWT verification errors with 401', async () => {
            const event = createMockEvent('GET');

            jwt.verify.mockImplementation(() => {
                throw new Error('JWT verification failed');
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(401);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Unauthorized - invalid or missing token'
            });
        });

        test('should handle unexpected errors in main handler gracefully', async () => {
            const event = createMockEvent('GET');

            jwt.verify.mockReturnValue({ user_id: '123' });

            // Mock an error in the database connection
            mockClient.connect.mockRejectedValue(new Error('Database connection failed'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.msg).toBe('Failed to fetch driver notifications');
        });
    });
});
