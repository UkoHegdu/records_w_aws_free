# main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources for AWS Parameter Store

# SES Configuration - using existing email parameter
data "aws_ssm_parameter" "email_user" {
  name = "/${var.environment}/EMAIL_USER"
}

data "aws_ssm_parameter" "auth_api_url" {
  name = "/${var.environment}/AUTH_API_URL"
}

data "aws_ssm_parameter" "lead_api" {
  name = "/${var.environment}/LEAD_API"
}

data "aws_ssm_parameter" "account_api" {
  name = "/${var.environment}/ACCOUNT_API"
}

data "aws_ssm_parameter" "authorization" {
  name = "/${var.environment}/AUTHORIZATION"
}

data "aws_ssm_parameter" "user_agent" {
  name = "/${var.environment}/USER_AGENT"
}

data "aws_ssm_parameter" "jwt_secret" {
  name = "/${var.environment}/JWT_SECRET"
}

data "aws_ssm_parameter" "oclient_id" {
  name = "/${var.environment}/OCLIENT_ID"
}

data "aws_ssm_parameter" "oclient_secret" {
  name = "/${var.environment}/OCLIENT_SECRET"
}

# Neon Database Parameters
data "aws_ssm_parameter" "neon_db_connection_string" {
  name = "/${var.environment}/NEON_DB_CONNECTION_STRING"
}

# Error notification email parameter
data "aws_ssm_parameter" "error_email" {
  name = "/${var.environment}/ERROR_EMAIL"
}

# SNS Topic for Error Notifications
resource "aws_sns_topic" "error_notifications" {
  name = "${var.app_name}-error-notifications"
  
  tags = {
    Environment = var.environment
    Purpose     = "Lambda Error Monitoring"
  }
}

# SNS Topic Subscription for Error Email Notifications
resource "aws_sns_topic_subscription" "error_email" {
  topic_arn = aws_sns_topic.error_notifications.arn
  protocol  = "email"
  endpoint  = data.aws_ssm_parameter.error_email.value  # Use separate error email
  
  # Prevent Terraform from trying to recreate confirmed subscriptions
  confirmation_timeout_in_minutes = 1
  
  # Note: You'll need to confirm this subscription via email (only once)
}

# SES Configuration
# SES Identity (verified email address)
resource "aws_ses_email_identity" "from_email" {
  email = data.aws_ssm_parameter.email_user.value
}

# SES Configuration Set for tracking
resource "aws_ses_configuration_set" "main" {
  name = "${var.app_name}-ses-config"
  
  delivery_options {
    tls_policy = "Require"
  }
  
  reputation_metrics_enabled = true
  sending_enabled           = true
}

# SES Event Destination for CloudWatch Logs
resource "aws_ses_event_destination" "cloudwatch" {
  name                   = "${var.app_name}-ses-cloudwatch"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["send", "reject", "bounce", "complaint", "delivery", "open", "click", "renderingFailure"]
  
  cloudwatch_destination {
    default_value  = "default"
    dimension_name = "MessageTag"
    value_source   = "messageTag"
  }
}

# S3 Bucket for Frontend
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.app_name}-frontend-${var.environment}"
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"  # For SPA routing
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  depends_on = [aws_s3_bucket_public_access_block.frontend]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      },
    ]
  })
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket_website_configuration.frontend.website_endpoint
    origin_id   = "S3-${aws_s3_bucket.frontend.bucket}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.frontend.bucket}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress              = true
  }

  # SPA routing - redirect 404s to index.html
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.app_name}-frontend"
    Environment = var.environment
  }
}

# DynamoDB Table for Token Storage
resource "aws_dynamodb_table" "auth_tokens" {
  name           = "${var.app_name}-auth-tokens"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "provider"
  range_key      = "token_type"

  attribute {
    name = "provider"
    type = "S"
  }

  attribute {
    name = "token_type"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-auth-tokens"
    Environment = var.environment
  }
}

# DynamoDB table for map search results
resource "aws_dynamodb_table" "map_search_results" {
  name           = "${var.app_name}-map-search-results"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "job_id"

  attribute {
    name = "job_id"
    type = "S"
  }

  # TTL for automatic cleanup of old results (24 hours)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-map-search-results"
    Environment = var.environment
  }
}

# DynamoDB table for caching map leaderboard data during daily processing
resource "aws_dynamodb_table" "map_leaderboard_cache" {
  name           = "${var.app_name}-map-leaderboard-cache"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "cache_key"

  attribute {
    name = "cache_key"
    type = "S"
  }

  # TTL for automatic cleanup after daily job (24 hours)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-map-leaderboard-cache"
    Environment = var.environment
  }
}

# SQS Queue for Map Search Jobs (Free Tier: 1 million requests/month)
resource "aws_sqs_queue" "map_search_queue" {
  name                      = "${var.app_name}-map-search-queue"
  visibility_timeout_seconds = 960  # 16 minutes (slightly longer than Lambda timeout)
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling to reduce costs
  
  # Dead letter queue for failed messages
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.map_search_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name        = "${var.app_name}-map-search-queue"
    Environment = var.environment
  }
}

# Dead Letter Queue for failed map search jobs
resource "aws_sqs_queue" "map_search_dlq" {
  name                      = "${var.app_name}-map-search-dlq"
  message_retention_seconds  = 1209600  # 14 days

  tags = {
    Name        = "${var.app_name}-map-search-dlq"
    Environment = var.environment
  }
}

# SQS Queue for Scheduler Jobs (Free Tier: 1 million requests/month)
resource "aws_sqs_queue" "scheduler_queue" {
  name                      = "${var.app_name}-scheduler-queue"
  visibility_timeout_seconds = 960  # 16 minutes (slightly longer than Lambda timeout)
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling to reduce costs
  
  # Dead letter queue for failed messages
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.scheduler_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name        = "${var.app_name}-scheduler-queue"
    Environment = var.environment
  }
}

# Dead Letter Queue for failed scheduler jobs
resource "aws_sqs_queue" "scheduler_dlq" {
  name                      = "${var.app_name}-scheduler-dlq"
  message_retention_seconds  = 1209600  # 14 days

  tags = {
    Name        = "${var.app_name}-scheduler-dlq"
    Environment = var.environment
  }
}

# DynamoDB table for user sessions
resource "aws_dynamodb_table" "user_sessions" {
  name           = "${var.app_name}-user-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "session_id"

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  # Global Secondary Index for querying sessions by user
  global_secondary_index {
    name            = "user-sessions-index"
    hash_key        = "user_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # TTL for automatic cleanup of expired sessions (7 days)
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-user-sessions"
    Environment = var.environment
  }
}

# DynamoDB table for driver notification jobs
resource "aws_dynamodb_table" "driver_notification_jobs" {
  name           = "${var.app_name}-driver-notification-jobs"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "job_id"

  attribute {
    name = "job_id"
    type = "S"
  }

  # TTL for automatic cleanup of old jobs (24 hours)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-driver-notification-jobs"
    Environment = var.environment
  }
}

# DynamoDB table for daily email bodies
resource "aws_dynamodb_table" "daily_emails" {
  name           = "${var.app_name}-daily-emails"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"
  range_key      = "date"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  # TTL for automatic cleanup of old emails (7 days)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${var.app_name}-daily-emails"
    Environment = var.environment
  }
}

# SQS Queue for Driver Notification Jobs (Free Tier: 1 million requests/month)
resource "aws_sqs_queue" "driver_notification_queue" {
  name                      = "${var.app_name}-driver-notification-queue"
  visibility_timeout_seconds = 960  # 16 minutes (slightly longer than Lambda timeout)
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling to reduce costs
  
  # Dead letter queue for failed messages
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.driver_notification_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name        = "${var.app_name}-driver-notification-queue"
    Environment = var.environment
  }
}

# Dead Letter Queue for failed driver notification jobs
resource "aws_sqs_queue" "driver_notification_dlq" {
  name                      = "${var.app_name}-driver-notification-dlq"
  message_retention_seconds  = 1209600  # 14 days

  tags = {
    Name        = "${var.app_name}-driver-notification-dlq"
    Environment = var.environment
  }
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "${var.app_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Role for Step Functions
resource "aws_iam_role" "step_functions_role" {
  name = "${var.app_name}-step-functions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Role for EventBridge to invoke Step Functions
resource "aws_iam_role" "eventbridge_step_functions_role" {
  name = "${var.app_name}-eventbridge-step-functions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM Policy for Step Functions to invoke Lambda functions
resource "aws_iam_role_policy" "step_functions_lambda_policy" {
  name = "${var.app_name}-step-functions-lambda-policy"
  role = aws_iam_role.step_functions_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.driver_notification_processor.arn,
          aws_lambda_function.driver_notification_status_check.arn,
          aws_lambda_function.email_sender.arn
        ]
      }
    ]
  })
}

# IAM Policy for EventBridge to invoke Step Functions
resource "aws_iam_role_policy" "eventbridge_step_functions_policy" {
  name = "${var.app_name}-eventbridge-step-functions-policy"
  role = aws_iam_role.eventbridge_step_functions_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution"
        ]
        Resource = [
          aws_sfn_state_machine.driver_notification_workflow.arn
        ]
      }
    ]
  })
}

# DynamoDB and Parameter Store permissions for Lambda functions
resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name = "${var.app_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.auth_tokens.arn,
          "${aws_dynamodb_table.auth_tokens.arn}/index/*",
          aws_dynamodb_table.map_search_results.arn,
          "${aws_dynamodb_table.map_search_results.arn}/index/*",
          aws_dynamodb_table.user_sessions.arn,
          "${aws_dynamodb_table.user_sessions.arn}/index/*",
          aws_dynamodb_table.map_leaderboard_cache.arn,
          "${aws_dynamodb_table.map_leaderboard_cache.arn}/index/*",
          aws_dynamodb_table.driver_notification_jobs.arn,
          "${aws_dynamodb_table.driver_notification_jobs.arn}/index/*",
          aws_dynamodb_table.daily_emails.arn,
          "${aws_dynamodb_table.daily_emails.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.map_search_queue.arn,
          aws_sqs_queue.map_search_dlq.arn,
          aws_sqs_queue.scheduler_queue.arn,
          aws_sqs_queue.scheduler_dlq.arn,
          aws_sqs_queue.driver_notification_queue.arn,
          aws_sqs_queue.driver_notification_dlq.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/${var.environment}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.error_notifications.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda Functions
resource "aws_lambda_function" "user_search" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-user-search"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/user_search.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
  ]
}

resource "aws_lambda_function" "mapSearch" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-user-maps"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/mapSearch.handler"
  runtime         = "nodejs18.x"
  timeout         = 30  # Reduced timeout since we're just queuing jobs
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name
      MAP_SEARCH_QUEUE_URL = aws_sqs_queue.map_search_queue.url
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Background processing Lambda for map search
resource "aws_lambda_function" "mapSearchBackground" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-map-search-background"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/mapSearchBackground.handler"
  runtime         = "nodejs18.x"
  timeout         = 900  # 15 minutes - maximum Lambda timeout
  reserved_concurrent_executions = 2  # Limit to 2 concurrent executions
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# SQS Event Source Mapping for mapSearchBackground
resource "aws_lambda_event_source_mapping" "map_search_sqs_trigger" {
  event_source_arn = aws_sqs_queue.map_search_queue.arn
  function_name    = aws_lambda_function.mapSearchBackground.arn
  batch_size       = 1  # Process one job at a time
  maximum_batching_window_in_seconds = 5  # Wait up to 5 seconds to batch messages
}

# Lambda function to check job status
resource "aws_lambda_function" "checkJobStatus" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-check-job-status"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/checkJobStatus.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "login" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-login"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/login.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET               = data.aws_ssm_parameter.jwt_secret.value
      USER_SESSIONS_TABLE_NAME = aws_dynamodb_table.user_sessions.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "register" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-register"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/register.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "create_alert" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-create-alert"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/create_alert.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "get_user_profile" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-user-profile"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getUserProfile.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "get_map_records" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-map-records"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getMapRecords.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}



resource "aws_lambda_function" "account_names" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-account-names"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/accountNames.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "scheduler" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-scheduler"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/scheduler.handler"
  runtime         = "nodejs18.x"
  timeout         = 60  # 1 minute (just queuing jobs)
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      SCHEDULER_QUEUE_URL = aws_sqs_queue.scheduler_queue.url
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Scheduler Processor Lambda for processing queued user checks
resource "aws_lambda_function" "schedulerProcessor" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-scheduler-processor"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/schedulerProcessor.handler"
  runtime         = "nodejs18.x"
  timeout         = 900  # 15 minutes
  reserved_concurrent_executions = 1  # Sequential processing to respect API rate limits
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DAILY_EMAILS_TABLE_NAME = aws_dynamodb_table.daily_emails.name
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      MAP_LEADERBOARD_CACHE_TABLE_NAME = aws_dynamodb_table.map_leaderboard_cache.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
      MAX_NEW_RECORDS_PER_MAP = "20"
      POPULAR_MAP_MESSAGE = "This map has had more than 20 new times and we are not showing all the details to prevent email spam."
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# SQS Event Source Mapping for schedulerProcessor
resource "aws_lambda_event_source_mapping" "scheduler_sqs_trigger" {
  event_source_arn = aws_sqs_queue.scheduler_queue.arn
  function_name    = aws_lambda_function.schedulerProcessor.arn
  batch_size       = 1  # Process one user check at a time
  maximum_batching_window_in_seconds = 5  # Wait up to 5 seconds to batch messages
}

resource "aws_lambda_function" "health" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-health"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/health.handler"
  runtime         = "nodejs18.x"
  timeout         = 30  # Quick health check
  source_code_hash = filebase64sha256("lambda_functions.zip")

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "refresh_token" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-refresh-token"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/refreshToken.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
      USER_SESSIONS_TABLE_NAME = aws_dynamodb_table.user_sessions.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "logout" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-logout"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/logout.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
      USER_SESSIONS_TABLE_NAME = aws_dynamodb_table.user_sessions.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Driver Notifications Lambda Functions

resource "aws_lambda_function" "map_search_driver" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-map-search-driver"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/mapSearchDriver.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
  ]
}

resource "aws_lambda_function" "verify_tm_username" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-verify-tm-username"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/verifyTmUsername.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "driver_notifications" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-driver-notifications"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/driverNotifications.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "driver_notification_processor" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-driver-notification-processor"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/driverNotificationProcessor.handler"
  runtime         = "nodejs18.x"
  timeout         = 900  # 15 minutes for processing
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
      DRIVER_NOTIFICATION_QUEUE_URL = aws_sqs_queue.driver_notification_queue.url
      DRIVER_NOTIFICATION_JOBS_TABLE_NAME = aws_dynamodb_table.driver_notification_jobs.name
      DAILY_EMAILS_TABLE_NAME = aws_dynamodb_table.daily_emails.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "driver_notification_status_check" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-driver-notification-status-check"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/driverNotificationStatusCheck.handler"
  runtime         = "nodejs18.x"
  timeout         = 900  # 15 minutes for processing
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "email_sender" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-email-sender"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/emailSender.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DAILY_EMAILS_TABLE_NAME = aws_dynamodb_table.daily_emails.name
      SES_FROM_EMAIL = data.aws_ssm_parameter.email_user.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for efficient driver position checking
resource "aws_lambda_function" "check_driver_positions" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-check-driver-positions"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/checkDriverPositions.handler"
  runtime         = "nodejs18.x"
  timeout         = 60  # 1 minute for position API calls
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for getting admin configuration
resource "aws_lambda_function" "get_admin_config" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-admin-config"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getAdminConfig.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for updating admin configuration
resource "aws_lambda_function" "update_admin_config" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-update-admin-config"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/updateAdminConfig.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for checking map positions
resource "aws_lambda_function" "check_map_positions" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-check-map-positions"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/checkMapPositions.handler"
  runtime         = "nodejs18.x"
  timeout         = 60  # 1 minute for position API calls
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.auth_tokens.name
      LEAD_API = data.aws_ssm_parameter.lead_api.value
      AUTH_API_URL = data.aws_ssm_parameter.auth_api_url.value
      AUTHORIZATION = data.aws_ssm_parameter.authorization.value
      USER_AGENT = data.aws_ssm_parameter.user_agent.value
      OCLIENT_ID = data.aws_ssm_parameter.oclient_id.value
      OCLIENT_SECRET = data.aws_ssm_parameter.oclient_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for getting admin users
resource "aws_lambda_function" "get_admin_users" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-admin-users"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getAdminUsers.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for updating user alert type
resource "aws_lambda_function" "update_user_alert_type" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-update-user-alert-type"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/updateUserAlertType.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for getting notification history
resource "aws_lambda_function" "get_notification_history" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-notification-history"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getNotificationHistory.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "submit_feedback" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-submit-feedback"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/submitFeedback.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

resource "aws_lambda_function" "get_feedback" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-feedback"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getFeedback.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Lambda function for getting admin daily overview
resource "aws_lambda_function" "get_admin_daily_overview" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-get-admin-daily-overview"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/getAdminDailyOverview.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Test Lambda Function - Simple function to isolate API Gateway issues
resource "aws_lambda_function" "test" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-test"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/test.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Advanced Test Lambda Function - With JWT validation
resource "aws_lambda_function" "test_advanced" {
  filename         = "lambda_functions.zip"
  function_name    = "${var.app_name}-test-advanced"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda/testAdvanced.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      JWT_SECRET = data.aws_ssm_parameter.jwt_secret.value
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_policy,
    aws_iam_role_policy.lambda_dynamodb_policy,
  ]
}

# Step Functions State Machine for Driver Notification Workflow
resource "aws_sfn_state_machine" "driver_notification_workflow" {
  name     = "${var.app_name}-driver-notification-workflow"
  role_arn = aws_iam_role.step_functions_role.arn

  definition = jsonencode({
    Comment = "Daily Email Workflow - Scheduler creates email body, driver processor adds info, then send"
    StartAt = "ProcessNotifications"
    States = {
      ProcessNotifications = {
        Type     = "Task"
        Resource = aws_lambda_function.driver_notification_processor.arn
        Next     = "CheckStatus"
        Retry = [
          {
            ErrorEquals     = ["States.ALL"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "ProcessNotificationsFailed"
            ResultPath  = "$.error"
          }
        ]
      }
      CheckStatus = {
        Type     = "Task"
        Resource = aws_lambda_function.driver_notification_status_check.arn
        Next     = "SendEmails"
        Retry = [
          {
            ErrorEquals     = ["States.ALL"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "StatusCheckFailed"
            ResultPath  = "$.error"
          }
        ]
      }
      SendEmails = {
        Type     = "Task"
        Resource = aws_lambda_function.email_sender.arn
        End      = true
        Retry = [
          {
            ErrorEquals     = ["States.ALL"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "EmailSendFailed"
            ResultPath  = "$.error"
          }
        ]
      }
      ProcessNotificationsFailed = {
        Type = "Fail"
        Cause = "Driver notification processing failed"
      }
      StatusCheckFailed = {
        Type = "Fail"
        Cause = "Driver notification status check failed"
      }
      EmailSendFailed = {
        Type = "Fail"
        Cause = "Email sending failed"
      }
    }
  })

  tags = {
    Name        = "${var.app_name}-driver-notification-workflow"
    Environment = var.environment
  }

  depends_on = [
    aws_iam_role_policy.step_functions_lambda_policy,
    aws_lambda_function.driver_notification_processor,
    aws_lambda_function.driver_notification_status_check,
    aws_lambda_function.email_sender
  ]
}

# EventBridge rule for daily scheduler trigger at 5 AM CET (4 AM UTC)
resource "aws_cloudwatch_event_rule" "scheduler_rule" {
  name                = "${var.app_name}-scheduler-rule"
  description         = "Trigger scheduler Lambda daily at 5 AM CET"
  schedule_expression = "cron(0 4 * * ? *)"  # 4 AM UTC = 5 AM CET (winter) / 6 AM CEST (summer)
}

# EventBridge rule for daily driver notification processing at 6 AM CET (5 AM UTC)
resource "aws_cloudwatch_event_rule" "driver_notification_rule" {
  name                = "${var.app_name}-driver-notification-rule"
  description         = "Trigger driver notification processing daily at 6 AM CET"
  schedule_expression = "cron(0 5 * * ? *)"  # 5 AM UTC = 6 AM CET (winter) / 7 AM CEST (summer)
}

# EventBridge target to invoke the scheduler Lambda
resource "aws_cloudwatch_event_target" "scheduler_target" {
  rule      = aws_cloudwatch_event_rule.scheduler_rule.name
  target_id = "SchedulerLambdaTarget"
  arn       = aws_lambda_function.scheduler.arn
}

# Permission for EventBridge to invoke the scheduler Lambda
resource "aws_lambda_permission" "allow_eventbridge_scheduler" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scheduler_rule.arn
}

# EventBridge target to invoke the Step Functions workflow
resource "aws_cloudwatch_event_target" "driver_notification_target" {
  rule      = aws_cloudwatch_event_rule.driver_notification_rule.name
  target_id = "DriverNotificationStepFunctionsTarget"
  arn       = aws_sfn_state_machine.driver_notification_workflow.arn
  role_arn  = aws_iam_role.eventbridge_step_functions_role.arn
}


# Permission for API Gateway to invoke the health Lambda
resource "aws_lambda_permission" "api_gw_lambda_health" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}


# Separate IAM policy for Lambda invocation permissions (to avoid cycles)
resource "aws_iam_role_policy" "lambda_invoke_policy" {
  name = "${var.app_name}-lambda-invoke-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.mapSearchBackground.arn,
          aws_lambda_function.checkJobStatus.arn
        ]
      }
    ]
  })

  depends_on = [
    aws_lambda_function.mapSearchBackground,
    aws_lambda_function.checkJobStatus
  ]
}

# CloudWatch Alarms for Lambda Error Monitoring (Free Tier Optimized)
# Monitor errors across all Lambda functions with a single alarm to stay within free tier

# Combined Lambda Errors Alarm (Daily Check - Less Frequent)
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.app_name}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"  # Single evaluation
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "86400"  # 24 hours (once per day)
  statistic           = "Sum"
  threshold           = "0"    # Trigger on any error
  alarm_description   = "Lambda function errors detected (daily check)"
  alarm_actions       = [aws_sns_topic.error_notifications.arn]
  treat_missing_data  = "notBreaching"

  # Dimensions for all Lambda functions
  dimensions = {
    FunctionName = aws_lambda_function.user_search.function_name
  }

  tags = {
    Environment = var.environment
    Purpose     = "Daily Error Monitoring"
  }
}

# Scheduler Lambda Errors (Daily Check - Critical Function)
resource "aws_cloudwatch_metric_alarm" "scheduler_errors" {
  alarm_name          = "${var.app_name}-scheduler-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"  # Single evaluation
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "86400"  # 24 hours (once per day)
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Scheduler Lambda errors - critical function (daily check)"
  alarm_actions       = [aws_sns_topic.error_notifications.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.scheduler.function_name
  }

  tags = {
    Environment = var.environment
    Purpose     = "Daily Critical Error Monitoring"
  }
}

# Lambda Duration Alarm (Daily Check - Performance Monitoring)
resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${var.app_name}-lambda-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "86400"  # 24 hours (once per day)
  statistic           = "Average"
  threshold           = "25000"  # 25 seconds (most functions timeout at 30s)
  alarm_description   = "Lambda function taking too long to execute (daily check)"
  alarm_actions       = [aws_sns_topic.error_notifications.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.scheduler.function_name  # Monitor scheduler as it has longest timeout
  }

  tags = {
    Environment = var.environment
    Purpose     = "Daily Performance Monitoring"
  }
}

# Log retention policies are managed manually via AWS CLI
# This ensures Lambda-created log groups have proper retention without Terraform conflicts

# CloudWatch Dashboard for Lambda Monitoring (Free Tier: 3 dashboards)
resource "aws_cloudwatch_dashboard" "lambda_monitoring" {
  dashboard_name = "${var.app_name}-lambda-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.user_search.function_name],
            [".", "Errors", ".", "."],
            [".", "Duration", ".", "."],
            [".", "Invocations", "FunctionName", aws_lambda_function.mapSearch.function_name],
            [".", "Errors", ".", "."],
            [".", "Duration", ".", "."],
            [".", "Invocations", "FunctionName", aws_lambda_function.scheduler.function_name],
            [".", "Errors", ".", "."],
            [".", "Duration", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Lambda Functions Overview"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.user_search.function_name],
            [".", ".", ".", aws_lambda_function.mapSearch.function_name],
            [".", ".", ".", aws_lambda_function.create_alert.function_name],
            [".", ".", ".", aws_lambda_function.login.function_name],
            [".", ".", ".", aws_lambda_function.register.function_name],
            [".", ".", ".", aws_lambda_function.get_map_records.function_name],
            [".", ".", ".", aws_lambda_function.account_names.function_name],
            [".", ".", ".", aws_lambda_function.scheduler.function_name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Lambda Errors by Function"
          period  = 300
        }
      }
    ]
  })
}






# Deploy API Gateway
resource "aws_api_gateway_deployment" "api_deployment" {
  depends_on = [
    aws_api_gateway_method.search_get,
    aws_api_gateway_integration.search_integration,
    aws_api_gateway_method.search_options,
    aws_api_gateway_integration.search_options_integration,
    aws_api_gateway_method_response.search_options_200,
    aws_api_gateway_integration_response.search_options_integration_response,
    aws_api_gateway_method.maps_get,
    aws_api_gateway_integration.maps_integration,
    aws_api_gateway_method.maps_options,
    aws_api_gateway_integration.maps_options_integration,
    aws_api_gateway_method_response.maps_options_200,
    aws_api_gateway_integration_response.maps_options_integration_response,
    aws_api_gateway_method.job_status_get,
    aws_api_gateway_integration.job_status_integration,
    aws_api_gateway_method.job_status_options,
    aws_api_gateway_integration.job_status_options_integration,
    aws_api_gateway_method_response.job_status_options_200,
    aws_api_gateway_integration_response.job_status_options_integration_response,
    aws_api_gateway_method.alerts_get,
    aws_api_gateway_integration.alerts_get_integration,
    aws_api_gateway_method.alerts_post,
    aws_api_gateway_integration.alerts_integration,
    aws_api_gateway_method.alerts_delete,
    aws_api_gateway_integration.alerts_delete_integration,
    aws_api_gateway_method.alerts_options,
    aws_api_gateway_integration.alerts_options_integration,
    aws_api_gateway_method_response.alerts_options_200,
    aws_api_gateway_integration_response.alerts_options_integration_response,
    aws_api_gateway_method.alerts_id_options,
    aws_api_gateway_integration.alerts_id_options_integration,
    aws_api_gateway_method_response.alerts_id_options_200,
    aws_api_gateway_integration_response.alerts_id_options_integration_response,
    aws_api_gateway_method.login_post,
    aws_api_gateway_integration.login_integration,
    aws_api_gateway_method.login_options,
    aws_api_gateway_integration.login_options_integration,
    aws_api_gateway_method_response.login_options_200,
    aws_api_gateway_integration_response.login_options_integration_response,
    aws_api_gateway_method.register_post,
    aws_api_gateway_integration.register_integration,
    aws_api_gateway_method.register_options,
    aws_api_gateway_integration.register_options_integration,
    aws_api_gateway_method_response.register_options_200,
    aws_api_gateway_integration_response.register_options_integration_response,
    aws_api_gateway_method.latest_get,
    aws_api_gateway_integration.latest_integration,
    aws_api_gateway_method.latest_options,
    aws_api_gateway_integration.latest_options_integration,
    aws_api_gateway_method_response.latest_options_200,
    aws_api_gateway_integration_response.latest_options_integration_response,
    aws_api_gateway_method.account_names_post,
    aws_api_gateway_integration.account_names_integration,
    aws_api_gateway_method.account_names_options,
    aws_api_gateway_integration.account_names_options_integration,
    aws_api_gateway_method_response.account_names_options_200,
    aws_api_gateway_integration_response.account_names_options_integration_response,
    aws_api_gateway_method.refresh_post,
    aws_api_gateway_integration.refresh_integration,
    aws_api_gateway_method.refresh_options,
    aws_api_gateway_integration.refresh_options_integration,
    aws_api_gateway_method_response.refresh_options_200,
    aws_api_gateway_integration_response.refresh_options_integration_response,
    aws_api_gateway_method.logout_post,
    aws_api_gateway_integration.logout_integration,
    aws_api_gateway_method.logout_options,
    aws_api_gateway_integration.logout_options_integration,
    aws_api_gateway_method_response.logout_options_200,
    aws_api_gateway_integration_response.logout_options_integration_response,
    # Driver notification endpoints
    aws_api_gateway_method.driver_maps_search_get,
    aws_api_gateway_integration.driver_maps_search_integration,
    aws_api_gateway_method.driver_maps_search_options,
    aws_api_gateway_integration.driver_maps_search_options_integration,
    aws_api_gateway_method_response.driver_maps_search_options_200,
    aws_api_gateway_integration_response.driver_maps_search_options_integration_response,
    aws_api_gateway_method.driver_notifications_get,
    aws_api_gateway_integration.driver_notifications_get_integration,
    aws_api_gateway_method.driver_notifications_post,
    aws_api_gateway_integration.driver_notifications_post_integration,
    aws_api_gateway_method.driver_notifications_delete,
    aws_api_gateway_integration.driver_notifications_delete_integration,
    aws_api_gateway_method.driver_notifications_options,
    aws_api_gateway_integration.driver_notifications_options_integration,
    aws_api_gateway_method_response.driver_notifications_options_200,
    aws_api_gateway_integration_response.driver_notifications_options_integration_response,
    aws_api_gateway_method.driver_notifications_id_options,
    aws_api_gateway_integration.driver_notifications_id_options_integration,
    aws_api_gateway_method_response.driver_notifications_id_options_200,
    aws_api_gateway_integration_response.driver_notifications_id_options_integration_response,
    # TM Username verification endpoints
    aws_api_gateway_method.user_tm_username_get,
    aws_api_gateway_integration.user_tm_username_get_integration,
    aws_api_gateway_method.user_tm_username_post,
    aws_api_gateway_integration.user_tm_username_post_integration,
    aws_api_gateway_method.user_tm_username_options,
    aws_api_gateway_integration.user_tm_username_options_integration,
    aws_api_gateway_method_response.user_tm_username_options_200,
    aws_api_gateway_integration_response.user_tm_username_options_integration_response,
    # Admin configuration endpoints
    aws_api_gateway_method.admin_config_get,
    aws_api_gateway_integration.admin_config_get_integration,
    aws_api_gateway_method.admin_config_put,
    aws_api_gateway_integration.admin_config_put_integration,
    # Admin users endpoints
    aws_api_gateway_method.admin_users_get,
    aws_api_gateway_integration.admin_users_get_integration,
    aws_api_gateway_method.admin_users_alert_type_put,
    aws_api_gateway_integration.admin_users_alert_type_put_integration,
    # Notification history endpoints
    aws_api_gateway_method.notification_history_get,
    aws_api_gateway_integration.notification_history_get_integration,
    # Admin daily overview endpoints
    aws_api_gateway_method.admin_daily_overview_get,
    aws_api_gateway_integration.admin_daily_overview_get_integration,
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id
  
  # Force new deployment to pick up driver notification and admin config endpoints
  triggers = {
    redeployment = sha1(jsonencode([
      "admin-config-endpoints-2025-01-11",
      "lambda-lifecycle-fix-${timestamp()}",
      aws_api_gateway_method.maps_options.id,
      aws_api_gateway_integration.maps_options_integration.id,
      aws_api_gateway_method_response.maps_options_200.id,
      aws_api_gateway_integration_response.maps_options_integration_response.id,
      aws_api_gateway_method.job_status_get.id,
      aws_api_gateway_integration.job_status_integration.id,
      aws_api_gateway_method.job_status_options.id,
      aws_api_gateway_integration.job_status_options_integration.id,
      aws_api_gateway_method_response.job_status_options_200.id,
      aws_api_gateway_integration_response.job_status_options_integration_response.id,
      aws_api_gateway_method.search_options.id,
      aws_api_gateway_integration.search_options_integration.id,
      aws_api_gateway_method_response.search_options_200.id,
      aws_api_gateway_integration_response.search_options_integration_response.id,
      aws_api_gateway_method.latest_options.id,
      aws_api_gateway_integration.latest_options_integration.id,
      aws_api_gateway_method_response.latest_options_200.id,
      aws_api_gateway_integration_response.latest_options_integration_response.id,
      aws_api_gateway_method.alerts_get.id,
      aws_api_gateway_integration.alerts_get_integration.id,
      aws_api_gateway_method.alerts_delete.id,
      aws_api_gateway_integration.alerts_delete_integration.id,
      aws_api_gateway_method.alerts_options.id,
      aws_api_gateway_integration.alerts_options_integration.id,
      aws_api_gateway_method_response.alerts_options_200.id,
      aws_api_gateway_integration_response.alerts_options_integration_response.id,
      aws_api_gateway_method.alerts_id_options.id,
      aws_api_gateway_integration.alerts_id_options_integration.id,
      aws_api_gateway_method_response.alerts_id_options_200.id,
      aws_api_gateway_integration_response.alerts_id_options_integration_response.id,
      aws_api_gateway_method.login_options.id,
      aws_api_gateway_integration.login_options_integration.id,
      aws_api_gateway_method_response.login_options_200.id,
      aws_api_gateway_integration_response.login_options_integration_response.id,
      aws_api_gateway_method.register_options.id,
      aws_api_gateway_integration.register_options_integration.id,
      aws_api_gateway_method_response.register_options_200.id,
      aws_api_gateway_integration_response.register_options_integration_response.id,
      aws_api_gateway_method.account_names_options.id,
      aws_api_gateway_integration.account_names_options_integration.id,
      aws_api_gateway_method_response.account_names_options_200.id,
      aws_api_gateway_integration_response.account_names_options_integration_response.id,
      aws_api_gateway_method.refresh_post.id,
      aws_api_gateway_integration.refresh_integration.id,
      aws_api_gateway_method.refresh_options.id,
      aws_api_gateway_integration.refresh_options_integration.id,
      aws_api_gateway_method_response.refresh_options_200.id,
      aws_api_gateway_integration_response.refresh_options_integration_response.id,
      aws_api_gateway_method.logout_post.id,
      aws_api_gateway_integration.logout_integration.id,
      aws_api_gateway_method.logout_options.id,
      aws_api_gateway_integration.logout_options_integration.id,
      aws_api_gateway_method_response.logout_options_200.id,
      aws_api_gateway_integration_response.logout_options_integration_response.id,
      # Driver notification endpoints
      aws_api_gateway_method.driver_maps_search_get.id,
      aws_api_gateway_integration.driver_maps_search_integration.id,
      aws_api_gateway_method.driver_maps_search_options.id,
      aws_api_gateway_integration.driver_maps_search_options_integration.id,
      aws_api_gateway_method_response.driver_maps_search_options_200.id,
      aws_api_gateway_integration_response.driver_maps_search_options_integration_response.id,
      aws_api_gateway_method.driver_notifications_get.id,
      aws_api_gateway_integration.driver_notifications_get_integration.id,
      aws_api_gateway_method.driver_notifications_post.id,
      aws_api_gateway_integration.driver_notifications_post_integration.id,
      aws_api_gateway_method.driver_notifications_delete.id,
      aws_api_gateway_integration.driver_notifications_delete_integration.id,
      aws_api_gateway_method.driver_notifications_options.id,
      aws_api_gateway_integration.driver_notifications_options_integration.id,
      aws_api_gateway_method_response.driver_notifications_options_200.id,
      aws_api_gateway_integration_response.driver_notifications_options_integration_response.id,
      aws_api_gateway_method.driver_notifications_id_options.id,
      aws_api_gateway_integration.driver_notifications_id_options_integration.id,
      aws_api_gateway_method_response.driver_notifications_id_options_200.id,
      aws_api_gateway_integration_response.driver_notifications_id_options_integration_response.id,
      # TM Username verification endpoints
      aws_api_gateway_method.user_tm_username_get.id,
      aws_api_gateway_integration.user_tm_username_get_integration.id,
      aws_api_gateway_method.user_tm_username_post.id,
      aws_api_gateway_integration.user_tm_username_post_integration.id,
      aws_api_gateway_method.user_tm_username_options.id,
      aws_api_gateway_integration.user_tm_username_options_integration.id,
      aws_api_gateway_method_response.user_tm_username_options_200.id,
      aws_api_gateway_integration_response.user_tm_username_options_integration_response.id,
      # Admin configuration endpoints
      aws_api_gateway_method.admin_config_get.id,
      aws_api_gateway_integration.admin_config_get_integration.id,
      aws_api_gateway_method.admin_config_put.id,
      aws_api_gateway_integration.admin_config_put_integration.id,
      # Admin users endpoints
      aws_api_gateway_method.admin_users_get.id,
      aws_api_gateway_integration.admin_users_get_integration.id,
      aws_api_gateway_method.admin_users_alert_type_put.id,
      aws_api_gateway_integration.admin_users_alert_type_put_integration.id,
      # Notification history endpoints
      aws_api_gateway_method.notification_history_get.id,
      aws_api_gateway_integration.notification_history_get_integration.id,
      # Admin daily overview endpoints
      aws_api_gateway_method.admin_daily_overview_get.id,
      aws_api_gateway_integration.admin_daily_overview_get_integration.id,
      aws_api_gateway_method.test_get.id,
      aws_api_gateway_integration.test_get_integration.id,
      aws_api_gateway_method.test_post.id,
      aws_api_gateway_integration.test_post_integration.id,
      aws_api_gateway_method.test_options.id,
      aws_api_gateway_integration.test_options_integration.id,
      aws_api_gateway_method_response.test_options_200.id,
      aws_api_gateway_integration_response.test_options_integration_response.id,
      aws_api_gateway_method.test_advanced_get.id,
      aws_api_gateway_integration.test_advanced_get_integration.id,
      aws_api_gateway_method.test_advanced_post.id,
      aws_api_gateway_integration.test_advanced_post_integration.id,
      aws_api_gateway_method.test_advanced_options.id,
      aws_api_gateway_integration.test_advanced_options_integration.id,
      aws_api_gateway_method_response.test_advanced_options_200.id,
      aws_api_gateway_integration_response.test_advanced_options_integration_response.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "api_stage" {
  deployment_id = aws_api_gateway_deployment.api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = var.environment
}

