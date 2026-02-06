# Recordsw Backend (unified from Lambda)

Single Node/Express server that exposes the same REST API as the API Gateway + Lambda setup. All handler code lives in `src/lambda/` (copied from `terraform/lambda/`) so the backend is self-contained.

**Backend vs AWS:** Sessions and map-search jobs use **in-memory** storage in this backend (no DynamoDB/SQS for those). See [DifferencesWithAWS.md](DifferencesWithAWS.md) for details.

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
- `GET/POST /api/v1/feedback`
- `GET/POST /api/v1/test`, `GET/POST /api/v1/test-advanced`

## Backend vs terraform

Backend is standalone (no AWS). Handler code in `backend/src/lambda/` is for comparison with `terraform/lambda/` only; nothing is synced. See [DifferencesWithAWS.md](DifferencesWithAWS.md).

## Copying to another branch/repo

Copy the whole `backend/` folder; it already contains all handler code in `src/lambda/`. Install deps and set env as above.

## Daily emails (Postgres + cron) and SMTP

Backend already runs daily emails and driver notifications via Postgres + one cron endpoint (no SQS/DynamoDB). See [DAILY_EMAILS_POSTGRES_CRON.md](DAILY_EMAILS_POSTGRES_CRON.md).

**What you need:**

1. Run `backend/sql/daily_emails.sql` on Neon.
2. Set **CRON_SECRET** (e.g. a random string). Cron calls must send it: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
3. **Email (Gmail):** Set in `.env`: `EMAIL_USER` and `EMAIL_PASS` (Gmail App Password if 2FA is on).
4. Call `POST /api/v1/cron/daily` once per day (system cron or cron-job.org) with the secret.

Replacing SES with SMTP is done: `backend/src/email/sendEmail.js` uses nodemailer; `emailSender.js` calls it.
