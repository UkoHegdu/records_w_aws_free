# Migration Guide: Hetzner/VPS Changes (up to Feb 6, 2026)

This document describes changes made when migrating from AWS serverless to a single Node/Express server on Hetzner (or similar VPS). Use it to port these changes back into your serverless version.

---

## Overview of commits (up to Feb 6, 2026)

| Commit | Date | Summary |
|--------|------|---------|
| b0a6ae3 | Feb 6 | New changes from AWS, preparing for Hetzner |
| 8ef7ffb | Feb 6 | First time (terraform removed, Docker added) |
| 37ef9cb | Feb 6 | Port change for Gmail (587), SQL cleanup, deploy tweaks |

---

## 1. Request routing: Lambda adapter pattern

**What changed:** Express routes invoke Lambda-style handlers in-process instead of via API Gateway.

**Components:**
- `backend/src/lambdaAdapter.js` – Converts Express `req`/`res` to Lambda `event`/`context` and forwards handler response
- `backend/src/config/lambdaPath.js` – Maps route names to handler files in `src/lambda/`
- Handlers still return `{ statusCode, headers, body }`; they receive `event` with `body`, `queryStringParameters`, `pathParameters`, `headers`, `httpMethod`, `requestContext.identity.sourceIp`

**For serverless:** Keep your existing API Gateway → Lambda wiring. Handler signatures are unchanged; you only need the handler logic.

---

## 2. Session and token storage

| Area | VPS (Hetzner) | AWS (reference) |
|------|----------------|-----------------|
| **User sessions** | In-memory `sessionStore.js` (Map). Lost on restart. | DynamoDB or similar |
| **API tokens** (Nadeo/OAuth2) | Postgres `api_tokens` via `tokenStore.js` | DynamoDB |
| **Map search jobs** | Postgres `map_search_jobs` or in-memory fallback | SQS + Lambda workers |
| **Daily email state** | Postgres `daily_emails`, `map_leaderboard_cache` | DynamoDB, SES |

**For serverless:** Keep DynamoDB (or your existing store). Implement equivalent logic in:
- `tokenStore.js` – get/set by `provider` + `token_type`
- `mapSearchJobStore` / `mapSearchJobStorePg.js` – create, get, setStatus for jobs
- `dailyEmailStore.js` – save/update `daily_emails`, cache leaderboards by map+date

---

## 3. Daily cron: HTTP endpoint instead of EventBridge

**What changed:** One HTTP cron trigger instead of EventBridge → SQS → Lambda.

**Endpoint:** `POST /api/v1/cron/daily`  
**Auth:** `Authorization: Bearer <CRON_SECRET>` (or `?secret=` or `body.secret`)

**Flow:**
1. **Phase 1 (mapper):** For each user in `alerts`, call `schedulerProcessor.processMapAlertCheck(username, email)`. Writes `mapper_content` to `daily_emails` and fills `map_leaderboard_cache`.
2. **Phase 2 (driver):** For each user with active `driver_notifications`, call `schedulerProcessor.processDriverNotificationCheck(username, email)`. Writes `driver_content` to `daily_emails`, reuses `map_leaderboard_cache`.
3. **Phase 3 (send):** `emailSender.runSendPhaseForToday()` reads today’s rows from `daily_emails`, sends via nodemailer, updates status.

**For serverless:** Use EventBridge to trigger a cron Lambda. That Lambda should:
1. Verify `CRON_SECRET`
2. Run Phase 1 → Phase 2 → Phase 3 in sequence
3. Use `schedulerProcessor` and `emailSender` unchanged (they are handler-agnostic)

---

## 4. Map search: in-process instead of SQS

**What changed:** Jobs are created in Postgres (or in-memory), then `mapSearchBackground.handler()` runs in-process via `setImmediate` instead of via SQS.

**Flow:**
- `mapSearch.js` → create job in store → `setImmediate(mapSearchBackground.handler, { jobId, username, period })`
- `checkJobStatus.js` → read job from same store

**For serverless:** Keep SQS (or Step Functions). Have `mapSearch` Lambda enqueue a message; a worker Lambda runs `mapSearchBackground.handler` with the same event shape. `checkJobStatus` reads from DynamoDB (or your job store).

---

## 5. Email: Gmail SMTP port 587

**Change:** Use explicit SMTP config instead of `service: 'gmail'`:

```javascript
// Port 587: many providers (e.g. Hetzner) block outbound 465
transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});
```

**For serverless:** Use SES for sending. If you still use Gmail/Nodemailer (e.g. in Lambda), apply the same SMTP settings; some VPCs block port 465.

---

## 6. New Postgres tables (if using Postgres)

Run `backend/sql/init.sql` on Neon (or your Postgres). Notable tables:

| Table | Purpose |
|-------|---------|
| `api_tokens` | Nadeo and OAuth2 token cache (provider, token_type, token, created_at) |
| `daily_emails` | One row per (username, date); mapper_content, driver_content, status |
| `map_leaderboard_cache` | Cached leaderboards by map_uid + date |
| `map_search_jobs` | Job queue: job_id, username, period, status, result, created_at |

**For serverless with DynamoDB:** Create equivalent DynamoDB tables with similar semantics (GSIs as needed for lookups by date, job_id, etc.).

---

## 7. Lambda handlers to add or update

Handlers in `backend/src/lambda/` that may be new or changed:

| Handler | Purpose |
|---------|---------|
| `schedulerProcessor.js` | `processMapAlertCheck`, `processDriverNotificationCheck` – core daily cron logic |
| `emailSender.js` | `runSendPhaseForToday` – Phase 3 email send |
| `checkMapPositions.js` | Inaccurate mode: POST position API, batch of 50 maps |
| `checkDriverPositions.js` | Driver notifications: compare stored vs live position |
| `driverNotificationStatusCheck.js` | Validate driver alert (user in top 5) |
| `updateUserAlertType.js` | Switch accurate/inaccurate, init `map_positions` for inaccurate |
| `dailyEmailStore.js` | Save/update `daily_emails`, get rows, cache leaderboards |
| `tokenStore.js` | Postgres `api_tokens` for apiClient / oauthApiClient |
| `mapSearchJobStore.js` / `mapSearchJobStorePg.js` | Job CRUD |

---

## 8. Shared API clients

- `shared/apiClient.js` – Nadeo API, `nadeo_v1` token, uses `tokenStore`
- `shared/oauthApiClient.js` – Trackmania OAuth2, Bearer token, uses `tokenStore`

Both support token refresh and 401 retry. **For serverless:** Use the same clients; only `tokenStore` must read/write your DynamoDB (or equivalent).

---

## 9. Inaccurate mode

- **Trigger:** User has >100 maps, or user explicitly chooses inaccurate
- **Logic:** `processInaccurateMode` in `schedulerProcessor.js` uses `checkMapPositions.js` (POST `/api/token/leaderboard/group/map?scores[mapUid]=score`) instead of fetching full leaderboards
- **Data:** `map_positions` table stores baseline position per map
- **Init:** When switching to inaccurate, `checkAndInitializePositions` in `mapSearchBackground.js` fills `map_positions` for user’s maps

---

## 10. Frontend changes

- `frontend/src/auth.ts` – JWT-based API client, refresh flow
- New pages: `Admin.tsx`, `Configuration.tsx`, `DriverPage.tsx`, `MapperAlerts.tsx`, `MapperNews.tsx`, `Landing.tsx`
- Environment banner, status styles, Tailwind
- `VITE_BACKEND_URL` for API base URL

**For serverless:** Frontend is unchanged; it talks to your API (Gateway or ALB). Ensure CORS and same API paths.

---

## 11. Environment variables

From `backend/ENV.md`:

| Variable | Purpose |
|----------|---------|
| `NEON_DB_CONNECTION_STRING` | Postgres (or equivalent connection for your DB) |
| `JWT_SECRET` | Sign/verify JWT |
| `CRON_SECRET` | Auth for `POST /api/v1/cron/daily` |
| `LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT` | Nadeo/Trackmania |
| `OCLIENT_ID`, `OCLIENT_SECRET` | Trackmania OAuth2 |
| `EMAIL_USER`, `EMAIL_PASS` | Gmail SMTP |
| `ALLOWED_ORIGIN` | CORS (optional) |

---

## 12. Deployment (VPS only – not for serverless)

- Terraform removed
- `compose.prod.yaml` – backend + frontend + Caddy
- `deploy/deploy.sh` – `docker compose up -d --build`
- `deploy/cron-daily.sh` – crontab script calling `POST /api/v1/cron/daily` with `CRON_SECRET`
- `.github/workflows/deploy-hetzner.yml` – deploy on push to main

---

## Quick checklist for serverless port

1. [ ] Add `schedulerProcessor`, `emailSender`, `dailyEmailStore` logic (or DynamoDB equivalents)
2. [ ] Add `tokenStore` backed by DynamoDB for Nadeo/OAuth2 tokens
3. [ ] Add cron Lambda triggered by EventBridge, calling Phase 1→2→3
4. [ ] Add `checkMapPositions`, `checkDriverPositions`, `driverNotificationStatusCheck`
5. [ ] Add `updateUserAlertType` and inaccurate-mode init
6. [ ] Ensure `mapSearch` enqueues to SQS; worker runs `mapSearchBackground.handler`
7. [ ] Use Gmail SMTP port 587 if sending via nodemailer from Lambda
8. [ ] Create DynamoDB tables (or equivalent) for `api_tokens`, `daily_emails`, `map_leaderboard_cache`, `map_search_jobs`
9. [ ] Keep handler signatures; only adapt data stores (DynamoDB vs Postgres)
