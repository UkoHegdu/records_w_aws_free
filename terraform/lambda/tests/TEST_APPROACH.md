# Unit Testing Approach & Lessons Learned

## 📋 **Overview**

This document captures lessons learned from implementing unit tests for AWS Lambda functions, focusing on Jest mocking strategies for complex dependencies like AWS SDK v3, PostgreSQL, and security utilities.

---

## 🎯 **Core Principles**

### **1. Mock Strategy**
- **Mock at the module level**, not individual functions
- **Set up mocks BEFORE importing** the module being tested
- **Understand the mock lifecycle** - when they're created, cleared, and destroyed

### **2. Test Design**
- **Start simple** - verify basic functionality first
- **Add complexity gradually** - one mock at a time
- **Read the actual code** to understand expected behavior
- **Always verify actual vs expected behavior**

### **3. Debugging Approach**
- **Add console.log statements** to see what's being called
- **Check mock call counts** to verify mocks are working
- **Examine error messages carefully** - they often reveal the real issue

---

## 🔧 **Mocking Patterns by Technology**

### **AWS SDK v3 (DynamoDB, SQS, SES)**
```javascript
// ✅ Good: Mock entire module with persistent client
const mockDynamoClient = { send: jest.fn() };
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => mockDynamoClient),
    GetItemCommand: jest.fn(),
    PutItemCommand: jest.fn()
}));

// ✅ Good: Proper DynamoDB format conversion
jest.mock('@aws-sdk/util-dynamodb', () => ({
    unmarshall: jest.fn((item) => {
        if (!item) return null;
        const result = {};
        for (const [key, value] of Object.entries(item)) {
            if (value.S) result[key] = value.S;      // String
            else if (value.N) result[key] = parseInt(value.N); // Number
            else result[key] = value;
        }
        return result;
    })
}));
```

### **PostgreSQL Client**
```javascript
// ✅ Good: Mock PostgreSQL client like DynamoDB
const mockClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
};

jest.mock('pg', () => ({
    Client: jest.fn().mockImplementation(() => mockClient)
}));
```

### **Security Utilities**
```javascript
// ✅ Good: Mock with realistic return values
jest.mock('../../securityUtils', () => ({
    validateAndSanitizeInput: jest.fn(),
    checkRateLimit: jest.fn()
}));

// In tests, provide realistic mock responses
validateAndSanitizeInput.mockReturnValueOnce({ 
    isValid: false, 
    error: 'Email is required' 
});
```

---

## 🛠️ **Mock Management Strategies**

### **Setup Order**
```javascript
// ✅ Good: Mock before import
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('../../securityUtils');
const { handler } = require('../../register');

// ❌ Bad: Import before mock
const { handler } = require('../../register');
jest.mock('@aws-sdk/client-dynamodb'); // Too late!
```

### **Mock Isolation**
```javascript
// ✅ Good: Different strategies for different mocks
beforeEach(() => {
    jest.clearAllMocks();           // Clear call history
    axios.post.mockReset();         // Reset to default behavior
    mockDynamoClient.send = jest.fn(); // Re-setup persistent mock
});

// ❌ Bad: One-size-fits-all approach
beforeEach(() => {
    jest.clearAllMocks(); // Breaks module-level mocks!
});
```

### **Test Data Helpers**
```javascript
// ✅ Good: Helper functions for creating test data
const createMockEvent = (body, sourceIp = '192.168.1.1') => ({
    body: JSON.stringify(body),
    requestContext: {
        identity: { sourceIp: sourceIp }
    }
});

// ✅ Good: Consistent mock setup in beforeEach
beforeEach(() => {
    validateAndSanitizeInput
        .mockReturnValueOnce({ isValid: true, sanitized: 'test@example.com' })
        .mockReturnValueOnce({ isValid: true, sanitized: 'password123' })
        .mockReturnValueOnce({ isValid: true, sanitized: 'testuser' });
});
```

---

## 🚨 **Common Pitfalls & Solutions**

### **1. Mock Setup Complexity**
**Problem**: Jest mocking requires precise timing and order
```javascript
// ❌ Bad: Mocks must be set up BEFORE importing the module being tested
const { handler } = require('../../login');
jest.mock('@aws-sdk/client-dynamodb'); // Too late!

// ✅ Good: Move all jest.mock() calls to the top of the file, before imports
jest.mock('@aws-sdk/client-dynamodb');
const { handler } = require('../../login');
```

### **2. Mock Clearing Side Effects**
**Problem**: `jest.clearAllMocks()` was clearing mocks that needed to persist
```javascript
// ❌ Bad: DynamoDB client was created at module level, so clearing mocks broke it
jest.clearAllMocks(); // Mock is now undefined!

// ✅ Good: Re-setup mocks after clearing, or avoid clearing certain mocks
jest.clearAllMocks();
mockDynamoClient.send = jest.fn(); // Re-setup
```

### **3. Response Structure Mismatches**
**Problem**: Test expectations didn't match actual code behavior
```javascript
// ❌ Bad: Code returns access_token/refresh_token, test expected accessToken/refreshToken
expect(body.accessToken).toBe('mock-jwt-token');

// ✅ Good: Read the actual code to understand response structure
expect(body.access_token).toBe('mock-jwt-token');
```

### **4. Module-Level Client Instantiation**
**Problem**: Clients created at import time, not test time
```javascript
// ❌ Bad: Trying to access mock after module import
mockClient = Client.mock.results[0].value; // Undefined!

// ✅ Good: Persistent mock client
const mockClient = { send: jest.fn() };
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => mockClient)
}));
```

### **5. Header Expectations Mismatch**
**Problem**: Tests expect different headers than actual code returns
```javascript
// ❌ Bad: Assuming all responses have same headers
expect(result.headers).toEqual(expectedHeaders); // Wrong!

// ✅ Good: Check actual behavior first, then write expectations
// Error responses: Only CORS headers
// Success responses: All security headers
```

### **6. Empty Body Handling**
**Problem**: Empty body becomes `{}` after JSON.parse, not null
```javascript
// ❌ Bad: Expecting JSON parse error for empty body
const event = { body: null };
// JSON.parse(event.body || '{}') becomes JSON.parse('{}') - succeeds!

// ✅ Good: Mock validation for empty object
validateAndSanitizeInput.mockReturnValueOnce({ 
    isValid: false, 
    error: 'Email is required' 
});
```

### **7. Unrealistic Mock Data**
**Problem**: Mocks return wrong data structures
```javascript
// ❌ Bad: Simple boolean return
validateAndSanitizeInput.mockReturnValueOnce(true); // Wrong structure!

// ✅ Good: Realistic validation response
validateAndSanitizeInput.mockReturnValueOnce({ 
    isValid: true, 
    sanitized: 'test@example.com' 
});
```

---

## 📚 **Testing Strategy Overview**

### **Test Types**
- **Unit Tests**: Test individual functions in isolation using mocks
- **Integration Tests**: Test complete workflows with real services
- **Manual Tests**: Test scripts for specific scenarios

### **What to Mock**
- **External Dependencies**: Always mock (AWS SDK, databases, external APIs)
- **Internal Utilities**: Mock complex functions that have side effects
- **Simple Functions**: Usually don't need mocking

### **Test Structure**
```
tests/
├── unit/              # Unit tests for individual Lambda functions
├── integration/       # Integration tests for API endpoints
├── manual/           # Manual test scripts
└── TEST_APPROACH.md  # This file
```

### **Running Tests**
```bash
# Navigate to lambda directory first
cd terraform/lambda

# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific test file
npm test login.test.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with verbose output
npx jest --verbose

# Run specific test by name pattern
npx jest --testNamePattern="should handle pagination correctly"
```

---

## 🎓 **Why This Was Educational**

### **Real-World Complexity**
Unit testing isn't just "call function, check result" - it involves:
- Complex dependency management
- Mock lifecycle management  
- Understanding framework internals
- Balancing test coverage vs maintainability

### **Framework Knowledge**
- **Jest mocking** has specific rules and timing requirements
- **AWS SDK v3** has different patterns than v2
- **Node.js module system** affects how mocks work

### **Debugging Skills**
- **Systematic approach** to isolating issues
- **Reading error messages** carefully
- **Using debug tools** effectively
- **Understanding the difference** between expected vs actual behavior

---

## 🆕 **Additional General Lessons**

### **Command Object Mocking Pattern**
**Problem**: When mocking command constructors, they need to return the expected structure
```javascript
// ❌ Bad: Command mocks return undefined
SomeCommand: jest.fn()

// ✅ Good: Command mocks return input wrapped in expected structure
SomeCommand: jest.fn().mockImplementation((input) => ({ input }))
```

### **Test-Driven Bug Discovery**
**Value**: Unit tests can reveal production bugs that would otherwise go unnoticed
- Tests force understanding of actual data flow
- Reveal type mismatches and logic errors
- Lead to more robust production code
- **Always check before fixing production bugs found during testing**

### **Mock Lifecycle Management**
**Problem**: Module-level state can persist across tests when not managed properly
```javascript
// ❌ Bad: Module imported inside beforeEach (re-imports every test)
beforeEach(() => {
    const module = require('../../module'); // Fresh import every time
});

// ✅ Good: Import once after mocks, manage state in tests
jest.mock('../../dependency');
const { handler } = require('../../module'); // Imported once
```

### **Data Type Validation in Tests**
**Problem**: Tests should validate that mocks return the correct data types
- Objects vs Arrays: Check `.length` only on arrays
- Null vs Undefined: Understand the difference
- **Always verify mock data matches production expectations**

### **8. Module Export Issues**
**Problem**: Shared modules not properly exporting functions needed for testing
```javascript
// ❌ Bad: Function exists but not exported
const getValidAccessToken = async () => { /* ... */ };
module.exports = apiClient; // getValidAccessToken not available

// ✅ Good: Export all functions needed for testing
module.exports = {
    ...apiClient,
    getValidAccessToken
};
```

### **9. Rate Limiting Mocking**
**Problem**: Security utilities with rate limiting need proper mocking in authentication tests
```javascript
// ❌ Bad: Missing security utils mock causes 429 responses
jest.mock('@aws-sdk/client-dynamodb');
const { handler } = require('../../login'); // Rate limiting not mocked!

// ✅ Good: Mock security utilities before importing
jest.mock('../../securityUtils', () => ({
    validateAndSanitizeInput: jest.fn(),
    checkRateLimit: jest.fn()
}));

// In beforeEach, set up realistic mock responses
checkRateLimit.mockReturnValue(true); // Allow requests
validateAndSanitizeInput.mockReturnValue({ isValid: true, sanitized: 'test@example.com' });
```

### **10. Data Structure Consistency**
**Problem**: Mocked data structures don't match what actual functions expect
```javascript
// ❌ Bad: Function expects array but gets object
const filtered = period ? filterRecordsByPeriod(leaderboard, period) : leaderboard;
if (filtered.length > 0) { // Error: filtered is { tops: [...] }, not array

// ✅ Good: Always ensure consistent data types
const filtered = filterRecordsByPeriod(leaderboard, period || '1d');
// filterRecordsByPeriod always returns an array
```

### **11. Dependency Management**
**Problem**: Missing dependencies cause test failures
```javascript
// ❌ Bad: Test tries to mock module not in package.json
jest.mock('@aws-sdk/client-sqs', () => ({ /* ... */ }));
// Error: Cannot find module '@aws-sdk/client-sqs'

// ✅ Good: Ensure all required dependencies are installed
npm install @aws-sdk/client-sqs
```

### **12. Timeout Configuration Mismatches**
**Problem**: Test expectations don't match actual implementation timeouts
```javascript
// ❌ Bad: Test expects different timeout than implementation
expect(axios.post).toHaveBeenCalledWith(url, data, {
    timeout: 60000 // Test expects 60s
});

// ✅ Good: Check actual implementation and match expectations
// Implementation uses 30000ms, so test should expect 30000ms
expect(axios.post).toHaveBeenCalledWith(url, data, {
    timeout: 30000 // Match actual implementation
});
```
