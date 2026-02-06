// lambda/emailSender.js - Backend: Postgres daily_emails + SMTP (no DynamoDB/SES)
const dailyEmailStore = require('../dailyEmailStore');
const { sendEmail } = require('../email/sendEmail');

async function runSendPhaseForToday() {
  const today = dailyEmailStore.todayStr();
  const rows = await dailyEmailStore.getDailyEmailsForDate(today);
  let emailsSent = 0;
  let emailsSkipped = 0;

  for (const row of rows) {
    try {
      const hasMapper = row.mapper_content && row.mapper_content.trim().length > 0;
      const hasDriver = row.driver_content && row.driver_content.trim().length > 0;

      if (!hasMapper && !hasDriver) {
        emailsSkipped++;
        continue;
      }

      let subject = '';
      let emailText = '';

      if (hasMapper && hasDriver) {
        subject = `Daily Update: New Records & Position Changes`;
        emailText = `Hello ${row.username}!\n\nHere's your daily Trackmania update:\n\n`;
        emailText += `🗺️ NEW RECORDS ON YOUR MAPS:\n${row.mapper_content}\n\n`;
        emailText += `🏎️ POSITION CHANGES:\n${row.driver_content}\n\n`;
      } else if (hasMapper) {
        subject = `New times in ${row.username}'s maps`;
        emailText = `New times have been driven on your map(s):\n\n${row.mapper_content}`;
      } else {
        subject = `Position Changes on Tracked Maps`;
        emailText = `Hello ${row.username}!\n\nHere are the position changes on maps you're tracking:\n\n${row.driver_content}`;
      }

      await sendEmail(row.email, subject, emailText);
      await dailyEmailStore.setDailyEmailStatus(row.username, today, 'sent');
      emailsSent++;
    } catch (error) {
      console.error(`❌ Error sending email to ${row.username}:`, error.message);
    }
  }

  return { emailsSent, emailsSkipped, totalProcessed: rows.length };
}

exports.runSendPhaseForToday = runSendPhaseForToday;

exports.handler = async (event, context) => {
  console.log('📧 Email Sender (backend: Postgres + SMTP)', event);
  try {
    const summary = await runSendPhaseForToday();
    console.log(`📊 Email Summary: ${summary.emailsSent} sent, ${summary.emailsSkipped} skipped`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email sending completed',
        ...summary,
      }),
    };
  } catch (error) {
    console.error('❌ Email sender error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Email sending failed', details: error.message }),
    };
  }
};
