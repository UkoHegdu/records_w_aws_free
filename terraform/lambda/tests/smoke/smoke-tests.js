// Smoke Tests for Service Connectivity Verification
const axios = require('axios');

class SmokeTestRunner {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.results = [];
        this.startTime = Date.now();
    }

    async runTest(name, testFunction) {
        const testStart = Date.now();
        try {
            console.log(`🧪 Running smoke test: ${name}`);
            await testFunction();
            const duration = Date.now() - testStart;
            this.results.push({
                name,
                status: 'PASS',
                duration,
                error: null
            });
            console.log(`✅ ${name} - PASSED (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - testStart;
            this.results.push({
                name,
                status: 'FAIL',
                duration,
                error: error.message
            });
            console.log(`❌ ${name} - FAILED (${duration}ms): ${error.message}`);
        }
    }

    async testHealthEndpoint() {
        const response = await axios.get(`${this.baseURL}/health`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'SmokeTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.status || response.data.status !== 'OK') {
            throw new Error(`Expected status 'OK', got '${response.data.status}'`);
        }

        if (!response.data.timestamp) {
            throw new Error('Missing timestamp in response');
        }

        if (!response.data.services) {
            throw new Error('Missing services information');
        }
    }

    async testUserSearchEndpoint() {
        const response = await axios.get(`${this.baseURL}/api/v1/users/search?username=test`, {
            timeout: 15000,
            headers: {
                'User-Agent': 'SmokeTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.users || !Array.isArray(response.data.users)) {
            throw new Error('Response should contain users array');
        }
    }

    async testMapSearchEndpoint() {
        const response = await axios.get(`${this.baseURL}/api/v1/users/maps?username=test`, {
            timeout: 20000,
            headers: {
                'User-Agent': 'SmokeTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.job_id) {
            throw new Error('Response should contain job_id');
        }
    }

    async testRecordsEndpoint() {
        const response = await axios.get(`${this.baseURL}/api/v1/records/latest`, {
            timeout: 15000,
            headers: {
                'User-Agent': 'SmokeTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.records || !Array.isArray(response.data.records)) {
            throw new Error('Response should contain records array');
        }
    }

    async testAccountNamesEndpoint() {
        const response = await axios.post(`${this.baseURL}/api/v1/account-names`, {
            account_ids: ['test123']
        }, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SmokeTest/1.0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        if (!response.data.account_names || !Array.isArray(response.data.account_names)) {
            throw new Error('Response should contain account_names array');
        }
    }

    async testCORSHeaders() {
        const response = await axios.options(`${this.baseURL}/health`, {
            timeout: 5000,
            headers: {
                'Origin': 'https://example.com',
                'Access-Control-Request-Method': 'GET'
            }
        });

        if (!response.headers['access-control-allow-origin']) {
            throw new Error('Missing CORS headers');
        }
    }

    async testErrorHandling() {
        try {
            await axios.get(`${this.baseURL}/api/v1/users/search`, {
                timeout: 10000
            });
            throw new Error('Expected 400 error for missing username parameter');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                // This is expected
                return;
            }
            throw new Error(`Expected 400 error, got ${error.response?.status || 'network error'}`);
        }
    }

    async testResponseTime() {
        const start = Date.now();
        await axios.get(`${this.baseURL}/health`, {
            timeout: 10000
        });
        const duration = Date.now() - start;

        if (duration > 5000) {
            throw new Error(`Response time too slow: ${duration}ms (expected < 5000ms)`);
        }
    }

    async testDatabaseConnectivity() {
        // Test database connectivity through a simple endpoint
        const response = await axios.get(`${this.baseURL}/health`, {
            timeout: 10000
        });

        if (response.data.services && response.data.services.database !== 'OK') {
            throw new Error(`Database connectivity issue: ${response.data.services.database}`);
        }
    }

    async testLambdaColdStart() {
        // Test cold start by making a request after a delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const start = Date.now();
        await axios.get(`${this.baseURL}/health`, {
            timeout: 15000
        });
        const duration = Date.now() - start;

        if (duration > 10000) {
            throw new Error(`Cold start too slow: ${duration}ms (expected < 10000ms)`);
        }
    }

    async runAllTests() {
        console.log(`🚀 Starting smoke tests for: ${this.baseURL}`);
        console.log('='.repeat(60));

        await this.runTest('Health Endpoint', () => this.testHealthEndpoint());
        await this.runTest('User Search Endpoint', () => this.testUserSearchEndpoint());
        await this.runTest('Map Search Endpoint', () => this.testMapSearchEndpoint());
        await this.runTest('Records Endpoint', () => this.testRecordsEndpoint());
        await this.runTest('Account Names Endpoint', () => this.testAccountNamesEndpoint());
        await this.runTest('CORS Headers', () => this.testCORSHeaders());
        await this.runTest('Error Handling', () => this.testErrorHandling());
        await this.runTest('Response Time', () => this.testResponseTime());
        await this.runTest('Database Connectivity', () => this.testDatabaseConnectivity());
        await this.runTest('Lambda Cold Start', () => this.testLambdaColdStart());

        this.printSummary();
        return this.getResults();
    }

    printSummary() {
        const totalDuration = Date.now() - this.startTime;
        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;

        console.log('='.repeat(60));
        console.log('📊 SMOKE TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${this.results.length}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏱️  Total Duration: ${totalDuration}ms`);
        console.log('='.repeat(60));

        if (failed > 0) {
            console.log('❌ FAILED TESTS:');
            this.results
                .filter(r => r.status === 'FAIL')
                .forEach(r => {
                    console.log(`   • ${r.name}: ${r.error}`);
                });
        }

        console.log('='.repeat(60));
    }

    getResults() {
        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;

        return {
            total: this.results.length,
            passed,
            failed,
            success: failed === 0,
            results: this.results
        };
    }
}

// Main execution function
async function runSmokeTests() {
    const baseURL = process.env.API_BASE_URL || process.env.SMOKE_TEST_URL;

    if (!baseURL) {
        console.error('❌ API_BASE_URL or SMOKE_TEST_URL environment variable is required');
        process.exit(1);
    }

    const runner = new SmokeTestRunner(baseURL);
    const results = await runner.runAllTests();

    if (!results.success) {
        console.error('❌ Smoke tests failed!');
        process.exit(1);
    } else {
        console.log('✅ All smoke tests passed!');
        process.exit(0);
    }
}

// Export for use in other test files
module.exports = { SmokeTestRunner };

// Run if called directly
if (require.main === module) {
    runSmokeTests().catch(error => {
        console.error('💥 Smoke test runner failed:', error);
        process.exit(1);
    });
}
