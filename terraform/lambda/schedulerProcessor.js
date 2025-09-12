// lambda/schedulerProcessor.js - Processes queued user checks and saves email bodies to DynamoDB
const { fetchMapsAndLeaderboards } = require('./mapSearch');
const { translateAccountNames } = require('./accountNames');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

// Configure DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Format new records for email
async function formatNewRecords(records) {
    // Step 1: Collect unique accountIds
    const accountIds = Array.from(new Set(
        records.flatMap(record => record.leaderboard.map(entry => entry.accountId))
    ));

    // Step 2: Use accountNames helper
    const accountIdToName = await translateAccountNames(accountIds);

    // Step 3: Format the records nicely
    let formatted = '';

    for (const record of records) {
        formatted += `🗺️ Map: ${record.mapName}\n`;

        for (const entry of record.leaderboard) {
            const playerName = accountIdToName[entry.accountId] || entry.accountId;
            const date = new Date(entry.timestamp * 1000).toLocaleString();

            formatted += `  🏎️ Player: ${playerName}\n`;
            formatted += `  📍 Zone: ${entry.zoneName}\n`;
            formatted += `  🥇 Position: ${entry.position}\n`;
            formatted += `  📅 Date: ${date}\n\n`;
        }
    }

    return formatted.trim();
}

// Save email body to DynamoDB for later sending
async function saveEmailBodyToDynamoDB(userId, username, email, mapperContent) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days from now

    const item = {
        user_id: userId,
        date: today,
        username: username,
        email: email,
        mapper_content: mapperContent || '',
        driver_content: '', // Will be filled by driver notification processor
        ttl: ttl
    };

    const params = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Item: marshall(item)
    };

    try {
        await dynamoClient.send(new PutItemCommand(params));
        console.log(`✅ Email body saved to DynamoDB for user ${username}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save email body for ${username}:`, error.message);
        throw error;
    }
}

// Process a single user check
const processUserCheck = async (username, email) => {
    console.log(`🔍 Checking records for ${username}...`);

    try {
        const newRecords = await fetchMapsAndLeaderboards(username, '1d');

        // Always save email body to DynamoDB, even if no new records
        // This ensures driver notifications can still be added later
        let mapperContent = '';
        if (newRecords.length > 0) {
            console.log(`📊 Found ${newRecords.length} new records for ${username}`);
            mapperContent = await formatNewRecords(newRecords);
        } else {
            console.log(`ℹ️ No new records for ${username}`);
        }

        // Save email body to DynamoDB (will be sent later by email sender)
        await saveEmailBodyToDynamoDB(username, username, email, mapperContent);

        return { success: true, recordsFound: newRecords.length };
    } catch (error) {
        console.error(`❌ Error processing ${username}:`, error.message);
        throw error;
    }
};

exports.handler = async (event) => {
    console.log('📧 Scheduler Processor Lambda triggered from SQS!', event);

    // Parse SQS event
    const records = event.Records || [];

    if (records.length === 0) {
        console.error('No SQS records found in event');
        return { statusCode: 400, body: 'No SQS records found' };
    }

    let totalProcessed = 0;
    let totalRecordsFound = 0;

    // Process each SQS record (should be one at a time due to batch_size = 1)
    for (const record of records) {
        try {
            const messageBody = JSON.parse(record.body);
            const { username, email, type } = messageBody;

            console.log(`🔄 Processing ${type} for user ${username}`);

            if (!username || !email) {
                console.error('Missing required parameters: username and email');
                continue;
            }

            const result = await processUserCheck(username, email);
            totalProcessed++;
            totalRecordsFound += result.recordsFound;

            console.log(`✅ Completed check for ${username}`);

        } catch (error) {
            console.error('❌ Error processing SQS record:', error);
            // Continue with other records even if one fails
        }
    }

    console.log(`📬 Summary: Processed ${totalProcessed} users, found ${totalRecordsFound} total records`);

    return { statusCode: 200, body: 'SQS records processed' };
};
