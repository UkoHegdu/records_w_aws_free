# Scheduler logs and manual trigger

How to view driver notification (and mapper alert) logs and how to run the daily check manually.

## 1. Viewing logs

Logs are in **CloudWatch Logs**. Two Lambdas matter for driver notifications:

| Lambda | Log group | Role |
|--------|-----------|------|
| **scheduler** | `/aws/lambda/recordsw-app-scheduler` | Runs daily (EventBridge), queues Phase 1 + Phase 2 jobs to SQS |
| **schedulerProcessor** | `/aws/lambda/recordsw-app-scheduler-processor` | Consumes SQS, runs map alert checks and driver notification checks |

Use your actual function name if you override `app_name` in Terraform (e.g. `my-app-scheduler` → `/aws/lambda/my-app-scheduler`). Default region is **eu-north-1**.

### AWS Console

1. **CloudWatch** → **Log groups**.
2. Open `/aws/lambda/recordsw-app-scheduler` or `/aws/lambda/recordsw-app-scheduler-processor`.
3. Open the latest **Log stream** (one per invocation).
4. For "why didn't I get a driver notification?", use **schedulerProcessor** logs: look for your username, `Phase 2`, `driver_notification_check`, `position beaten`, `User X not found`, or errors.

### AWS CLI

List recent log streams (last 24 hours):

```bash
# Scheduler (queues jobs)
aws logs describe-log-streams \
  --log-group-name /aws/lambda/recordsw-app-scheduler \
  --order-by LastEventTime --descending --max-items 5 \
  --region eu-north-1

# Processor (runs driver checks)
aws logs describe-log-streams \
  --log-group-name /aws/lambda/recordsw-app-scheduler-processor \
  --order-by LastEventTime --descending --max-items 5 \
  --region eu-north-1
```

Get events from a log stream (replace `STREAM_NAME`):

```bash
aws logs get-log-events \
  --log-group-name /aws/lambda/recordsw-app-scheduler-processor \
  --log-stream-name "STREAM_NAME" \
  --region eu-north-1
```

Filter by time (e.g. last 24 hours, Unix ms):

```bash
START=$(python3 -c "import time; print(int((time.time() - 86400) * 1000))")
aws logs filter-log-events \
  --log-group-name /aws/lambda/recordsw-app-scheduler-processor \
  --start-time "$START" \
  --filter-pattern "driver_notification" \
  --region eu-north-1
```

On Windows PowerShell you can set start time and call the same `filter-log-events` with `--start-time` and `--filter-pattern "driver_notification"`.

---

## 2. Triggering the check again

The scheduler Lambda **queues** all Phase 1 (mapper) and Phase 2 (driver) jobs. When you invoke it, it sends messages to SQS; **schedulerProcessor** is triggered by SQS and runs the checks. So you only need to invoke the **scheduler** once.

### AWS Console

1. **Lambda** → **Functions** → **recordsw-app-scheduler**.
2. **Test** tab → create a test event (e.g. empty `{}`) if needed → **Test**.
3. Check **Execution results** and then the **schedulerProcessor** log group for the actual driver checks.

### AWS CLI

```bash
aws lambda invoke \
  --function-name recordsw-app-scheduler \
  --region eu-north-1 \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  response.json

cat response.json
```

Then check **schedulerProcessor** logs (see above). Processing can take a few minutes as messages are consumed from SQS.

---

## What to look for in logs

- **scheduler**: `Phase 2: Queuing driver notification checks`, `Found N users with driver notifications`, `Queued driver notification check for <username>`.
- **schedulerProcessor**: `Phase 2: Checking driver notifications for <username>`, `Found N driver notifications`, `position beaten`, `User X not found in position data`, or stack traces.

If your username never appears in schedulerProcessor for `driver_notification_check`, the scheduler either didn't run or didn't queue your user (e.g. no row in `driver_notifications` or wrong user list). If it appears but you see `User X not found` or an error, the failure is in the position check or email step.
