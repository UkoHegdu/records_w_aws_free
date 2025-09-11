// lambda/schedulerProcessor.js - Processes queued user checks
const { fetchMapsAndLeaderboards } = require('./mapSearch');
const { translateAccountNames } = require('./accountNames');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Configure SES client
const sesClient = new SESClient({ region: process.env.AWS_REGION });

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

// Send email using AWS SES
async function sendEmail(to, subject, text) {
    const params = {
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Text: {
                    Data: text,
                    Charset: 'UTF-8'
                }
            }
        },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET
    };

    try {
        const command = new SendEmailCommand(params);
        const result = await sesClient.send(command);
        console.log(`✅ Email sent successfully to ${to}, MessageId: ${result.MessageId}`);
        return result;
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error.message);
        console.error(error.stack);
        throw error;
    }
}

// Process a single user check
const processUserCheck = async (username, email) => {
    console.log(`🔍 Checking records for ${username}...`);

    try {
        const newRecords = await fetchMapsAndLeaderboards(username, '1d');

        if (newRecords.length > 0) {
            console.log(`📊 Found ${newRecords.length} new records for ${username}`);

            const formattedRecords = await formatNewRecords(newRecords);

            const subject = `New times in ${username}'s maps`;
            const text = `New times have been driven on your map(s):\n\n${formattedRecords}`;

            await sendEmail(email, subject, text);
            console.log(`✅ Email sent to ${email}`);
            return { success: true, recordsFound: newRecords.length };
        } else {
            console.log(`ℹ️ No new records for ${username}`);
            return { success: true, recordsFound: 0 };
        }
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
