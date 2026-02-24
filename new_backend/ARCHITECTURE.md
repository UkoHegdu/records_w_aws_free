# Backend Architecture

Single Node/Express server for deployment on Hetzner (or similar). No AWS: Postgres (Neon), in-memory sessions, Gmail for email, one cron endpoint for daily jobs.

## System overview

```
┌─────────────────┐         ┌─────────────────────────────────────────┐
│   Frontend      │         │   Backend (Node/Express)                 │
│   (React)       │◄───────►│   server.js → app.js → routes/            │
│   VITE_BACKEND  │   REST  │   routes invoke lambda/* handlers        │
└─────────────────┘   API   │   via lambdaAdapter + lambdaPath         │
                             └─────────────────┬───────────────────────┘
                                                │
              ┌─────────────────────────────────┼─────────────────────────────────┐
              │                                 │                                 │
              ▼                                 ▼                                 ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│   PostgreSQL (Neon)      │   │   Trackmania APIs        │   │   Gmail (nodemailer)    │
│   init.sql tables       │   │   Nadeo + OAuth2          │   │   EMAIL_USER/PASS       │
│   users, alerts,        │   │   apiClient,              │   │   sendEmail.js         │
│   daily_emails,         │   │   oauthApiClient          │   │   (Phase 3 of cron)     │
│   map_search_jobs,      │   │   tokenStore (Neon)       │   └─────────────────────────┘
│   api_tokens, etc.      │   └─────────────────────────┘
└─────────────────────────┘
              │
              │   In-process only (no queue):
              │   sessionStore.js (in-memory Map)
              │   mapSearchJobStore → Postgres or in-memory
```

## Components

### Entry and routing

- **server.js** – Loads `dotenv`, starts Express on `PORT`. Requires `app.js`.
- **app.js** – Mounts CORS, JSON, security headers, and route modules: `/health`, `/api/v1/users`, `/api/v1/records`, `/api/v1/driver`, `/api/v1/admin`, `/api/v1` (notificationHistory, feedback, test, cron).
- **routes/** – Each route file uses `lambdaAdapter` + `config/lambdaPath` to resolve a handler (e.g. `lambda/login.js`) and call `invokeLambda(handler, req, res)` so Lambda-style handlers run behind Express.

### Handlers (lambda/)

Handler code lives in `src/lambda/`. The folder is named "lambda" because the handlers were originally written for AWS Lambda (they take an `event`, return `{ statusCode, headers, body }`). The **lambdaAdapter** wraps Express: it turns `req` into an event, calls the handler, and sends the response. Everything runs in-process on a single Node/Express server—no serverless or AWS at runtime.

- **Auth:** `login.js`, `logout.js`, `refreshToken.js`, `register.js` – use `sessionStore.js` (in-memory) and Postgres `users`. JWT signed with `JWT_SECRET`.
- **Map search:** `mapSearch.js` creates a job (Postgres `map_search_jobs` or in-memory via `mapSearchJobStore`), then runs `mapSearchBackground.handler()` in-process (`setImmediate`). `checkJobStatus.js` reads from the same store.
- **Daily emails and driver notifications:** Not triggered by SQS. A single cron entry point runs the pipeline: **routes/cron.js** – `POST /api/v1/cron/daily` (protected by `CRON_SECRET`) runs Phase 1 (mapper alerts), Phase 2 (driver notifications), Phase 3 (send emails). Uses `schedulerProcessor.processMapAlertCheck`, `processDriverNotificationCheck`, and `emailSender.runSendPhaseForToday`. Data: Postgres `daily_emails`, `map_leaderboard_cache`; email via `email/sendEmail.js` (Gmail).
- **Other features:** `create_alert.js`, `driverNotifications.js`, `getNotificationHistory.js`, `getFeedback.js`, `submitFeedback.js`, admin handlers, `mapSearchDriver.js`, `verifyTmUsername.js`, `getMapRecords.js`, etc. – all use Postgres (Neon) and/or shared helpers. Trackmania APIs via `shared/apiClient.js` and `shared/oauthApiClient.js`, which use **tokenStore.js** (Postgres `api_tokens`) for Nadeo and OAuth2 tokens.

### Backend-only modules (no AWS)

| Module | Purpose |
|--------|---------|
| **sessionStore.js** | In-memory Map for login sessions (access/refresh). Lost on restart. |
| **mapSearchJobStore.js** | Facade: if `NEON_DB_CONNECTION_STRING` is set, uses Postgres (`mapSearchJobStorePg.js`); else in-memory. |
| **mapSearchJobStorePg.js** | Postgres `map_search_jobs`: create, get, setStatus. |
| **tokenStore.js** | Postgres `api_tokens`: get/set Nadeo and OAuth2 tokens for apiClient and oauthApiClient. |
| **dailyEmailStore.js** | Postgres `daily_emails` and `map_leaderboard_cache`: save/update daily email rows, cache leaderboards, get rows for send phase. |
| **email/sendEmail.js** | Nodemailer with Gmail (`EMAIL_USER`, `EMAIL_PASS`). Used by `emailSender.js`. |

### Data layer (Postgres / Neon)

All tables are created by **sql/init.sql** (run once on Neon):

- **users**, **admin_config**, **alerts**, **alert_maps**, **driver_notifications**, **map_positions**, **notification_history**, **feedback** – app and scheduler data.
- **api_tokens** – Nadeo and OAuth2 token cache (replaces DynamoDB).
- **daily_emails** – One row per (username, date); Phase 1/2 fill mapper_content and driver_content; Phase 3 sends and sets status.
- **map_leaderboard_cache** – Leaderboards by map+date for daily cron (Phase 1 writes, Phase 2 reads).
- **map_search_jobs** – Async map search job queue (replaces DynamoDB + SQS).

Sessions are **not** in Postgres; they are in-memory (`sessionStore.js`).

## Main flows

### Auth

- **Login:** `login.js` → Postgres `users` → JWT access + refresh → store session in `sessionStore` (in-memory).
- **Refresh:** `refreshToken.js` → `sessionStore` → new JWTs.
- **Logout:** `logout.js` → remove from `sessionStore`.

### Map search

- **Submit:** `mapSearch.js` → create job in Postgres (or in-memory) → `setImmediate(mapSearchBackground.handler, …)`.
- **Poll:** `checkJobStatus.js` → read job from same store → return status/result.

### Daily emails and driver notifications

- **Trigger:** External cron (or similar) calls `POST /api/v1/cron/daily` with `CRON_SECRET`.
- **Phase 1:** For each user with alerts, `schedulerProcessor.processMapAlertCheck` → Trackmania API, write `daily_emails.mapper_content`, fill `map_leaderboard_cache`.
- **Phase 2:** For each user with driver notifications, `schedulerProcessor.processDriverNotificationCheck` → update `daily_emails.driver_content`.
- **Phase 3:** `emailSender.runSendPhaseForToday` → read `daily_emails` for today, send via `email/sendEmail.js` (Gmail), mark sent.

## Security

- **Auth:** JWT access (short-lived) and refresh tokens; refresh validated against in-memory session store.
- **Cron:** `POST /api/v1/cron/daily` requires `CRON_SECRET` (header `Authorization: Bearer <CRON_SECRET>` or query `?secret=<CRON_SECRET>`).
- **Secrets:** No AWS; all secrets from env (e.g. `.env`): `NEON_DB_CONNECTION_STRING`, `JWT_SECRET`, `CRON_SECRET`, `EMAIL_USER`, `EMAIL_PASS`, Trackmania API credentials.

## Related docs

- [backend/README.md](backend/README.md) – Run locally, routes, env.
- [backend/DifferencesWithAWS.md](backend/DifferencesWithAWS.md) – Backend vs Lambda/AWS (reference).
- [backend/DAILY_EMAILS_POSTGRES_CRON.md](backend/DAILY_EMAILS_POSTGRES_CRON.md) – Daily cron and email.
- [backend/ENV.md](backend/ENV.md) – Env vars and where they are read.
- [backend/sql/init.sql](backend/sql/init.sql) – Postgres schema for Neon.
