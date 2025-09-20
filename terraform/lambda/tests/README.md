# Test Suite

This directory contains all tests for the Trackmania Record Watcher application.

## Structure

- **`unit/`** - Unit tests for individual Lambda functions
- **`integration/`** - Integration tests for API endpoints  
- **`manual/`** - Manual test scripts for Lambda functions
- **`package.json`** - Test dependencies and scripts

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Test Types

### Unit Tests
Test individual Lambda functions in isolation with mocked dependencies.

**Examples:**
- `health.test.js` - Tests health check Lambda
- `login.test.js` - Tests authentication logic
- `apiClient.test.js` - Tests shared API client utilities

### Integration Tests
Test API endpoints with real infrastructure (requires deployed environment).

**Examples:**
- `api.test.js` - Tests all API endpoints

### Manual Tests
Standalone test scripts for Lambda functions that can be run manually.

**Examples:**
- `testDriverNotifications.js` - Test driver notification logic
- `testEmailComposition.js` - Test email composition
- `testDriverNotificationIntegration.js` - Complete integration test

## Running Manual Tests

```bash
# Run individual manual tests
node tests/manual/testDriverNotifications.js
node tests/manual/testEmailComposition.js

# Or use the test runner script
./Other/testDriverNotifications.sh
```

## Configuration

Tests use Jest as the testing framework with the following configuration:

- **Test Environment**: Node.js
- **Coverage**: Reports generated in `coverage/` directory
- **Mocking**: AWS SDK and external dependencies are mocked
- **Timeout**: 30 seconds for integration tests

## Environment Variables

For integration tests, set the API base URL:

```bash
export API_BASE_URL=https://your-api-gateway-url.execute-api.eu-north-1.amazonaws.com/prod
```

## Best Practices

1. **Unit Tests**: Mock all external dependencies
2. **Integration Tests**: Use real API endpoints
3. **Manual Tests**: Include comprehensive logging
4. **Coverage**: Aim for 80%+ coverage on critical paths
5. **Naming**: Use descriptive test names and group related tests

## Troubleshooting

### Common Issues

1. **Module not found**: Ensure you're running tests from the `tests/` directory
2. **AWS credentials**: Unit tests don't need real AWS credentials
3. **Timeout errors**: Increase timeout for integration tests
4. **Mock failures**: Check that mocks are properly configured

### Debug Tips

```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- health.test.js

# Run tests in watch mode
npm run test:watch
```
