# Daily Emails & Driver Notifications: Postgres + Cron

## Current flow (AWS)

1. **scheduler.js** (EventBridge) → queries Postgres for users with alerts + driver_notifications → sends one SQS message per user (map_alert_check or driver_notification_check).
2. **schedulerProcessor.js** (SQS) → processes each message: Phase 1 writes mapper_content to DynamoDB `daily_emails`, Phase 2 writes driver_content to DynamoDB `daily_emails`.
3. **emailSender.js** (Step Functions or separate trigger) → scans DynamoDB `daily_emails` for today → sends via SES.

schedulerProcessor also uses DynamoDB **map_leaderboard_cache**: Phase 1 stores leaderboards by map+date; Phase 2 reuses them for driver notification context (avoids duplicate Trackmania API calls and keeps driver notifications working).

---

## Backend implementation (Postgres + one cron)

- **Postgres:** `backend/sql/daily_emails.sql` defines `daily_emails` and `map_leaderboard_cache`. Run on Neon.
- **Store:** `backend/src/dailyEmailStore.js` — save/update daily_emails, get rows for date, cache get/set for leaderboards.
- **Cron:** `POST /api/v1/cron/daily` — protected by `CRON_SECRET` (header `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`). Runs Phase 1 (mapper) → Phase 2 (driver) → Phase 3 (send) in one process.
- **schedulerProcessor.js** (backend) — uses Postgres daily_emails + map_leaderboard_cache; exports `processMapAlertCheck` and `processDriverNotificationCheck` for the cron route.
- **emailSender.js** (backend) — reads from Postgres `daily_emails`, sends via `backend/src/email/sendEmail.js` (nodemailer SMTP). Exports `runSendPhaseForToday`.
- **Sync:** `scheduler.js`, `schedulerProcessor.js`, `emailSender.js` are excluded from sync-lambda-to-terraform and sync-lambda-from-terraform so backend Postgres+cron changes are never applied to terraform (AWS keeps DynamoDB/SQS/SES).

Env: `NEON_DB_CONNECTION_STRING`, `CRON_SECRET`, `EMAIL_USER`, `EMAIL_PASS`.
