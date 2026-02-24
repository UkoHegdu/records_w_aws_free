/**
 * Postgres store for Trackmania API tokens (backend only).
 * Replaces DynamoDB token cache used by apiClient (provider 'auth') and oauthApiClient (provider 'oauth2').
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

/**
 * Get stored tokens for a provider. Returns { access: { token, created_at }, refresh: { token, created_at } } or nulls.
 */
async function getTokens(provider) {
  const client = getClient();
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT token_type, token, created_at FROM api_tokens WHERE provider = $1',
      [provider]
    );
    const result = { access: null, refresh: null };
    for (const row of rows) {
      if (row.token_type === 'access') result.access = { token: row.token, created_at: Number(row.created_at) };
      if (row.token_type === 'refresh') result.refresh = { token: row.token, created_at: Number(row.created_at) };
    }
    return result;
  } finally {
    await client.end();
  }
}

/**
 * Store access and refresh tokens for a provider. created_at = Date.now(). refreshToken optional.
 */
async function setTokens(provider, accessToken, refreshToken) {
  const now = Date.now();
  const client = getClient();
  try {
    await client.connect();
    await client.query(
      `INSERT INTO api_tokens (provider, token_type, token, created_at)
       VALUES ($1, 'access', $2, $3)
       ON CONFLICT (provider, token_type) DO UPDATE SET token = EXCLUDED.token, created_at = EXCLUDED.created_at`,
      [provider, accessToken, now]
    );
    if (refreshToken) {
      await client.query(
        `INSERT INTO api_tokens (provider, token_type, token, created_at)
         VALUES ($1, 'refresh', $2, $3)
         ON CONFLICT (provider, token_type) DO UPDATE SET token = EXCLUDED.token, created_at = EXCLUDED.created_at`,
        [provider, refreshToken, now]
      );
    }
  } finally {
    await client.end();
  }
}

module.exports = { getTokens, setTokens };
