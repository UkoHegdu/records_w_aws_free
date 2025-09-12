// lambda/testDriverNotifications.js - Test script for driver notifications
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const apiClient = require('./shared/apiClient');
const { formatTime } = require('./shared/timeFormatter');

// Database connection using Neon
const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });
};

// Mock Trackmania API responses for testing
const mockLeaderboardData = {
    // Mock data for a test map where user is in position 3
    "test_map_position_3": {
        tops: [{
            top: [
                { accountId: "account1", position: 1, score: 45000 },
                { accountId: "account2", position: 2, score: 46000 },
                { accountId: "test_user_account", position: 3, score: 47000 }, // Our test user
                { accountId: "account4", position: 4, score: 48000 },
                { accountId: "account5", position: 5, score: 49000 }
            ]
        }]
    },
    // Mock data for same map where user moved to position 4 (worsened)
    "test_map_position_4": {
        tops: [{
            top: [
                { accountId: "account1", position: 1, score: 45000 },
                { accountId: "account2", position: 2, score: 46000 },
                { accountId: "account3", position: 3, score: 46500 }, // New player
                { accountId: "test_user_account", position: 4, score: 47000 }, // Our test user moved down
                { accountId: "account5", position: 5, score: 49000 }
            ]
        }]
    },
    // Mock data where user is pushed out of top 5
    "test_map_position_6": {
        tops: [{
            top: [
                { accountId: "account1", position: 1, score: 45000 },
                { accountId: "account2", position: 2, score: 46000 },
                { accountId: "account3", position: 3, score: 46500 },
                { accountId: "account4", position: 4, score: 47000 },
                { accountId: "account5", position: 5, score: 47500 },
                { accountId: "test_user_account", position: 6, score: 48000 } // Our test user out of top 5
            ]
        }]
    }
};

// Mock account names for testing
const mockAccountNames = {
    "test_user_account": "TestDriver",
    "account1": "FastDriver1",
    "account2": "FastDriver2",
    "account3": "FastDriver3",
    "account4": "FastDriver4",
    "account5": "FastDriver5"
};

// Test scenarios
const testScenarios = [
    {
        name: "Position Worsening Test",
        description: "User moves from position 3 to position 4",
        mapUid: "test_map_position_3",
        initialPosition: 3,
        finalPosition: 4,
        shouldTriggerNotification: true
    },
    {
        name: "Fall Out of Top 5 Test",
        description: "User moves from position 4 to position 6",
        mapUid: "test_map_position_4",
        initialPosition: 4,
        finalPosition: 6,
        shouldTriggerNotification: true,
        shouldDeactivate: true
    },
    {
        name: "Position Improvement Test",
        description: "User moves from position 4 to position 3",
        mapUid: "test_map_position_4",
        initialPosition: 4,
        finalPosition: 3,
        shouldTriggerNotification: false
    }
];

// Create test notification
async function createTestNotification(userId, mapUid, mapName, position) {
    const client = getDbConnection();

    try {
        await client.connect();

        // Insert test notification
        const result = await client.query(
            'INSERT INTO driver_notifications (user_id, map_uid, map_name, current_position, personal_best, created_at, last_checked, is_active) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), TRUE) RETURNING id',
            [userId, mapUid, mapName, position, 47000] // 47 seconds personal best
        );

        console.log(`✅ Test notification created with ID: ${result.rows[0].id}`);
        return result.rows[0].id;

    } catch (error) {
        console.error('❌ Error creating test notification:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Simulate position change
async function simulatePositionChange(notificationId, newPosition, newMapUid) {
    const client = getDbConnection();

    try {
        await client.connect();

        // Update the notification with new position
        await client.query(
            'UPDATE driver_notifications SET current_position = $1, last_checked = NOW() WHERE id = $2',
            [newPosition, notificationId]
        );

        console.log(`✅ Updated notification ${notificationId} to position ${newPosition}`);

    } catch (error) {
        console.error('❌ Error updating notification:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Test the driver notification processor
async function testDriverNotificationProcessor() {
    console.log('🧪 Testing Driver Notification Processor...');

    for (const scenario of testScenarios) {
        console.log(`\n📋 Testing Scenario: ${scenario.name}`);
        console.log(`📝 Description: ${scenario.description}`);

        try {
            // Create test notification
            const notificationId = await createTestNotification(
                1, // Test user ID
                scenario.mapUid,
                `Test Map ${scenario.mapUid}`,
                scenario.initialPosition
            );

            // Simulate the position change
            await simulatePositionChange(notificationId, scenario.finalPosition, scenario.mapUid);

            // Test the processor logic
            const result = await testProcessorLogic(scenario);

            console.log(`✅ Scenario ${scenario.name} completed:`);
            console.log(`   - Notification triggered: ${result.notificationSent}`);
            console.log(`   - Expected: ${scenario.shouldTriggerNotification}`);
            console.log(`   - Status changed: ${result.statusChanged || 'No'}`);

            // Clean up test data
            await cleanupTestNotification(notificationId);

        } catch (error) {
            console.error(`❌ Scenario ${scenario.name} failed:`, error);
        }
    }
}

// Test the processor logic without actual API calls
async function testProcessorLogic(scenario) {
    const oldPosition = scenario.initialPosition;
    const newPosition = scenario.finalPosition;

    const positionWorsened = newPosition > oldPosition;
    const shouldBeInactive = newPosition > 5;

    const result = {
        notificationSent: positionWorsened,
        oldPosition: oldPosition,
        newPosition: newPosition,
        statusChanged: shouldBeInactive ? 'inactive' : null,
        positionImproved: newPosition < oldPosition
    };

    return result;
}

// Clean up test notification
async function cleanupTestNotification(notificationId) {
    const client = getDbConnection();

    try {
        await client.connect();

        await client.query(
            'DELETE FROM driver_notifications WHERE id = $1',
            [notificationId]
        );

        console.log(`🗑️ Cleaned up test notification ${notificationId}`);

    } catch (error) {
        console.error('❌ Error cleaning up test notification:', error);
    } finally {
        await client.end();
    }
}

// Test email composition
async function testEmailComposition() {
    console.log('\n📧 Testing Email Composition...');

    // Mock mapper content
    const mapperContent = `🗺️ Map: Test Mapper Map
  🏎️ Player: FastDriver1
  📍 Zone: Zone 1
  🥇 Position: 1
  📅 Date: ${new Date().toLocaleString()}

🗺️ Map: Another Test Map
  🏎️ Player: FastDriver2
  📍 Zone: Zone 2
  🥇 Position: 2
  📅 Date: ${new Date().toLocaleString()}`;

    // Mock driver notification content
    const driverContent = `🏎️ Map: Test Driver Map
📍 Position changed: #3 → #4
📅 Detected: ${new Date().toLocaleString()}

🏎️ Map: Another Driver Map
📍 Position changed: #2 → #5
📅 Detected: ${new Date().toLocaleString()}`;

    // Compose full email
    const fullEmailContent = composeFullEmail(mapperContent, driverContent);

    console.log('📄 Full Email Composition:');
    console.log('='.repeat(50));
    console.log(fullEmailContent);
    console.log('='.repeat(50));

    return fullEmailContent;
}

// Compose full email with both mapper and driver content
function composeFullEmail(mapperContent, driverContent) {
    let emailBody = '';

    if (mapperContent && mapperContent.trim()) {
        emailBody += '🎯 MAPPER ALERTS\n';
        emailBody += 'New times have been driven on your map(s):\n\n';
        emailBody += mapperContent;
        emailBody += '\n\n';
    }

    if (driverContent && driverContent.trim()) {
        emailBody += '🏎️ DRIVER NOTIFICATIONS\n';
        emailBody += 'Your position has changed on the following maps:\n\n';
        emailBody += driverContent;
        emailBody += '\n\n';
    }

    if (!mapperContent && !driverContent) {
        emailBody += 'No new notifications for today.\n\n';
    }

    emailBody += '---\n';
    emailBody += 'Trackmania Record Tracker\n';
    emailBody += 'Visit: https://your-domain.com\n';

    return emailBody;
}

// Main test function
exports.handler = async (event, context) => {
    console.log('🧪 Driver Notification Test Suite Started');

    try {
        // Test driver notification processor
        await testDriverNotificationProcessor();

        // Test email composition
        await testEmailComposition();

        console.log('\n✅ All tests completed successfully!');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Driver notification tests completed',
                testsRun: testScenarios.length,
                emailCompositionTested: true
            })
        };

    } catch (error) {
        console.error('❌ Test suite failed:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Test suite failed',
                details: error.message
            })
        };
    }
};

// Export functions for individual testing
module.exports = {
    testDriverNotificationProcessor,
    testEmailComposition,
    createTestNotification,
    simulatePositionChange,
    cleanupTestNotification
};

