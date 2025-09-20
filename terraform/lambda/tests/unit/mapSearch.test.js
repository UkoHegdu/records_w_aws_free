// tests/unit/mapSearch.test.js
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Create persistent mock clients
const mockDynamoClient = {
    send: jest.fn()
};

const mockSqsClient = {
    send: jest.fn()
};

const mockApiClient = {
    get: jest.fn()
};

// Mock dependencies BEFORE importing the module being tested
jest.mock('axios');
jest.mock('uuid', () => ({
    v4: jest.fn()
}));
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => mockDynamoClient),
    PutItemCommand: jest.fn().mockImplementation((input) => ({ input }))
}));
jest.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: jest.fn().mockImplementation(() => mockSqsClient),
    SendMessageCommand: jest.fn().mockImplementation((input) => ({ input }))
}));
jest.mock('@aws-sdk/util-dynamodb', () => ({
    marshall: jest.fn((item) => item)
}));
jest.mock('../../shared/apiClient', () => mockApiClient);

// Import the module AFTER mocking (following TEST_APPROACH.md pattern)
const mapSearchModule = require('../../mapSearch');
const { handler, fetchMapsAndLeaderboards } = mapSearchModule;

describe('Map Search Lambda', () => {
    beforeEach(() => {
        // Mock environment variables
        process.env.AWS_REGION = 'eu-north-1';
        process.env.LEAD_API = 'https://api.trackmania.com';
        process.env.MAP_SEARCH_RESULTS_TABLE_NAME = 'test-table';
        process.env.MAP_SEARCH_QUEUE_URL = 'https://sqs.test.com/queue';

        // Clear call history but preserve mock implementations (following TEST_APPROACH.md)
        jest.clearAllMocks();

        // Re-setup mock clients after clearing
        mockDynamoClient.send = jest.fn();
        mockSqsClient.send = jest.fn();
        mockApiClient.get = jest.fn();
        axios.get.mockClear();
        uuidv4.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.AWS_REGION;
        delete process.env.LEAD_API;
        delete process.env.MAP_SEARCH_RESULTS_TABLE_NAME;
        delete process.env.MAP_SEARCH_QUEUE_URL;
    });

    const createMockEvent = (queryStringParameters = {}) => ({
        queryStringParameters
    });

    const expectedHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    };

    describe('Input Validation', () => {
        test('should return 400 when username is missing', async () => {
            const event = createMockEvent({});

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Username parameter required'
            });
        });

        test('should return 400 when username is empty', async () => {
            const event = createMockEvent({ username: '' });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Username parameter required'
            });
        });

        test('should accept valid username', async () => {
            const event = createMockEvent({ username: 'testuser' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});

            const result = await handler(event);

            expect(result.statusCode).toBe(202);
            expect(JSON.parse(result.body)).toEqual({
                jobId: 'test-job-id',
                status: 'pending',
                message: 'Map search queued. Use the job ID to check status.',
                estimatedWaitTime: '2-5 minutes'
            });
        });
    });

    describe('Rate Limiting', () => {
        test('should allow first request', async () => {
            const event = createMockEvent({ username: 'user1' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});

            const result = await handler(event);

            expect(result.statusCode).toBe(202);
        });

        test('should allow second request within minute', async () => {
            const event = createMockEvent({ username: 'user2' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});

            // First request
            await handler(event);

            // Second request
            const result = await handler(event);

            expect(result.statusCode).toBe(202);
        });

        test('should block third request within minute', async () => {
            const event = createMockEvent({ username: 'user3' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});

            // First request
            await handler(event);
            // Second request
            await handler(event);
            // Third request
            const result = await handler(event);

            expect(result.statusCode).toBe(429);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Rate limit exceeded. Please wait before making another request.',
                retryAfter: 60
            });
        });

        test('should be case insensitive for rate limiting', async () => {
            const event1 = createMockEvent({ username: 'TestUser' });
            const event2 = createMockEvent({ username: 'testuser' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});

            // First request with uppercase
            await handler(event1);
            // Second request with lowercase - should be rate limited because it's the same user
            const result = await handler(event2);

            expect(result.statusCode).toBe(429);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Rate limit exceeded. Please wait before making another request.',
                retryAfter: 60
            });
        });
    });

    describe('Job Creation', () => {
        beforeEach(() => {
            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockResolvedValue({});
        });

        test('should create job with default period', async () => {
            const event = createMockEvent({ username: 'jobuser1' });

            const result = await handler(event);

            expect(result.statusCode).toBe(202);
            expect(uuidv4).toHaveBeenCalled();
            expect(mockDynamoClient.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: 'test-table',
                        Item: expect.objectContaining({
                            job_id: 'test-job-id',
                            username: 'jobuser1',
                            period: '1d',
                            status: 'pending'
                        })
                    })
                })
            );
        });

        test('should create job with custom period', async () => {
            const event = createMockEvent({ username: 'jobuser2', period: '1w' });

            const result = await handler(event);

            expect(result.statusCode).toBe(202);
            expect(mockDynamoClient.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: 'test-table',
                        Item: expect.objectContaining({
                            job_id: 'test-job-id',
                            username: 'jobuser2',
                            period: '1w',
                            status: 'pending'
                        })
                    })
                })
            );
        });

        test('should send job to SQS queue', async () => {
            const event = createMockEvent({ username: 'jobuser3' });

            await handler(event);

            expect(mockSqsClient.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        QueueUrl: 'https://sqs.test.com/queue',
                        MessageBody: JSON.stringify({
                            jobId: 'test-job-id',
                            username: 'jobuser3',
                            period: '1d'
                        }),
                        MessageAttributes: expect.objectContaining({
                            jobId: expect.objectContaining({
                                DataType: 'String',
                                StringValue: 'test-job-id'
                            }),
                            username: expect.objectContaining({
                                DataType: 'String',
                                StringValue: 'jobuser3'
                            })
                        })
                    })
                })
            );
        });

        test('should return job ID and status', async () => {
            const event = createMockEvent({ username: 'jobuser4' });

            const result = await handler(event);

            expect(result.statusCode).toBe(202);
            expect(result.headers).toEqual(expectedHeaders);

            const responseBody = JSON.parse(result.body);
            expect(responseBody).toEqual({
                jobId: 'test-job-id',
                status: 'pending',
                message: 'Map search queued. Use the job ID to check status.',
                estimatedWaitTime: '2-5 minutes'
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle DynamoDB error', async () => {
            const event = createMockEvent({ username: 'erroruser1' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockRejectedValue(new Error('DynamoDB error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Internal Server Error'
            });
        });

        test('should handle SQS error', async () => {
            const event = createMockEvent({ username: 'erroruser2' });

            uuidv4.mockReturnValue('test-job-id');
            mockDynamoClient.send.mockResolvedValue({});
            mockSqsClient.send.mockRejectedValue(new Error('SQS error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Internal Server Error'
            });
        });

        test('should handle UUID generation error', async () => {
            const event = createMockEvent({ username: 'erroruser3' });

            uuidv4.mockImplementation(() => {
                throw new Error('UUID error');
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(result.headers).toEqual(expectedHeaders);
            expect(JSON.parse(result.body)).toEqual({
                error: 'Internal Server Error'
            });
        });
    });

    describe('fetchMapsAndLeaderboards Function', () => {
        beforeEach(() => {
            // Mock sleep function to avoid actual delays in tests
            jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        test('should fetch maps and leaderboards successfully', async () => {
            const mockMapsResponse = {
                data: {
                    Results: [
                        {
                            MapId: 1,
                            MapUid: 'map123',
                            Name: 'Test Map',
                            Authors: ['testuser']
                        }
                    ],
                    More: false
                }
            };

            const mockLeaderboardResponse = {
                data: {
                    tops: [{
                        top: [{
                            timestamp: Date.now() / 1000 - 1000, // 1 second ago
                            score: 45000,
                            playerName: 'testuser'
                        }]
                    }]
                }
            };

            axios.get.mockResolvedValue(mockMapsResponse);
            mockApiClient.get.mockResolvedValue(mockLeaderboardResponse);

            const result = await fetchMapsAndLeaderboards('testuser', '1d');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                mapName: 'Test Map',
                leaderboard: expect.any(Array)
            });
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('https://trackmania.exchange/api/maps')
            );
            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/token/leaderboard/group/Personal_Best/map/map123/top')
            );
        });

        test('should handle pagination correctly', async () => {
            const mockFirstPage = {
                data: {
                    Results: [
                        {
                            MapId: 1,
                            MapUid: 'map123',
                            Name: 'Test Map 1',
                            Authors: ['testuser']
                        }
                    ],
                    More: true
                }
            };

            const mockSecondPage = {
                data: {
                    Results: [
                        {
                            MapId: 2,
                            MapUid: 'map456',
                            Name: 'Test Map 2',
                            Authors: ['testuser']
                        }
                    ],
                    More: false
                }
            };

            axios.get
                .mockResolvedValueOnce(mockFirstPage)
                .mockResolvedValueOnce(mockSecondPage);

            mockApiClient.get
                .mockResolvedValueOnce({ data: { tops: [{ top: [{ timestamp: Date.now() / 1000, score: 45000 }] }] } })
                .mockResolvedValueOnce({ data: { tops: [{ top: [{ timestamp: Date.now() / 1000, score: 50000 }] }] } });

            const result = await fetchMapsAndLeaderboards('testuser');

            expect(result).toHaveLength(2);
            expect(axios.get).toHaveBeenCalledTimes(2);
        });

        test('should filter records by period', async () => {
            const mockMapsResponse = {
                data: {
                    Results: [
                        {
                            MapId: 1,
                            MapUid: 'map123',
                            Name: 'Test Map',
                            Authors: ['testuser']
                        }
                    ],
                    More: false
                }
            };

            const mockLeaderboardResponse = {
                data: {
                    tops: [{
                        top: [
                            {
                                timestamp: Date.now() / 1000 - 1000, // 1 second ago (should be included)
                                score: 45000,
                                playerName: 'testuser'
                            },
                            {
                                timestamp: Date.now() / 1000 - (2 * 24 * 60 * 60), // 2 days ago (should be filtered out)
                                score: 50000,
                                playerName: 'testuser'
                            }
                        ]
                    }]
                }
            };

            axios.get.mockResolvedValue(mockMapsResponse);
            mockApiClient.get.mockResolvedValue(mockLeaderboardResponse);

            const result = await fetchMapsAndLeaderboards('testuser', '1d');

            expect(result).toHaveLength(1);
            expect(result[0].leaderboard).toHaveLength(1); // Only recent record
        });

        test('should handle API errors with retry', async () => {
            const mockMapsResponse = {
                data: {
                    Results: [
                        {
                            MapId: 1,
                            MapUid: 'map123',
                            Name: 'Test Map',
                            Authors: ['testuser']
                        }
                    ],
                    More: false
                }
            };

            axios.get.mockResolvedValue(mockMapsResponse);
            mockApiClient.get
                .mockRejectedValueOnce(new Error('API error'))
                .mockResolvedValueOnce({ data: { tops: [{ top: [{ timestamp: Date.now() / 1000, score: 45000 }] }] } });

            const result = await fetchMapsAndLeaderboards('testuser');

            expect(result).toHaveLength(1);
            expect(mockApiClient.get).toHaveBeenCalledTimes(2); // Retry happened
        });

        test('should handle axios errors with retry', async () => {
            axios.get
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    data: {
                        Results: [],
                        More: false
                    }
                });

            const result = await fetchMapsAndLeaderboards('testuser');

            expect(result).toEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(2); // Retry happened
        });

        test('should handle empty results', async () => {
            const mockMapsResponse = {
                data: {
                    Results: [],
                    More: false
                }
            };

            axios.get.mockResolvedValue(mockMapsResponse);

            const result = await fetchMapsAndLeaderboards('testuser');

            expect(result).toEqual([]);
        });

        test('should handle leaderboard API errors', async () => {
            const mockMapsResponse = {
                data: {
                    Results: [
                        {
                            MapId: 1,
                            MapUid: 'map123',
                            Name: 'Test Map',
                            Authors: ['testuser']
                        }
                    ],
                    More: false
                }
            };

            axios.get.mockResolvedValue(mockMapsResponse);
            mockApiClient.get.mockRejectedValue(new Error('Leaderboard API error'));

            await expect(fetchMapsAndLeaderboards('testuser')).rejects.toThrow('Failed to fetch records from API');
        });
    });

});
