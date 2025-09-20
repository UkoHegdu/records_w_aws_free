# Testing Guide

## Overview

This guide covers testing strategies for the Trackmania Record Tracker application, including unit tests, integration tests, and end-to-end testing.

## Test Structure

```
tests/
├── unit/              # Unit tests for individual Lambda functions
│   ├── health.test.js
│   ├── login.test.js
│   └── apiClient.test.js
├── integration/       # Integration tests for API endpoints
│   └── api.test.js
├── manual/           # Manual test scripts
│   ├── testDriverNotifications.js
│   ├── testDriverNotificationIntegration.js
│   ├── testEmailComposition.js
│   ├── test.js
│   └── testAdvanced.js
└── package.json       # Test dependencies and scripts
```

## Running Tests

### Install Test Dependencies

```bash
cd tests
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Specific Test Files

```bash
# Run only unit tests
npm test -- --testPathPattern=".*\.test\.js$"

# Run only integration tests
npm run test:integration

# Run tests for specific function
npm test -- login.test.js
```

## Test Types

### 1. Unit Tests

Unit tests focus on testing individual Lambda functions in isolation.

**Example: `health.test.js`**
- Tests the health check Lambda function
- Mocks environment variables
- Verifies response structure and status codes
- Tests error handling

**Example: `login.test.js`**
- Tests authentication logic
- Mocks database connections
- Tests password validation
- Verifies JWT token generation
- Tests error scenarios

### 2. Integration Tests

Integration tests verify that API endpoints work correctly with the actual infrastructure.

**Example: `integration.test.js`**
- Tests API Gateway endpoints
- Verifies authentication flow
- Tests CORS headers
- Validates error responses
- Tests complete user workflows

### 3. Shared Utility Tests

Tests for shared modules used across multiple Lambda functions.

**Example: `shared/apiClient.test.js`**
- Tests token management logic
- Mocks AWS SDK calls
- Tests token refresh scenarios
- Verifies error handling

## Mocking Strategies

### AWS SDK Mocking

```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

jest.mock('@aws-sdk/client-dynamodb');

const mockDynamoClient = {
    send: jest.fn()
};
DynamoDBClient.mockImplementation(() => mockDynamoClient);
```

### Database Mocking

```javascript
const { Client } = require('pg');

jest.mock('pg');

const mockPgClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
};
Client.mockImplementation(() => mockPgClient);
```

### External API Mocking

```javascript
const axios = require('axios');

jest.mock('axios');

axios.post.mockResolvedValue({
    data: {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh-token'
    }
});
```

## Test Data Management

### Environment Variables

```javascript
beforeEach(() => {
    process.env.NEON_DB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
});

afterEach(() => {
    delete process.env.NEON_DB_CONNECTION_STRING;
    delete process.env.JWT_SECRET;
    delete process.env.DYNAMODB_TABLE_NAME;
});
```

### Mock Data

```javascript
const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed-password',
    role: 'user'
};

const mockEvent = {
    httpMethod: 'POST',
    path: '/api/v1/auth/login',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
    })
};
```

## Test Coverage

### Coverage Goals

- **Unit Tests**: 80%+ coverage for Lambda functions
- **Integration Tests**: Cover all API endpoints
- **Critical Paths**: 100% coverage for authentication and core business logic

### Coverage Reports

```bash
npm run test:coverage
```

This generates:
- Console output with coverage summary
- HTML report in `coverage/lcov-report/index.html`
- LCOV file for CI/CD integration

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd terraform/lambda && npm install
      - run: cd terraform/lambda && npm test
      - run: cd terraform/lambda && npm run test:coverage
```

## Manual Testing

### Test Scripts

Use the provided test scripts for manual testing:

```bash
# Test API endpoints
./Other/test_endpoints.sh

# Test driver notifications
./Other/testDriverNotifications.sh

# Debug Lambda functions
./Other/debug_lambdas.sh
```

### Postman Collection

Create a Postman collection for API testing:

1. Import the API endpoints
2. Set up environment variables
3. Create test scripts for each endpoint
4. Run automated tests

## Best Practices

### 1. Test Organization

- One test file per Lambda function
- Group related tests in describe blocks
- Use descriptive test names
- Keep tests focused and atomic

### 2. Mocking

- Mock external dependencies
- Use realistic mock data
- Reset mocks between tests
- Verify mock interactions

### 3. Assertions

- Test both success and error cases
- Verify response structure
- Check status codes
- Validate data types

### 4. Test Data

- Use consistent test data
- Clean up after tests
- Avoid hardcoded values
- Use factories for complex data

### 5. Error Testing

- Test all error scenarios
- Verify error messages
- Check error status codes
- Test edge cases

## Troubleshooting

### Common Issues

1. **Environment Variables**: Ensure all required env vars are set in tests
2. **Mock Timing**: Use `await` for async operations
3. **Database Connections**: Mock database calls to avoid real connections
4. **AWS Credentials**: Tests should not require real AWS credentials

### Debug Tips

```javascript
// Enable verbose logging
process.env.DEBUG = 'true';

// Log test data
console.log('Test data:', JSON.stringify(mockData, null, 2));

// Check mock calls
expect(mockFunction).toHaveBeenCalledWith(expectedArgs);
```

## Performance Testing

### Load Testing

Use tools like Artillery or k6 for load testing:

```javascript
// artillery-config.yml
config:
  target: 'https://your-api-gateway-url.execute-api.eu-north-1.amazonaws.com/prod'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Health Check"
    requests:
      - get:
          url: "/health"
```

### Stress Testing

Test Lambda function limits:
- Concurrent executions
- Memory usage
- Timeout scenarios
- Error rates under load
