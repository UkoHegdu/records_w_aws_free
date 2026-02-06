# Plan: Remove AWS Usage in Backend

**Done.** All steps completed (token store, no-op handlers, sync scripts removed, @aws-sdk packages uninstalled). Backend is standalone with no DynamoDB, SQS, or SES.

Below is the outline that was followed.

**No-op handler:** A handler that does nothing useful for the backend flow (e.g. returns 200 with a message). The real work is done elsewhere (e.g. cron route); the no-op just avoids running AWS code when that Lambda path is hit.

---

## 1. Token storage (apiClient.js + oauthApiClient.js)

**Current:** Both use DynamoDB table `DYNAMODB_TABLE_NAME` with composite key `(provider, token_type)`. Stored fields: `token`, `created_at` (and possibly more).

- **apiClient.js:** `provider: 'auth'`, `token_type: 'access' | 'refresh'` — Trackmania Nadeo API tokens.
- **oauthApiClient.js:** `provider: 'oauth2'`, `token_type: 'access' | 'refresh'` — OAuth2 tokens for account names API.

**To do:**

1. Add Postgres table, e.g. `api_tokens`:
   - `provider` TEXT (e.g. `'auth'`, `'oauth2'`),
   - `token_type` TEXT (`'access'`, `'refresh'`),
   - `token` TEXT,
   - `created_at` BIGINT,
   - PRIMARY KEY (provider, token_type).
2. Add a small store module (e.g. `backend/src/tokenStore.js`) with `getTokens(provider)`, `setTokens(provider, accessToken, refreshToken)` using `NEON_DB_CONNECTION_STRING`.
3. In **apiClient.js**: remove DynamoDB client and GetItem/PutItem; use the token store (get by provider `'auth'`, set access + refresh with `created_at`).
4. In **oauthApiClient.js**: same, but use provider `'oauth2'`.
5. Run the new SQL migration on Neon.

**Env to drop:** `DYNAMODB_TABLE_NAME`, `AWS_REGION` (for this path).

---

## 2. scheduler.js

**Current:** Sends messages to SQS (`SCHEDULER_QUEUE_URL`). On backend, the daily job is triggered by `POST /api/v1/cron/daily`; this handler is not used.

**To do:**

- Remove SQS usage from **backend** `scheduler.js`: either make the handler a no-op (e.g. return 200 "Use POST /api/v1/cron/daily") or strip the SQS client and `SendMessageCommand` so the file doesn’t require `@aws-sdk/client-sqs`.

**Env to drop:** `SCHEDULER_QUEUE_URL` (for backend).

---

## 3. driverNotificationProcessor.js

**Current:** Receives from SQS, updates DynamoDB daily_emails. On backend, driver notifications are run by the cron route via `schedulerProcessor.processDriverNotificationCheck`; this handler is not used.

**To do:**

- Remove DynamoDB and SQS from **backend** `driverNotificationProcessor.js`: either make the handler a no-op (return 200 "Use POST /api/v1/cron/daily") or strip all AWS calls so the file doesn’t require `@aws-sdk/client-dynamodb` or `@aws-sdk/client-sqs`.

**Env to drop:** (already unused on backend; no new env to remove.)

---

## 4. Remove @aws-sdk packages and AWS env vars

**After 1–3:**

1. **package.json:** Remove:
   - `@aws-sdk/client-dynamodb`
   - `@aws-sdk/util-dynamodb`
   - `@aws-sdk/client-sqs`
   - `@aws-sdk/client-ses` (already unused; emailSender uses SMTP)
   if no file in `backend/` requires them.
2. **Docs and env:** From backend README and any `.env.example`, remove AWS-related vars, e.g.:
   - `USER_SESSIONS_TABLE_NAME`
   - `DYNAMODB_TABLE_NAME`
   - `MAP_SEARCH_RESULTS_TABLE_NAME`, `MAP_SEARCH_QUEUE_URL`
   - `SCHEDULER_QUEUE_URL`
   - `DAILY_EMAILS_TABLE_NAME`, `MAP_LEADERBOARD_CACHE_TABLE_NAME`
   - `AWS_REGION`
   - `SES_FROM_EMAIL`
   Keep only what backend actually uses (e.g. `NEON_DB_CONNECTION_STRING`, `CRON_SECRET`, SMTP, JWT, API keys).

---

## 5. Optional: remove sync scripts

You said backend will never push to terraform and sync is not needed. You can:

- Delete `backend/scripts/sync-lambda-to-terraform.js` (backend → terraform).
- Keep or delete `backend/scripts/sync-lambda-from-terraform.js` (terraform → backend); only useful if you want to pull terraform code for comparison. If you delete both, remove or shorten the "Keeping serverless and backend in sync" section in backend README.

---

## Summary order

| Step | What | Result |
|------|------|--------|
| 1 | Token store in Postgres + wire apiClient + oauthApiClient | No DynamoDB for tokens |
| 2 | scheduler.js: remove SQS (no-op or strip) | No SQS in scheduler |
| 3 | driverNotificationProcessor.js: remove DynamoDB/SQS (no-op or strip) | No AWS in this handler |
| 4 | Remove @aws-sdk deps and AWS env from package.json + docs | Backend has no AWS dependencies |
| 5 | (Optional) Remove sync scripts and tidy README | No sync from/to terraform |

After this, backend has no `@aws-sdk/*` and no AWS env vars.
