/**
 * Postgres-backed map search job store for the unified backend.
 * Use this when you have run backend/sql/map_search_jobs.sql on Neon.
 * Same interface as mapSearchJobStore (in-memory) but async and persistent.
 */
const { Client } = require('pg');

function getClient() {
  const connectionString = process.env.NEON_DB_CONNECTION_STRING;
  if (!connectionString) throw new Error('NEON_DB_CONNECTION_STRING required for map search jobs');
  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

async function create(jobId, username, period) {
  const now = Date.now();
  const client = getClient();
  try {
    await client.connect();
    await client.query(
      `INSERT INTO map_search_jobs (job_id, username, period, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5)`,
      [jobId, username, period || '1d', now, now]
    );
  } finally {
    await client.end();
  }
}

async function get(jobId) {
  const client = getClient();
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT job_id, username, period, status, created_at, updated_at, result, error_message FROM map_search_jobs WHERE job_id = $1',
      [jobId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      job_id: r.job_id,
      username: r.username,
      period: r.period,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      result: r.result,
      error_message: r.error_message,
    };
  } finally {
    await client.end();
  }
}

async function setStatus(jobId, status, result = null, error_message = null) {
  const client = getClient();
  try {
    await client.connect();
    const now = Date.now();
    await client.query(
      'UPDATE map_search_jobs SET status = $1, updated_at = $2, result = $3, error_message = $4 WHERE job_id = $5',
      [status, now, result != null ? JSON.stringify(result) : null, error_message, jobId]
    );
  } finally {
    await client.end();
  }
}

module.exports = {
  create,
  get,
  setStatus,
};
