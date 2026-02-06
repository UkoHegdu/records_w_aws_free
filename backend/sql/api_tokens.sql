-- API tokens (backend): replaces DynamoDB token cache for Trackmania Nadeo + OAuth2.
-- provider: 'auth' (Nadeo) or 'oauth2'; token_type: 'access' or 'refresh'.
CREATE TABLE IF NOT EXISTS api_tokens (
  provider   TEXT NOT NULL,
  token_type TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (provider, token_type)
);
