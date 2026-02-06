/**
 * Cron route (backend only). POST /api/v1/cron/daily runs Phase 1 (mapper) → Phase 2 (driver) → Phase 3 (send).
 * Protected by CRON_SECRET: Authorization: Bearer <CRON_SECRET> or ?secret=<CRON_SECRET>.
 */
const express = require('express');
const { Client } = require('pg');
const schedulerProcessor = require('../lambda/schedulerProcessor');
const emailSender = require('../lambda/emailSender');

const router = express.Router();

function getClient() {
  const connectionString = process.env.NEON_DB_CONNECTION_STRING;
  if (!connectionString) throw new Error('NEON_DB_CONNECTION_STRING required');
  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function verifySecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ') && auth.slice(7) === secret) return true;
  if (req.query.secret === secret) return true;
  return false;
}

router.post('/cron/daily', async (req, res) => {
  if (!verifySecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let client;
  try {
    client = getClient();
    await client.connect();

    const { rows: alerts } = await client.query('SELECT username, email FROM alerts');
    const { rows: driverUsers } = await client.query(`
      SELECT DISTINCT u.username, u.email
      FROM driver_notifications dn
      JOIN users u ON dn.user_id = u.id
      WHERE dn.is_active = TRUE
    `);

    await client.end();

    let phase1Errors = 0;
    let phase2Errors = 0;

    for (const { username, email } of alerts) {
      try {
        await schedulerProcessor.processMapAlertCheck(username, email);
      } catch (err) {
        console.error(`Phase 1 error for ${username}:`, err.message);
        phase1Errors++;
      }
    }

    for (const { username, email } of driverUsers) {
      try {
        await schedulerProcessor.processDriverNotificationCheck(username, email);
      } catch (err) {
        console.error(`Phase 2 error for ${username}:`, err.message);
        phase2Errors++;
      }
    }

    let sendResult;
    try {
      sendResult = await emailSender.runSendPhaseForToday();
    } catch (err) {
      console.error('Phase 3 error:', err);
      return res.status(500).json({
        error: 'Send phase failed',
        details: err.message,
        phase1Processed: alerts.length,
        phase2Processed: driverUsers.length,
      });
    }

    return res.status(200).json({
      message: 'Daily cron completed',
      phase1Processed: alerts.length,
      phase2Processed: driverUsers.length,
      phase1Errors,
      phase2Errors,
      emailsSent: sendResult.emailsSent,
      emailsSkipped: sendResult.emailsSkipped,
      totalProcessed: sendResult.totalProcessed,
    });
  } catch (err) {
    if (client) try { await client.end(); } catch (_) {}
    console.error('Cron daily error:', err);
    return res.status(500).json({ error: 'Cron failed', details: err.message });
  }
});

module.exports = router;
