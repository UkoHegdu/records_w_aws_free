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

data "aws_ssm_parameter" "email_user" {
  name = "/${var.environment}/EMAIL_USER"
}

data "aws_ssm_parameter" "email_pass" {
  name = "/${var.environment}/EMAIL_PASS"
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
data "aws_ssm_parameter" "neon_db_user" {
  name = "/${var.environment}/NEON_DB_USER"
}

data "aws_ssm_parameter" "neon_db_pw" {
  name = "/${var.environment}/NEON_DB_PW"
}

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
  
  # Note: You'll need to confirm this subscription via email
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

resource "aws_iam_role_policy_attachment" "lambda_policy" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
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
          "${aws_dynamodb_table.map_search_results.arn}/index/*"
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
  timeout         = 600  # 10 minutes - Trackmania API rate limits prevent faster processing
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name
      MAP_SEARCH_BACKGROUND_FUNCTION_NAME = aws_lambda_function.mapSearchBackground.function_name
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
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      MAP_SEARCH_RESULTS_TABLE_NAME = aws_dynamodb_table.map_search_results.name
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
  timeout         = 300  # 5 minutes for database operations
  source_code_hash = filebase64sha256("lambda_functions.zip")

  environment {
    variables = {
      NEON_DB_CONNECTION_STRING = data.aws_ssm_parameter.neon_db_connection_string.value
      EMAIL_USER = data.aws_ssm_parameter.email_user.value
      EMAIL_PASS = data.aws_ssm_parameter.email_pass.value
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

# EventBridge rule for daily scheduler trigger at 5 AM CET (4 AM UTC)
resource "aws_cloudwatch_event_rule" "scheduler_rule" {
  name                = "${var.app_name}-scheduler-rule"
  description         = "Trigger scheduler Lambda daily at 5 AM CET"
  schedule_expression = "cron(0 4 * * ? *)"  # 4 AM UTC = 5 AM CET (winter) / 6 AM CEST (summer)
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
    aws_api_gateway_method.create_alert_post,
    aws_api_gateway_integration.create_alert_integration,
    aws_api_gateway_method.create_alert_options,
    aws_api_gateway_integration.create_alert_options_integration,
    aws_api_gateway_method_response.create_alert_options_200,
    aws_api_gateway_integration_response.create_alert_options_integration_response,
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
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id
  
  # Force new deployment to pick up OPTIONS method and job status endpoint
  triggers = {
    redeployment = sha1(jsonencode([
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
      aws_api_gateway_method.create_alert_options.id,
      aws_api_gateway_integration.create_alert_options_integration.id,
      aws_api_gateway_method_response.create_alert_options_200.id,
      aws_api_gateway_integration_response.create_alert_options_integration_response.id,
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

