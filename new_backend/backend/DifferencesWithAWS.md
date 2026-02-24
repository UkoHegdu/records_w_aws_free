# Backend vs AWS (reference)

This backend runs as a single Node/Express server. **No AWS services are used at runtime.**

| Area | This backend | Old AWS setup (reference only) |
|------|--------------|--------------------------------|
| **Sessions** | In-memory (`sessionStore.js`). Lost on restart. | DynamoDB or similar |
| **Map-search jobs** | Postgres `map_search_jobs` (or in-memory if no DB). Runs in-process via `setImmediate`. | SQS + Lambda workers |
| **Daily emails / cron** | `POST /api/v1/cron/daily` (system cron calls it). Postgres `daily_emails`, `map_leaderboard_cache`. Gmail (nodemailer). | EventBridge → SQS → Lambda, DynamoDB, SES |
| **API tokens** | Postgres `api_tokens` | DynamoDB |

Handler code in `src/lambda/` was written for Lambda but runs in-process via `lambdaAdapter`. The folder name is kept for 1:1 mapping with any Terraform/Lambda config.
