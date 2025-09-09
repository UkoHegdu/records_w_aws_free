// lambda/scheduler.js
const { Client } = require('pg');
const { fetchMapsAndLeaderboards } = require('./mapSearch');
const { translateAccountNames } = require('./accountNames');
const nodemailer = require('nodemailer');

// Configure Gmail transporter (same as original scheduler.js)
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

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

// Send email using Gmail (same as original scheduler.js)
async function sendEmail(to, subject, text) {
    const message = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text
    };

    try {
        const result = await transporter.sendMail(message);
        console.log(`✅ Email sent successfully to ${to}`);
        return result;
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error.message);
        console.error(error.stack);
        throw error;
    }
}

// Check new records and send alerts
const checkNewRecordsAndSendAlerts = async () => {
    console.log('Running scheduled check...');
    const client = getDbConnection();

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        const { rows: alerts } = await client.query('SELECT username, email FROM alerts');
        console.log(`📧 Found ${alerts.length} alerts to process`);

        for (const { username, email } of alerts) {
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
                } else {
                    console.log(`ℹ️ No new records for ${username}`);
                }
            } catch (error) {
                console.error(`❌ Error processing ${username}:`, error.message);
                // Continue with other users even if one fails
            }
        }

    } catch (err) {
        console.error('❌ Error during scheduled check:', err.message);
        console.error(err.stack);
        throw err;
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
};

exports.handler = async (event, context) => {
    console.log('📅 Scheduler Lambda triggered!', event);

    try {
        await checkNewRecordsAndSendAlerts();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scheduled check completed successfully',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('❌ Scheduler Lambda error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Scheduled check failed',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
