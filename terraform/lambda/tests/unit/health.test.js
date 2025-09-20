// tests/unit/health.test.js
const { handler } = require('../../health');

describe('Health Lambda', () => {
    let mockEvent;
    let mockContext;

    beforeEach(() => {
        mockEvent = {
            httpMethod: 'GET',
            path: '/health',
            headers: {},
            requestContext: {
                identity: {
                    sourceIp: '127.0.0.1'
                }
            }
        };

        mockContext = {
            functionName: 'health-test',
            functionVersion: '1',
            invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:health-test',
            memoryLimitInMB: '128',
            awsRequestId: 'test-request-id',
            logGroupName: '/aws/lambda/health-test',
            logStreamName: '2024/01/15/[$LATEST]test-stream',
            getRemainingTimeInMillis: () => 30000
        };

        // Mock environment variables
        process.env.AWS_REGION = 'eu-north-1';
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
    });

    test('should return healthy status with correct structure', async () => {
        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(200);
        expect(result.headers['Content-Type']).toBe('application/json');
        expect(result.headers['Access-Control-Allow-Origin']).toBe('*');

        const body = JSON.parse(result.body);
        expect(body.status).toBe('OK');
        expect(body.timestamp).toBeDefined();
        expect(body.uptime).toBeDefined();
        expect(body.environment).toBe('eu-north-1');
        expect(body.version).toBe('1.0.0');
        expect(body.services).toEqual({
            lambda: 'healthy',
            dynamodb: 'connected',
            parameter_store: 'accessible'
        });
    });

    test('should handle missing AWS_REGION environment variable', async () => {
        delete process.env.AWS_REGION;

        const result = await handler(mockEvent, mockContext);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.environment).toBe('unknown');
    });

    test('should include proper CORS headers', async () => {
        const result = await handler(mockEvent, mockContext);

        expect(result.headers).toMatchObject({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        });
    });

    test('should return valid timestamp format', async () => {
        const result = await handler(mockEvent, mockContext);
        const body = JSON.parse(result.body);

        // Check if timestamp is valid ISO string
        const timestamp = new Date(body.timestamp);
        expect(timestamp.toISOString()).toBe(body.timestamp);
    });

    test('should return valid uptime number', async () => {
        const result = await handler(mockEvent, mockContext);
        const body = JSON.parse(result.body);

        expect(typeof body.uptime).toBe('number');
        expect(body.uptime).toBeGreaterThan(0);
    });
});