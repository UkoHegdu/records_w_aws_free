# Differences Between Backend (Unified) and AWS (Lambda + API Gateway)

The **unified backend** in `/backend` is intended for deployment on **Hetzner** (or similar) with **no access to AWS**. It uses in-memory stores and no DynamoDB/SQS/SES for sessions and map search. The repo keeps both backend and `terraform/lambda` so you can **synchronize logic changes** between them; the two deployments are independent.

**Sync rule:** Do **not** copy backend’s `login`, `refreshToken`, `logout`, `mapSearch`, `mapSearchBackground`, or `checkJobStatus` into `terraform/lambda` (they depend on `../sessionStore` and `../mapSearchJobStore`, which don’t exist in Lambda). Copy the other handlers both ways as needed. When bringing changes from terraform into backend, re-apply or keep the backend-only versions of those six files.

---

## 1. Sessions (login / refresh / logout)

| Aspect | AWS | Backend |
|--------|-----|---------|
| **Storage** | DynamoDB table (`USER_SESSIONS_TABLE_NAME`). Sessions survive restarts and are shared across Lambda invocations. | In-memory `Map` in `src/sessionStore.js`. Sessions are lost on process restart and are not shared across instances. |
| **Code** | `terraform/lambda/login.js`, `refreshToken.js`, `logout.js` use `@aws-sdk/client-dynamodb`. | `backend/src/lambda/` versions use **only** `require('../sessionStore')`; no AWS SDK for sessions. |
| **Env** | Requires `USER_SESSIONS_TABLE_NAME`, `AWS_REGION`, and AWS credentials. | Backend: no session-related env vars; no AWS. |

**Backend-only files:** `src/sessionStore.js`.

---

## 2. Map search jobs (submit job + poll status + background work)

| Aspect | AWS | Backend |
|--------|-----|---------|
| **Job storage** | DynamoDB table (`MAP_SEARCH_RESULTS_TABLE_NAME`). Job rows created/updated by `mapSearch` and `mapSearchBackground`. | **Postgres** when `NEON_DB_CONNECTION_STRING` is set: table `map_search_jobs` (see `backend/sql/map_search_jobs.sql`). Otherwise **in-memory** `Map` in `src/mapSearchJobStore.js` (jobs lost on restart). |
| **Background execution** | `mapSearch` writes a job row, sends a message to SQS (`MAP_SEARCH_QUEUE_URL`). A separate Lambda (`mapSearchBackground`) is invoked by SQS, processes the job, updates DynamoDB. | `mapSearch` creates a job (Postgres or in-memory), then runs `mapSearchBackground.handler()` in the same process with a fake SQS event (fire-and-forget via `setImmediate`). No SQS; one process does both. |
| **Status polling** | `checkJobStatus` reads from DynamoDB. | `checkJobStatus` reads from `mapSearchJobStore.get(jobId)` (Postgres or in-memory). |
| **Code** | `terraform/lambda`: `mapSearch.js` uses DynamoDB + SQS; `mapSearchBackground.js` uses DynamoDB UpdateItem; `checkJobStatus.js` uses DynamoDB GetItem. | `backend/src/lambda/` versions use **only** `../mapSearchJobStore` and in-process `mapSearchBackground.handler()`; no DynamoDB or SQS. |
| **Env** | Requires `MAP_SEARCH_RESULTS_TABLE_NAME`, `MAP_SEARCH_QUEUE_URL`, `AWS_REGION`, and AWS credentials. | Backend: no map-search AWS env vars. For Postgres jobs, set `NEON_DB_CONNECTION_STRING` and run `backend/sql/map_search_jobs.sql` on Neon. |

**Backend-only files:** `src/mapSearchJobStore.js` (facade: picks Postgres or in-memory), `src/mapSearchJobStorePg.js`.

**Simplest single-process behavior:** One Node process handles the HTTP request that creates the job and, in the same process, runs the background logic (same as `mapSearchBackground`) without a separate worker or cron. The client still polls `GET .../maps/status/:jobId` for status and result.

---

## 3. Other AWS services (unchanged in backend for now)

- **Daily emails / scheduler / driver notifications:** Still use DynamoDB and SQS in both AWS and backend (see `scheduler.js`, `schedulerProcessor.js`, `emailSender.js`, etc.). Migration to Postgres + cron is planned (see `docs/NEXT_STEPS_FOR_PROJECT.md`).
- **Email sending:** Both use AWS SES via `@aws-sdk/client-ses` in `emailSender.js`. Replacing with a generic SMTP sender is planned.
- **Other Lambdas:** Any handler that still uses DynamoDB, SQS, or SES in `backend/src/lambda/` behaves the same as on AWS until those pieces are migrated.

---

## 4. Keeping backend and AWS in sync

- Handler source lives in two places: `terraform/lambda/` (AWS) and `backend/src/lambda/` (unified server). Backend is deployed on Hetzner with **no AWS**; terraform is deployed on AWS.
- Backend-only modules: `src/sessionStore.js`, `src/mapSearchJobStore.js`, `src/mapSearchJobStorePg.js`. They exist only under `backend/` and are not in `terraform/lambda/`.
- **Do not** overwrite `terraform/lambda`’s `login`, `refreshToken`, `logout`, `mapSearch`, `mapSearchBackground`, or `checkJobStatus` with the backend versions when syncing backend → terraform (they would break on Lambda). Sync the **rest** of the handlers both ways. For the six listed files, keep separate versions: AWS uses DynamoDB/SQS; backend uses in-memory stores only.
