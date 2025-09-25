#!/usr/bin/env node

// Simple health-only smoke test for local testing
const axios = require('axios');

async function testHealthEndpoint(baseURL) {
    console.log(`🏥 Testing health endpoint: ${baseURL}/health`);

    try {
        const response = await axios.get(`${baseURL}/health`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'HealthTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.status || response.data.status !== 'OK') {
            throw new Error(`Expected status 'OK', got '${response.data.status}'`);
        }

        console.log('✅ Health endpoint is working!');
        console.log('📊 Response:', JSON.stringify(response.data, null, 2));
        return true;

    } catch (error) {
        console.error('❌ Health endpoint failed:', error.message);
        return false;
    }
}

async function main() {
    const baseURL = process.env.API_BASE_URL || process.env.SMOKE_TEST_URL;

    if (!baseURL) {
        console.error('❌ API_BASE_URL or SMOKE_TEST_URL environment variable is required');
        console.log('Usage: API_BASE_URL=https://your-api-url node test-health-only.js');
        process.exit(1);
    }

    console.log(`🚀 Testing: ${baseURL}`);
    console.log('='.repeat(50));

    const success = await testHealthEndpoint(baseURL);

    if (success) {
        console.log('✅ Health test passed!');
        process.exit(0);
    } else {
        console.log('❌ Health test failed!');
        process.exit(1);
    }
}

main().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});
