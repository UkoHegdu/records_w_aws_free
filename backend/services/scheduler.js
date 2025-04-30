const cron = require('node-cron');
const pool = require('./db');
const { fetchMapsAndLeaderboards } = require('../routes/v1/users/mapSearch'); // contains fetchmapsandleaderboards function
const nodemailer = require('nodemailer');
const httpClient = require('./httpClient'); // if not imported yet
const client = httpClient(process.env.ACCOUNT_API);


// Configure transporter (update with your SMTP or SES)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

//formatēšanas funkcija
async function formatNewRecords(records) {
    // Step 1: Collect all accountIds
    const accountIds = [];
    for (const record of records) {
        for (const entry of record.leaderboard) {
            accountIds.push(entry.accountId);
        }
    }

    // Step 2: Batch fetch display names
    const accountIdToName = {};

    /*  const BATCH_SIZE = 50; //tm doc specified
      for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {   //ejam cauri katram ierakstam (maps)
          const batch = accountIds.slice(i, i + BATCH_SIZE);      //ejam cauri katram kartes ieraksta leaderboarda ierakstam (players)
  
          try {
              const params = batch.map(id => `accountId[]=${id}`).join('&');
              console.log('fečojam name resolveri ar', params);
              const response = await client.get(`/api/display-names?${params}`);
              Object.assign(accountIdToName, response.data);
          } catch (error) {
              console.error('⚠️ Error fečing account names:', error.message);
              // If a batch fails, still continue formatting
          }
      }*/

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
};

//pārbaudam jaunus rekordus no visiem ierakstiem db un nosūtam e-pastu
const checkNewRecordsAndSendAlerts = async () => {
    console.log('Running scheduled check...');
    try {
        const { rows: alerts } = await pool.query('SELECT username, email FROM alerts');

        for (const { username, email } of alerts) {
            const newRecords = await fetchMapsAndLeaderboards(username, '1d');

            if (newRecords.length > 0) {
                const formattedRecords = await formatNewRecords(newRecords); // <-- format here

                const message = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: `New times in ${username}'s maps`,
                    text: `New times have been driven on your map(s):\n\n${formattedRecords}`
                };

                try {
                    await transporter.sendMail(message);
                    console.log(`✅ Email sent to ${email}`);
                } catch (error) {
                    console.error(`❌ Failed to send email to ${email}:`, error.message);
                    console.error(error.stack);
                }
            } else {
                console.log(`ℹ️ No new records for ${username}`);
            }
        }

    } catch (err) {
        console.error('❌ Error during scheduled check:', err.message);
        console.error(err.stack);
    }
};

// Run daily at 5 AM CET (4 AM UTC during winter, 3 AM UTC during summer)
cron.schedule('0 4 * * *', checkNewRecordsAndSendAlerts, {
    timezone: 'Europe/Paris' // covers CET and CEST (DST aware)
});

// Manually trigger after short delay for testing
setTimeout(() => {
    checkNewRecordsAndSendAlerts();
}, 10000);

/*
setTimeout(() => {
    checkNewRecordsAndSendAlerts();
}, 3000);
const response = await client.get('/api/display-names?accountId[]=c2ec36f4-c066-4008-ae1e-a5f7d80e7f34');*/
