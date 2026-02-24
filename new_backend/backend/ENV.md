# Backend environment variables

Set in `.env` in `backend/` (or in the environment). No `.env` file is committed; create one from this list.

## Where they are read

Env vars are read via `process.env.VAR_NAME` in the files below. The backend does not use a central config module; each module reads what it needs.

| Variable | Used in | Purpose |
|----------|---------|---------|
| **NEON_DB_CONNECTION_STRING** | `tokenStore.js`, `dailyEmailStore.js`, `mapSearchJobStorePg.js`, `routes/cron.js`, `lambda/login.js`, `lambda/register.js`, `lambda/verifyTmUsername.js`, `lambda/getUserProfile.js`, `lambda/create_alert.js`, `lambda/driverNotifications.js`, `lambda/driverNotificationStatusCheck.js`, `lambda/getNotificationHistory.js`, `lambda/getFeedback.js`, `lambda/submitFeedback.js`, `lambda/getAdminConfig.js`, `lambda/getAdminUsers.js`, `lambda/getAdminDailyOverview.js`, `lambda/updateAdminConfig.js`, `lambda/updateUserAlertType.js`, `lambda/mapSearchBackground.js` (checkAndInitializePositions), `lambda/schedulerProcessor.js` (processMapAlertCheck, processDriverNotificationCheck, logNotificationHistory, logTechnicalError) | Postgres connection (Neon). Required for all DB access. |
| **JWT_SECRET** | `lambda/login.js`, `lambda/refreshToken.js`, `lambda/logout.js`, `lambda/verifyTmUsername.js`, `lambda/updateUserAlertType.js`, `lambda/updateAdminConfig.js`, `lambda/testAdvanced.js`, `lambda/submitFeedback.js`, `lambda/mapSearchDriver.js`, `lambda/getUserProfile.js`, `lambda/getNotificationHistory.js`, `lambda/getFeedback.js`, `lambda/getAdminUsers.js`, `lambda/getAdminDailyOverview.js`, `lambda/getAdminConfig.js`, `lambda/driverNotifications.js` | Signing/verifying JWT access and refresh tokens. |
| **PORT** | `server.js` | HTTP port (default 3000). |
| **CRON_SECRET** | `src/routes/cron.js` | Secret for `POST /api/v1/cron/daily`. Preferred: `Authorization: Bearer <CRON_SECRET>`. Also accepts `?secret=` or `body.secret`. |
| **ALLOWED_ORIGIN** | `app.js` | Comma-separated list of allowed CORS origins (e.g. `https://yourdomain.com`). If unset, any origin is allowed (dev-friendly). |
| **EMAIL_USER**, **EMAIL_PASS** | `email/sendEmail.js` | Gmail auth and from address (same as your other project). |
| **AUTHORIZATION**, **AUTH_API_URL**, **USER_AGENT** | `lambda/shared/apiClient.js` | Trackmania Nadeo API auth (Basic auth header, login URL, User-Agent). |
| **OCLIENT_ID**, **OCLIENT_SECRET** | `lambda/shared/oauthApiClient.js` | Trackmania OAuth2 (account names API). |
| **LEAD_API** | `lambda/mapSearch.js`, `lambda/mapSearchBackground.js`, `lambda/getMapRecords.js`, `lambda/checkDriverPositions.js`, `lambda/driverNotifications.js`, `lambda/driverNotificationStatusCheck.js` | Trackmania leaderboard API base URL. |
| **MAX_NEW_RECORDS_PER_MAP**, **POPULAR_MAP_MESSAGE** | `lambda/schedulerProcessor.js` | Optional; email formatting. |

## Minimum to run

- `NEON_DB_CONNECTION_STRING`
- `JWT_SECRET`
- `LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT`
- `OCLIENT_ID`, `OCLIENT_SECRET`

For daily cron: `CRON_SECRET`. For email: `EMAIL_USER`, `EMAIL_PASS`.
