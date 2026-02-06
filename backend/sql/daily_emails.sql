-- Daily emails (backend / Hetzner): replaces DynamoDB DAILY_EMAILS_TABLE_NAME.
-- One row per (username, date). Phase 1 fills mapper_content, Phase 2 fills driver_content, Phase 3 sends and sets status.
CREATE TABLE IF NOT EXISTS daily_emails (
  username       TEXT NOT NULL,
  email          TEXT NOT NULL,
  date           DATE NOT NULL,
  mapper_content TEXT DEFAULT '',
  driver_content TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,
  PRIMARY KEY (username, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_emails_date ON daily_emails (date);

-- Map leaderboard cache (backend): replaces DynamoDB MAP_LEADERBOARD_CACHE_TABLE_NAME.
-- Phase 1 stores leaderboards by map+date; Phase 2 reuses them for driver notification context (avoids duplicate API calls).
CREATE TABLE IF NOT EXISTS map_leaderboard_cache (
  cache_key        TEXT PRIMARY KEY,
  leaderboard_data JSONB NOT NULL,
  created_at       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_leaderboard_cache_created ON map_leaderboard_cache (created_at);
