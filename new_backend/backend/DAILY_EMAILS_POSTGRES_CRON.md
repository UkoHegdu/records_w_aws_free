# Daily Emails & Driver Notifications: Postgres + Cron

## Flow

1. **System cron** (e.g. `0 6 * * *`) runs `deploy/cron-daily.sh` once per day on the server.
2. **cron-daily.sh** sends `POST /api/v1/cron/daily` with `Authorization: Bearer <CRON_SECRET>` to the backend (e.g. `http://localhost` via Caddy reverse proxy).
3. **src/routes/cron.js** verifies the secret, then runs Phase 1 → Phase 2 → Phase 3 in one process:
   - **Phase 1 (mapper):** For each user in `alerts`, calls `schedulerProcessor.processMapAlertCheck(username, email)`. Writes `mapper_content` to Postgres `daily_emails` and fills `map_leaderboard_cache` by map+date.
   - **Phase 2 (driver):** For each user with active `driver_notifications`, calls `schedulerProcessor.processDriverNotificationCheck(username, email)`. Writes `driver_content` to Postgres `daily_emails`, reusing `map_leaderboard_cache` to avoid duplicate Trackmania API calls.
   - **Phase 3 (send):** Calls `emailSender.runSendPhaseForToday()`. Reads today’s rows from `daily_emails`, sends via nodemailer SMTP, updates status.

## Components

| Component | Purpose |
|-----------|---------|
| `backend/sql/init.sql` | Defines `daily_emails` and `map_leaderboard_cache` (run on Neon). |
| `backend/src/dailyEmailStore.js` | Save/update `daily_emails`, get rows for date, cache get/set for leaderboards. |
| `backend/src/routes/cron.js` | `POST /api/v1/cron/daily` handler; orchestrates Phase 1–3. |
| `backend/src/lambda/schedulerProcessor.js` | Exports `processMapAlertCheck` and `processDriverNotificationCheck`; uses Postgres `daily_emails` + `map_leaderboard_cache`. |
| `backend/src/lambda/emailSender.js` | Reads from Postgres `daily_emails`, sends via `backend/src/email/sendEmail.js` (nodemailer SMTP). Exports `runSendPhaseForToday`. |
| `deploy/cron-daily.sh` | Script invoked by crontab; calls the cron endpoint with `CRON_SECRET`. |

## Auth

The cron route accepts `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>` (preferred), or `?secret=` or `body.secret`. The deploy script uses the Bearer header only.

## Env

`NEON_DB_CONNECTION_STRING`, `CRON_SECRET`, `EMAIL_USER`, `EMAIL_PASS`.
