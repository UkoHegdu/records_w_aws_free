# Recordsw Backend (Node/Express, no AWS)

Single Node/Express server that exposes the same REST API shape as the old API Gateway + Lambda setup. Handler code lives in `src/lambda/`, but **it runs in-process via Express** – there is **no AWS Lambda / API Gateway / SQS / DynamoDB** involved in this backend.

The `lambda` naming is kept only so that files stay 1:1 with the historical Lambda handlers and the Terraform config for reference.

**Backend vs AWS:** No AWS at runtime. Sessions and map-search jobs use in-memory + Postgres. See [DifferencesWithAWS.md](DifferencesWithAWS.md) for details.

## Run locally

1. **Install dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Environment**

   Create a `.env` in `backend/` (or set env vars). At minimum:

   - `NEON_DB_CONNECTION_STRING` (Postgres; run **`backend/sql/init.sql`** once on Neon to create all tables)
   - `JWT_SECRET`
   - `LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT`
   - `OCLIENT_ID`, `OCLIENT_SECRET`
   - For daily cron: `CRON_SECRET`; for email: `EMAIL_USER`, `EMAIL_PASS`

3. **Start**

   ```bash
   npm start
   ```

   Server listens on `PORT` (default 3000). Frontend can point `VITE_BACKEND_URL` to `http://localhost:3000`.

## Routes (same as API Gateway)

- `GET  /health`
- `GET  /api/v1/users/search`
- `GET  /api/v1/users/maps`, `GET /api/v1/users/maps/status/:jobId`
- `GET/POST/DELETE /api/v1/users/alerts`, `DELETE /api/v1/users/alerts/:id`
- `POST /api/v1/users/login`, `register`, `refresh`, `logout`
- `GET  /api/v1/users/profile`, `GET/POST /api/v1/users/tm-username`
- `POST /api/v1/users/accountNames`
- `GET  /api/v1/records/latest`
- `GET  /api/v1/driver/maps/search`, `GET/POST/DELETE /api/v1/driver/notifications`, `DELETE /api/v1/driver/notifications/:id`
- `GET/PUT /api/v1/admin/config`, `GET /api/v1/admin/users`, `PUT /api/v1/admin/users/alert-type`, `GET /api/v1/admin/daily-overview`
- `GET  /api/v1/notification-history`
- `GET/POST /api/v1/feedback`, `PUT /api/v1/feedback/:id/read`
- `GET/POST /api/v1/test`, `GET/POST /api/v1/test-advanced`

## Backend vs terraform / AWS

- **Backend is standalone (no AWS)**: Docker / Node / Express / Postgres / system cron.
- Code in `backend/src/lambda/` keeps the Lambda-style handler signatures but is executed locally via `src/lambdaAdapter.js` and `src/app.js`.
- Terraform / AWS deployments (if you ever use them again) should look at `terraform/lambda/`; **nothing is auto-synced from this backend to AWS.**

### Project layout (backend only)

- `backend/src/...` – **current backend implementation** (used by `src/server.js` and Docker).
  - `src/server.js` – entrypoint; starts the Express app.
  - `src/app.js` – Express app wiring.
  - `src/routes/*` – Express route definitions that call into `src/lambda/*` handlers.
  - `src/lambda/*` – migrated handler logic (was originally AWS Lambda).

## Copying to another branch/repo

Copy the whole `backend/` folder; it already contains all handler code in `src/lambda/`. Install deps and set env as above.

## Daily emails (Postgres + cron) and SMTP

Backend already runs daily emails and driver notifications via Postgres + one cron endpoint (no SQS/DynamoDB). See [DAILY_EMAILS_POSTGRES_CRON.md](DAILY_EMAILS_POSTGRES_CRON.md).

**What you need:**

1. Run `backend/sql/init.sql` on Neon (this creates `daily_emails`, `map_leaderboard_cache`, and all other tables the backend expects).
2. Set **CRON_SECRET** (e.g. a random string). Cron calls must send it: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
3. **Email (Gmail):** Set in `.env`: `EMAIL_USER` and `EMAIL_PASS` (Gmail App Password if 2FA is on).
4. Call `POST /api/v1/cron/daily` once per day (system cron or cron-job.org) with the secret.

Replacing SES with SMTP is done: `backend/src/email/sendEmail.js` uses nodemailer; `emailSender.js` calls it.
