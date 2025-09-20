// tests/unit/register.test.js
const bcrypt = require('bcryptjs');

// Create a persistent mock client
const mockClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
};

// Mock dependencies BEFORE importing the module being tested
jest.mock('bcryptjs');
jest.mock('pg', () => ({
    Client: jest.fn().mockImplementation(() => mockClient)
}));

jest.mock('../../securityUtils', () => ({
    validateAndSanitizeInput: jest.fn(),
    checkRateLimit: jest.fn()
}));

// Import the module AFTER mocking
const { handler } = require('../../register');

describe('Register Lambda', () => {
    const { validateAndSanitizeInput, checkRateLimit } = require('../../securityUtils');

    beforeEach(() => {
        // Mock environment variables
        process.env.NEON_DB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/test';
        process.env.JWT_SECRET = 'test-secret';

        // Clear all mocks before each test
        jest.clearAllMocks();

        // Re-setup the mock client
        mockClient.connect = jest.fn();
        mockClient.query = jest.fn();
        mockClient.end = jest.fn();

        // Mock security utils
        validateAndSanitizeInput.mockClear();
        checkRateLimit.mockClear();

        // Mock bcrypt
        bcrypt.hash.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.NEON_DB_CONNECTION_STRING;
        delete process.env.JWT_SECRET;
    });

    const createMockEvent = (body, sourceIp = '192.168.1.1') => ({
        body: JSON.stringify(body),
        requestContext: {
            identity: {
                sourceIp: sourceIp
            }
        }
    });

    const expectedHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    describe('Rate Limiting', () => {
        test('should return 429 when rate limit exceeded', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            checkRateLimit.mockReturnValue(false);

            const result = await handler(event);

            expect(result.statusCode).toBe(429);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Too many registration attempts. Please try again later.'
            });
            expect(checkRateLimit).toHaveBeenCalledWith('register:192.168.1.1', 3, 300000);
        });

        test('should use unknown IP when sourceIp is missing', async () => {
            const event = {
                body: JSON.stringify({
                    email: 'test@example.com',
                    password: 'password123',
                    username: 'testuser'
                }),
                requestContext: {}
            };

            checkRateLimit.mockReturnValue(false);

            await handler(event);

            expect(checkRateLimit).toHaveBeenCalledWith('register:unknown', 3, 300000);
        });
    });

    describe('Request Body Parsing', () => {
        test('should return 400 for invalid JSON', async () => {
            const event = {
                body: 'invalid json',
                requestContext: { identity: { sourceIp: '192.168.1.1' } }
            };

            checkRateLimit.mockReturnValue(true);

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Invalid JSON in request body'
            });
        });

        test('should handle empty body', async () => {
            const event = {
                body: null,
                requestContext: { identity: { sourceIp: '192.168.1.1' } }
            };

            checkRateLimit.mockReturnValue(true);

            // Mock validation for empty object
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: false, error: 'Email is required' })
                .mockReturnValueOnce({ isValid: true, sanitized: '' })
                .mockReturnValueOnce({ isValid: true, sanitized: '' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Email is required'
            });
        });
    });

    describe('Input Validation', () => {
        beforeEach(() => {
            checkRateLimit.mockReturnValue(true);
        });

        test('should return 400 for invalid email', async () => {
            const event = createMockEvent({
                email: 'invalid-email',
                password: 'password123',
                username: 'testuser'
            });

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: false, error: 'Invalid email format' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Invalid email format'
            });
        });

        test('should return 400 for invalid password', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: '123',
                username: 'testuser'
            });

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
                .mockReturnValueOnce({ isValid: false, error: 'Password too short' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Password too short'
            });
        });

        test('should return 400 for invalid username', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'ab'
            });

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
                .mockReturnValueOnce({ isValid: false, error: 'Username too short' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Username too short'
            });
        });
    });

    describe('Database Operations', () => {
        beforeEach(() => {
            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });
        });

        test('should return 400 when email already exists', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Email exists
                .mockResolvedValueOnce({ rows: [] }); // Username check

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Email already registered'
            });
            expect(mockClient.query).toHaveBeenCalledWith(
                'SELECT id FROM users WHERE email = $1',
                ['test@example.com']
            );
        });

        test('should return 400 when username already exists', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Email check
                .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Username exists
                .mockResolvedValueOnce({ rows: [] }); // Insert user

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Username already selected'
            });
            expect(mockClient.query).toHaveBeenCalledWith(
                'SELECT id FROM users WHERE username = $1',
                ['testuser']
            );
        });

        test('should successfully register new user', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Email check
                .mockResolvedValueOnce({ rows: [] }) // Username check
                .mockResolvedValueOnce({ rows: [] }); // Insert user

            bcrypt.hash.mockResolvedValue('hashed-password-123');

            const result = await handler(event);

            expect(result.statusCode).toBe(201);
            expect(result.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
            expect(JSON.parse(result.body)).toEqual({
                msg: 'User registered successfully'
            });

            // Verify password was hashed
            expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);

            // Verify user was inserted with hashed password
            expect(mockClient.query).toHaveBeenCalledWith(
                'INSERT INTO users (email, password, username) VALUES ($1, $2, $3)',
                ['test@example.com', 'hashed-password-123', 'testuser']
            );

            // Verify database connection was closed
            expect(mockClient.end).toHaveBeenCalled();
        });

        test('should handle database connection error', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Registration failed due to server error'
            });
            expect(mockClient.end).toHaveBeenCalled();
        });

        test('should handle database query error', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query.mockRejectedValue(new Error('Query failed'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Registration failed due to server error'
            });
            expect(mockClient.end).toHaveBeenCalled();
        });

        test('should handle bcrypt hashing error', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Email check
                .mockResolvedValueOnce({ rows: [] }); // Username check

            bcrypt.hash.mockRejectedValue(new Error('Hashing failed'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Registration failed due to server error'
            });
            expect(mockClient.end).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        beforeEach(() => {
            checkRateLimit.mockReturnValue(true);
        });

        test('should handle missing requestContext', async () => {
            const event = {
                body: JSON.stringify({
                    email: 'test@example.com',
                    password: 'password123',
                    username: 'testuser'
                })
            };

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Email check
                .mockResolvedValueOnce({ rows: [] }) // Username check
                .mockResolvedValueOnce({ rows: [] }); // Insert user

            bcrypt.hash.mockResolvedValue('hashed-password-123');

            const result = await handler(event);

            expect(result.statusCode).toBe(201);
            expect(checkRateLimit).toHaveBeenCalledWith('register:unknown', 3, 300000);
        });

        test('should handle empty string values', async () => {
            const event = createMockEvent({
                email: '',
                password: '',
                username: ''
            });

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: false, error: 'Email is required' })
                .mockReturnValueOnce({ isValid: true, sanitized: '' })
                .mockReturnValueOnce({ isValid: true, sanitized: '' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                msg: 'Email is required'
            });
        });
    });

    describe('Security Headers', () => {
        beforeEach(() => {
            checkRateLimit.mockReturnValue(true);
            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
                .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });
        });

        test('should include CORS headers in error responses', async () => {
            const event = createMockEvent({
                email: 'invalid-email',
                password: 'password123',
                username: 'testuser'
            });

            validateAndSanitizeInput
                .mockReturnValueOnce({ isValid: false, error: 'Invalid email' });

            const result = await handler(event);

            expect(result.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
        });

        test('should include all security headers in success responses', async () => {
            const event = createMockEvent({
                email: 'test@example.com',
                password: 'password123',
                username: 'testuser'
            });

            mockClient.connect.mockResolvedValue();
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Email check
                .mockResolvedValueOnce({ rows: [] }) // Username check
                .mockResolvedValueOnce({ rows: [] }); // Insert user

            bcrypt.hash.mockResolvedValue('hashed-password-123');

            const result = await handler(event);

            expect(result.headers).toEqual(expectedHeaders);
        });
    });
});
