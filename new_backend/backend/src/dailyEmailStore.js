/**
 * Postgres store for daily emails and map leaderboard cache (backend only).
 * Replaces DynamoDB DAILY_EMAILS_TABLE_NAME and MAP_LEADERBOARD_CACHE_TABLE_NAME.
 */
const { Client } = require('pg');

function getClient() {
  const connectionString = process.env.NEON_DB_CONNECTION_STRING;
  if (!connectionString) throw new Error('NEON_DB_CONNECTION_STRING required');
  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
  });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function cacheKey(mapId) {
  return `map_${mapId}_${todayStr()}`;
}

async function saveDailyEmail(username, email, mapperContent) {
  const today = todayStr();
  const now = Date.now();
  const client = getClient();
  try {
    await client.connect();
    await client.query(
      `INSERT INTO daily_emails (username, email, date, mapper_content, driver_content, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', 'pending', $5, $5)
       ON CONFLICT (username, date) DO UPDATE SET
         mapper_content = EXCLUDED.mapper_content,
         updated_at = EXCLUDED.updated_at`,
      [username, email, today, mapperContent || '', now]
    );
  } finally {
    await client.end();
  }
}

async function updateDriverContent(username, email, driverContent) {
  const today = todayStr();
  const now = Date.now();
  const client = getClient();
  try {
    await client.connect();
    const { rowCount } = await client.query(
      `UPDATE daily_emails SET driver_content = $1, updated_at = $2 WHERE username = $3 AND date = $4`,
      [driverContent, now, username, today]
    );
    if (rowCount === 0) {
      await client.query(
        `INSERT INTO daily_emails (username, email, date, mapper_content, driver_content, status, created_at, updated_at)
         VALUES ($1, $2, $3, '', $4, 'pending', $5, $5)`,
        [username, email, today, driverContent, now]
      );
    }
  } finally {
    await client.end();
  }
}

async function getDailyEmailsForDate(date) {
  const client = getClient();
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT username, email, mapper_content, driver_content, status
       FROM daily_emails WHERE date = $1`,
      [date]
    );
    return rows;
  } finally {
    await client.end();
  }
}

async function setDailyEmailStatus(username, date, status) {
  const client = getClient();
  try {
    await client.connect();
    await client.query(
      'UPDATE daily_emails SET status = $1, updated_at = $2 WHERE username = $3 AND date = $4',
      [status, Date.now(), username, date]
    );
  } finally {
    await client.end();
  }
}

async function cacheMapLeaderboard(mapId, leaderboardData) {
  const key = cacheKey(mapId);
  const now = Date.now();
  const client = getClient();
  try {
    await client.connect();
    await client.query(
      `INSERT INTO map_leaderboard_cache (cache_key, leaderboard_data, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET leaderboard_data = EXCLUDED.leaderboard_data, created_at = EXCLUDED.created_at`,
      [key, JSON.stringify(leaderboardData), now]
    );
  } catch (err) {
    console.error(`Error caching leaderboard for map ${mapId}:`, err.message);
  } finally {
    await client.end();
  }
}

async function getCachedMapLeaderboard(mapId) {
  const key = cacheKey(mapId);
  const client = getClient();
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT leaderboard_data FROM map_leaderboard_cache WHERE cache_key = $1',
      [key]
    );
    if (rows.length === 0) return null;
    const data = rows[0].leaderboard_data;
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (err) {
    console.error(`Error reading cache for map ${mapId}:`, err.message);
    return null;
  } finally {
    await client.end();
  }
}

module.exports = {
  saveDailyEmail,
  updateDriverContent,
  getDailyEmailsForDate,
  setDailyEmailStatus,
  cacheMapLeaderboard,
  getCachedMapLeaderboard,
  todayStr,
};
