-- Map search jobs (backend / Hetzner): replaces DynamoDB + SQS for map search.
-- Run this on your Neon DB when using the unified backend with Postgres-backed map search.

CREATE TABLE IF NOT EXISTS map_search_jobs (
  job_id     TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  period     TEXT NOT NULL DEFAULT '1d',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  result     JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_map_search_jobs_status ON map_search_jobs (status);
CREATE INDEX IF NOT EXISTS idx_map_search_jobs_created_at ON map_search_jobs (created_at);
