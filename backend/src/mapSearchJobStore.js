/**
 * Map search job store for the unified backend.
 * When NEON_DB_CONNECTION_STRING is set, uses Postgres (map_search_jobs table).
 * Otherwise uses in-memory store (jobs lost on restart). See backend/DifferencesWithAWS.md.
 */
const jobs = new Map();

function getStore() {
  if (process.env.NEON_DB_CONNECTION_STRING) {
    return require('./mapSearchJobStorePg');
  }
  return inMemory;
}

const inMemory = {
  async create(jobId, username, period) {
    const now = Date.now();
    jobs.set(jobId, {
      job_id: jobId,
      username,
      period: period || '1d',
      status: 'pending',
      created_at: now,
      updated_at: now,
      result: null,
      error_message: null,
    });
  },
  async get(jobId) {
    return jobs.get(jobId) || null;
  },
  async setStatus(jobId, status, result = null, error_message = null) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = status;
    job.updated_at = Date.now();
    if (result !== undefined) job.result = result;
    if (error_message !== undefined) job.error_message = error_message;
  },
};

async function create(jobId, username, period) {
  return getStore().create(jobId, username, period);
}

async function get(jobId) {
  return getStore().get(jobId);
}

async function setStatus(jobId, status, result = null, error_message = null) {
  return getStore().setStatus(jobId, status, result, error_message);
}

module.exports = {
  create,
  get,
  setStatus,
};
