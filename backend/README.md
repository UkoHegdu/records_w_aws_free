# Recordsw Backend (unified from Lambda)

Single Node/Express server that exposes the same REST API as the API Gateway + Lambda setup. All handler code lives in `src/lambda/` (copied from `terraform/lambda/`) so the backend is self-contained.

## Run locally

1. **Install dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Environment**

   Create a `.env` in `backend/` (or set env vars) with the same variables the Lambdas use. At minimum:

   - `NEON_DB_CONNECTION_STRING`
   - `JWT_SECRET`
   - `USER_SESSIONS_TABLE_NAME` (DynamoDB table name – still used until you migrate to Neon)
   - `DYNAMODB_TABLE_NAME` (auth tokens table)
   - `MAP_SEARCH_RESULTS_TABLE_NAME`
   - `MAP_SEARCH_QUEUE_URL`
   - `LEAD_API`, `AUTH_API_URL`, `AUTHORIZATION`, `USER_AGENT`
   - `OCLIENT_ID`, `OCLIENT_SECRET`
   - `AWS_REGION` (for DynamoDB/SQS if you still use them)

   See `terraform/main.tf` and Lambda env blocks for the full list.

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

## Keeping serverless and backend in sync

Handler code exists in two places: `terraform/lambda/` (AWS) and `backend/src/lambda/` (this backend). You will change both over time. To avoid drift:

1. **Pick a single source of truth** for each change:
   - **AWS-first:** Edit in `terraform/lambda/`. When you’re ready to update production, run the sync script (below) so `backend/src/lambda/` gets the same files.
   - **Backend-first:** Edit in `backend/src/lambda/`. Before you deploy to AWS, run the sync script in reverse (backend → terraform) so Lambda gets your changes.

2. **Sync script (terraform → backend)**  
   From repo root:
   ```bash
   node backend/scripts/sync-lambda-from-terraform.js
   ```
   This copies handler and shared files from `terraform/lambda/` into `backend/src/lambda/`, skipping tests and manual-only files. Run it after you change `terraform/lambda/` and want the backend to match.

3. **Sync script (backend → terraform)**  
   From repo root:
   ```bash
   node backend/scripts/sync-lambda-to-terraform.js
   ```
   Use this when you’ve edited `backend/src/lambda/` and want to deploy the same code to AWS.

4. **If you only change one side sometimes:**  
   Keep a short note (e.g. in a `SYNC` file or commit message) when you’ve updated only one copy, so you remember to run the appropriate sync before deploying the other.

## Copying to another branch/repo

Copy the whole `backend/` folder; it already contains all handler code in `src/lambda/`. Install deps and set env as above.

## Next steps (Hetzner / non-AWS)

- Replace DynamoDB with Neon tables (sessions, tokens, map_search_jobs, cache, daily_emails).
- Replace SQS with a Postgres-backed job queue + a small worker (cron or in-process).
- Run daily scheduler and driver notifications via cron calling the same logic as `schedulerProcessor` and `driverNotificationProcessor`.
