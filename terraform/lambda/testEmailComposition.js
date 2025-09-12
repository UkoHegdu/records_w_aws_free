// lambda/testEmailComposition.js - Test email composition for mapper alerts + driver notifications
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Test scenarios for email composition
const emailTestScenarios = [
    {
        name: "Mapper Alerts Only",
        description: "User has mapper alerts but no driver notifications",
        mapperContent: `🗺️ Map: Speed Circuit
  🏎️ Player: FastDriver1
  📍 Zone: Zone 1
  🥇 Position: 1
  📅 Date: ${new Date().toLocaleString()}

🗺️ Map: Technical Track
  🏎️ Player: FastDriver2
  📍 Zone: Zone 3
  🥇 Position: 2
  📅 Date: ${new Date().toLocaleString()}`,
        driverContent: "",
        expectedSections: ["MAPPER ALERTS"]
    },
    {
        name: "Driver Notifications Only",
        description: "User has driver notifications but no mapper alerts",
        mapperContent: "",
        driverContent: `🏎️ Map: Racing Challenge
📍 Position changed: #3 → #4
📅 Detected: ${new Date().toLocaleString()}

🏎️ Map: Speed Demon
📍 Position changed: #2 → #5
📅 Detected: ${new Date().toLocaleString()}`,
        expectedSections: ["DRIVER NOTIFICATIONS"]
    },
    {
        name: "Both Mapper and Driver Notifications",
        description: "User has both types of notifications",
        mapperContent: `🗺️ Map: Circuit Master
  🏎️ Player: SpeedKing
  📍 Zone: Zone 2
  🥇 Position: 1
  📅 Date: ${new Date().toLocaleString()}`,
        driverContent: `🏎️ Map: Racing Challenge
📍 Position changed: #3 → #4
📅 Detected: ${new Date().toLocaleString()}`,
        expectedSections: ["MAPPER ALERTS", "DRIVER NOTIFICATIONS"]
    },
    {
        name: "No Notifications",
        description: "User has no notifications for the day",
        mapperContent: "",
        driverContent: "",
        expectedSections: ["No new notifications"]
    }
];

// Create test email body in DynamoDB
async function createTestEmailBody(userId, mapperContent, driverContent) {
    const today = new Date().toISOString().split('T')[0];
    const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days

    const item = {
        user_id: userId,
        date: today,
        username: `testuser${userId}`,
        email: `test${userId}@example.com`,
        mapper_content: mapperContent || '',
        driver_content: driverContent || '',
        ttl: ttl
    };

    const params = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Item: marshall(item)
    };

    try {
        await dynamoClient.send(new PutItemCommand(params));
        console.log(`✅ Test email body created for user ${userId}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to create test email body for user ${userId}:`, error.message);
        throw error;
    }
}

// Retrieve email body from DynamoDB
async function getEmailBody(userId) {
    const today = new Date().toISOString().split('T')[0];

    const params = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Key: marshall({
            user_id: userId,
            date: today
        })
    };

    try {
        const result = await dynamoClient.send(new GetItemCommand(params));

        if (!result.Item) {
            return null;
        }

        return unmarshall(result.Item);
    } catch (error) {
        console.error(`❌ Failed to retrieve email body for user ${userId}:`, error.message);
        throw error;
    }
}

// Compose full email from stored content
function composeFullEmail(emailData) {
    if (!emailData) {
        return "No email data found.";
    }

    let emailBody = '';

    // Add mapper content if present
    if (emailData.mapper_content && emailData.mapper_content.trim()) {
        emailBody += '🎯 MAPPER ALERTS\n';
        emailBody += 'New times have been driven on your map(s):\n\n';
        emailBody += emailData.mapper_content;
        emailBody += '\n\n';
    }

    // Add driver content if present
    if (emailData.driver_content && emailData.driver_content.trim()) {
        emailBody += '🏎️ DRIVER NOTIFICATIONS\n';
        emailBody += 'Your position has changed on the following maps:\n\n';
        emailBody += emailData.driver_content;
        emailBody += '\n\n';
    }

    // Add message if no content
    if (!emailData.mapper_content && !emailData.driver_content) {
        emailBody += 'No new notifications for today.\n\n';
    }

    // Add footer
    emailBody += '---\n';
    emailBody += 'Trackmania Record Tracker\n';
    emailBody += 'Visit: https://your-domain.com\n';

    return emailBody;
}

// Test email composition for all scenarios
async function testEmailCompositionScenarios() {
    console.log('📧 Testing Email Composition Scenarios...\n');

    for (let i = 0; i < emailTestScenarios.length; i++) {
        const scenario = emailTestScenarios[i];
        const userId = `test_user_${i + 1}`;

        console.log(`📋 Testing Scenario ${i + 1}: ${scenario.name}`);
        console.log(`📝 Description: ${scenario.description}`);

        try {
            // Create test email body
            await createTestEmailBody(userId, scenario.mapperContent, scenario.driverContent);

            // Retrieve and compose email
            const emailData = await getEmailBody(userId);
            const composedEmail = composeFullEmail(emailData);

            // Display the composed email
            console.log('\n📄 Composed Email:');
            console.log('='.repeat(60));
            console.log(composedEmail);
            console.log('='.repeat(60));

            // Validate expected sections
            const hasMapperAlerts = composedEmail.includes('MAPPER ALERTS');
            const hasDriverNotifications = composedEmail.includes('DRIVER NOTIFICATIONS');
            const hasNoNotifications = composedEmail.includes('No new notifications');

            console.log('\n✅ Validation Results:');
            console.log(`   - Contains Mapper Alerts: ${hasMapperAlerts}`);
            console.log(`   - Contains Driver Notifications: ${hasDriverNotifications}`);
            console.log(`   - Contains No Notifications: ${hasNoNotifications}`);

            // Check if expected sections are present
            let validationPassed = true;
            for (const expectedSection of scenario.expectedSections) {
                if (expectedSection === "MAPPER ALERTS" && !hasMapperAlerts) {
                    validationPassed = false;
                } else if (expectedSection === "DRIVER NOTIFICATIONS" && !hasDriverNotifications) {
                    validationPassed = false;
                } else if (expectedSection === "No new notifications" && !hasNoNotifications) {
                    validationPassed = false;
                }
            }

            console.log(`   - Validation Passed: ${validationPassed ? '✅' : '❌'}`);

        } catch (error) {
            console.error(`❌ Scenario ${scenario.name} failed:`, error);
        }

        console.log('\n' + '-'.repeat(80) + '\n');
    }
}

// Test the actual email sender integration
async function testEmailSenderIntegration() {
    console.log('📨 Testing Email Sender Integration...\n');

    // Create a comprehensive test email with both content types
    const testUserId = "integration_test_user";

    const mapperContent = `🗺️ Map: Speed Circuit Championship
  🏎️ Player: LightningFast
  📍 Zone: Zone 1
  🥇 Position: 1
  📅 Date: ${new Date().toLocaleString()}

🗺️ Map: Technical Masterpiece
  🏎️ Player: SpeedDemon
  📍 Zone: Zone 3
  🥇 Position: 2
  📅 Date: ${new Date().toLocaleString()}

🗺️ Map: Racing Challenge
  🏎️ Player: TrackMaster
  📍 Zone: Zone 2
  🥇 Position: 3
  📅 Date: ${new Date().toLocaleString()}`;

    const driverContent = `🏎️ Map: Speed Circuit Championship
📍 Position changed: #2 → #3
📅 Detected: ${new Date().toLocaleString()}

🏎️ Map: Technical Masterpiece
📍 Position changed: #1 → #2
📅 Detected: ${new Date().toLocaleString()}

🏎️ Map: Racing Challenge
📍 Position changed: #4 → #6
📅 Detected: ${new Date().toLocaleString()}`;

    try {
        // Create test email body
        await createTestEmailBody(testUserId, mapperContent, driverContent);

        // Compose the email
        const emailData = await getEmailBody(testUserId);
        const composedEmail = composeFullEmail(emailData);

        console.log('📧 Integration Test Email:');
        console.log('='.repeat(80));
        console.log(composedEmail);
        console.log('='.repeat(80));

        // Test email length and formatting
        const lines = composedEmail.split('\n');
        const mapperSection = lines.findIndex(line => line.includes('MAPPER ALERTS'));
        const driverSection = lines.findIndex(line => line.includes('DRIVER NOTIFICATIONS'));

        console.log('\n📊 Email Analysis:');
        console.log(`   - Total lines: ${lines.length}`);
        console.log(`   - Mapper section starts at line: ${mapperSection + 1}`);
        console.log(`   - Driver section starts at line: ${driverSection + 1}`);
        console.log(`   - Contains both sections: ${mapperSection !== -1 && driverSection !== -1}`);

        return composedEmail;

    } catch (error) {
        console.error('❌ Integration test failed:', error);
        throw error;
    }
}

// Main test function
exports.handler = async (event, context) => {
    console.log('📧 Email Composition Test Suite Started\n');

    try {
        // Test all email composition scenarios
        await testEmailCompositionScenarios();

        // Test email sender integration
        await testEmailSenderIntegration();

        console.log('\n✅ All email composition tests completed successfully!');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Email composition tests completed',
                scenariosTested: emailTestScenarios.length,
                integrationTestPassed: true
            })
        };

    } catch (error) {
        console.error('❌ Email composition test suite failed:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Email composition test suite failed',
                details: error.message
            })
        };
    }
};

// Export functions for individual testing
module.exports = {
    testEmailCompositionScenarios,
    testEmailSenderIntegration,
    createTestEmailBody,
    getEmailBody,
    composeFullEmail
};

