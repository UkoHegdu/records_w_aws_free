// tests/unit/login.test.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('pg');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../securityUtils', () => ({
    validateAndSanitizeInput: jest.fn(),
    checkRateLimit: jest.fn()
}));

// Create mock DynamoDB client before importing login
const mockDynamoClient = {
    send: jest.fn()
};
DynamoDBClient.mockImplementation(() => mockDynamoClient);

// Import the handler AFTER mocking
const { handler } = require('../../login');

describe('Login Lambda', () => {
    let mockEvent;
    let mockContext;
    let mockPgClient;
    const { validateAndSanitizeInput, checkRateLimit } = require('../../securityUtils');

    beforeEach(() => {
        // Mock environment variables
        process.env.NEON_DB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/test';
        process.env.JWT_SECRET = 'test-secret';
        process.env.USER_SESSIONS_TABLE_NAME = 'test-sessions';

        // Mock PostgreSQL client
        mockPgClient = {
            connect: jest.fn(),
            query: jest.fn(),
            end: jest.fn()
        };
        Client.mockImplementation(() => mockPgClient);

        // Clear all mocks before each test (but keep the objects)
        jest.clearAllMocks();

        // Re-setup PostgreSQL mocks after clearing
        mockPgClient.connect = jest.fn();
        mockPgClient.query = jest.fn();
        mockPgClient.end = jest.fn();

        // Re-setup DynamoDB mock after clearing
        mockDynamoClient.send = jest.fn();

        // Mock bcrypt
        bcrypt.compare.mockResolvedValue(true);

        // Mock security utils
        checkRateLimit.mockReturnValue(true);
        validateAndSanitizeInput.mockReturnValue({ isValid: true, sanitized: 'test@example.com' });

        // Mock JWT - set up after clearAllMocks
        jwt.sign.mockImplementation((payload, secret, options) => {
            if (options && options.expiresIn === '15m') {
                return 'mock-jwt-token';
            } else if (options && options.expiresIn === '7d') {
                return 'mock-refresh-token';
            }
            return 'mock-jwt-token';
        });


        mockEvent = {
            httpMethod: 'POST',
            path: '/api/v1/auth/login',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'password123'
            }),
            requestContext: {
                identity: {
                    sourceIp: '127.0.0.1'
                }
            }
        };

        mockContext = {
            functionName: 'login-test',
            awsRequestId: 'test-request-id',
            getRemainingTimeInMillis: () => 30000
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.NEON_DB_CONNECTION_STRING;
        delete process.env.JWT_SECRET;
        delete process.env.USER_SESSIONS_TABLE_NAME;
    });

    test('should successfully login with valid credentials', async () => {
        // Ensure database connection is mocked
        mockPgClient.connect.mockResolvedValueOnce();

        // Mock database response
        mockPgClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: 'hashed-password',
                role: 'user'
            }]
        });

        // Mock DynamoDB session creation
        mockDynamoClient.send.mockResolvedValueOnce({});

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(200);
        expect(result.headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(result.body);
        expect(body.access_token).toBe('mock-jwt-token');
        expect(body.refresh_token).toBe('mock-refresh-token');
        expect(body.user).toEqual({
            id: '1',
            username: 'testuser',
            email: 'test@example.com'
        });

        // Verify bcrypt was called with correct password
        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
    });

    test('should return 400 for invalid request body', async () => {
        mockEvent.body = 'invalid-json';

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Invalid JSON in request body');
    });

    test('should return 400 for missing email', async () => {
        // Mock validation to return invalid for missing email
        validateAndSanitizeInput.mockReturnValueOnce({ isValid: false, error: 'Email is required' });

        mockEvent.body = JSON.stringify({
            password: 'password123'
        });

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Email is required');
    });

    test('should return 400 for missing password', async () => {
        mockEvent.body = JSON.stringify({
            email: 'test@example.com'
        });

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Password is required');
    });

    test('should return 401 for invalid credentials', async () => {
        // Mock database connection
        mockPgClient.connect.mockResolvedValueOnce();

        // Mock user not found
        mockPgClient.query.mockResolvedValueOnce({
            rows: []
        });

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Invalid credentials');
    });

    test('should return 401 for incorrect password', async () => {
        // Mock database connection
        mockPgClient.connect.mockResolvedValueOnce();

        // Mock user found but wrong password
        mockPgClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: 'hashed-password',
                role: 'user'
            }]
        });

        // Mock bcrypt to return false (wrong password)
        bcrypt.compare.mockResolvedValueOnce(false);

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Invalid credentials');
    });

    test('should return 500 for database connection error', async () => {
        mockPgClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(500);
        const body = JSON.parse(result.body);
        expect(body.msg).toContain('Login failed due to server error');
    });

    test('should include proper CORS headers', async () => {
        mockPgClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: 'hashed-password',
                role: 'user'
            }]
        });
        mockDynamoClient.send.mockResolvedValueOnce({});

        const result = await handler(mockEvent, mockContext);

        expect(result.headers).toMatchObject({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        });
    });

    test('should create session in DynamoDB', async () => {
        // Ensure database connection is mocked
        mockPgClient.connect.mockResolvedValueOnce();

        // Mock successful database query
        mockPgClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: 'hashed-password',
                role: 'user'
            }]
        });

        // Mock successful DynamoDB operation
        mockDynamoClient.send.mockResolvedValueOnce({});

        const result = await handler(mockEvent, mockContext);

        // Verify successful login first
        expect(result.statusCode).toBe(200);

        console.log('DynamoDB send called:', mockDynamoClient.send.mock.calls.length); // Debug
        console.log('DynamoDB call args:', JSON.stringify(mockDynamoClient.send.mock.calls[0], null, 2)); // Debug

        // Verify DynamoDB was called
        expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
    });
});