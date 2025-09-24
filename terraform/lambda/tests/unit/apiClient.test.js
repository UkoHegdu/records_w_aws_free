// tests/unit/apiClient.test.js
const axios = require('axios');

// Create a persistent mock client
const mockDynamoClient = {
    send: jest.fn()
};

// Mock dependencies BEFORE importing the module being tested
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => mockDynamoClient),
    GetItemCommand: jest.fn(),
    PutItemCommand: jest.fn()
}));

jest.mock('@aws-sdk/util-dynamodb', () => ({
    marshall: jest.fn((item) => item),
    unmarshall: jest.fn((item) => {
        if (!item) return null;
        const result = {};
        for (const [key, value] of Object.entries(item)) {
            if (value.S) result[key] = value.S;
            else if (value.N) result[key] = parseInt(value.N);
            else if (value.BOOL) result[key] = value.BOOL;
            else result[key] = value;
        }
        return result;
    })
}));

jest.mock('axios');

// Import the module AFTER mocking
const { getValidAccessToken } = require('../../shared/apiClient');

describe('API Client', () => {
    beforeEach(() => {
        // Mock environment variables
        process.env.DYNAMODB_TABLE_NAME = 'test-table';
        process.env.AWS_REGION = 'eu-north-1';
        process.env.AUTHORIZATION = 'dGVzdDp0ZXN0'; // test:test in base64
        process.env.AUTH_API_URL = 'https://test.api.com/token';
        process.env.USER_AGENT = 'test-agent';

        // Clear all mocks before each test
        jest.clearAllMocks();

        // Re-setup the mock client
        mockDynamoClient.send = jest.fn();

        // Mock axios - reset to default behavior
        axios.post.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.DYNAMODB_TABLE_NAME;
        delete process.env.AWS_REGION;
        delete process.env.AUTHORIZATION;
        delete process.env.AUTH_API_URL;
        delete process.env.USER_AGENT;
    });

    test('should return existing valid access token', async () => {
        const mockToken = {
            token: 'valid-token',
            created_at: Date.now() - 1000 // 1 second ago
        };

        mockDynamoClient.send
            .mockResolvedValueOnce({ Item: { token: { S: 'valid-token' }, created_at: { N: mockToken.created_at.toString() } } })
            .mockResolvedValueOnce({ Item: { token: { S: 'refresh-token' } } });

        // Mock full login in case it's needed
        axios.post.mockResolvedValueOnce({
            data: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock token storage
        mockDynamoClient.send
            .mockResolvedValueOnce({}) // Store new access token
            .mockResolvedValueOnce({}); // Store new refresh token

        const result = await getValidAccessToken();

        expect(result).toBe('valid-token');
        expect(mockDynamoClient.send).toHaveBeenCalledTimes(2);
    });

    test('should refresh token when access token is expired', async () => {
        const oldToken = {
            token: 'old-token',
            created_at: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
        };

        mockDynamoClient.send
            .mockResolvedValueOnce({ Item: { token: { S: 'old-token' }, created_at: { N: oldToken.created_at.toString() } } })
            .mockResolvedValueOnce({ Item: { token: { S: 'refresh-token' } } });

        // Mock successful token refresh
        axios.post.mockResolvedValueOnce({
            data: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock token storage
        mockDynamoClient.send
            .mockResolvedValueOnce({}) // Store new access token
            .mockResolvedValueOnce({}); // Store new refresh token

        const result = await getValidAccessToken();

        expect(result).toBe('new-access-token');
        expect(axios.post).toHaveBeenCalledWith(
            'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
            {},
            expect.objectContaining({
                timeout: 60000,
                headers: expect.objectContaining({
                    'Authorization': 'nadeo_v1 t=refresh-token',
                    'Content-Type': 'application/json'
                })
            })
        );
    });

    test('should perform full login when refresh fails', async () => {
        const oldToken = {
            token: 'old-token',
            created_at: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
        };

        mockDynamoClient.send
            .mockResolvedValueOnce({ Item: { token: { S: 'old-token' }, created_at: { N: oldToken.created_at.toString() } } })
            .mockResolvedValueOnce({ Item: { token: { S: 'refresh-token' } } });

        // Mock failed refresh
        axios.post.mockRejectedValueOnce(new Error('Refresh failed'));

        // Mock successful full login
        axios.post.mockResolvedValueOnce({
            data: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock token storage
        mockDynamoClient.send
            .mockResolvedValueOnce({}) // Store new access token
            .mockResolvedValueOnce({}); // Store new refresh token

        const result = await getValidAccessToken();

        expect(result).toBe('new-access-token');
        expect(axios.post).toHaveBeenCalledTimes(2); // Failed refresh + successful login
    });

    test('should handle missing tokens gracefully', async () => {
        mockDynamoClient.send
            .mockResolvedValueOnce({ Item: null }) // No access token
            .mockResolvedValueOnce({ Item: null }); // No refresh token

        // Mock successful full login
        axios.post.mockResolvedValueOnce({
            data: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock token storage
        mockDynamoClient.send
            .mockResolvedValueOnce({}) // Store new access token
            .mockResolvedValueOnce({}); // Store new refresh token

        const result = await getValidAccessToken();

        expect(result).toBe('new-access-token');
        expect(axios.post).toHaveBeenCalledTimes(1); // Only full login
    });

    test('should handle DynamoDB errors', async () => {
        mockDynamoClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

        await expect(getValidAccessToken()).rejects.toThrow('DynamoDB error');
    });

    test('should handle API errors during token refresh', async () => {
        const oldToken = {
            token: 'old-token',
            created_at: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
        };

        mockDynamoClient.send
            .mockResolvedValueOnce({ Item: { token: { S: 'old-token' }, created_at: { N: oldToken.created_at.toString() } } })
            .mockResolvedValueOnce({ Item: { token: { S: 'refresh-token' } } });

        // Mock API error during refresh
        axios.post.mockRejectedValueOnce(new Error('API error'));

        // Mock successful full login after refresh fails
        axios.post.mockResolvedValueOnce({
            data: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock token storage
        mockDynamoClient.send
            .mockResolvedValueOnce({}) // Store new access token
            .mockResolvedValueOnce({}); // Store new refresh token

        const result = await getValidAccessToken();

        expect(result).toBe('new-access-token');
        expect(axios.post).toHaveBeenCalledTimes(2); // Failed refresh + successful login
    });
});