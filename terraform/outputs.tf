# outputs.tf
output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "s3_website_url" {
  value = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "api_gateway_url" {
  value = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
}

output "lambda_functions" {
  value = {
    user_search           = aws_lambda_function.user_search.function_name
    mapSearch             = aws_lambda_function.mapSearch.function_name
    mapSearchBackground   = aws_lambda_function.mapSearchBackground.function_name
    checkJobStatus        = aws_lambda_function.checkJobStatus.function_name
    create_alert          = aws_lambda_function.create_alert.function_name
    login                 = aws_lambda_function.login.function_name
    register              = aws_lambda_function.register.function_name
    get_map_records       = aws_lambda_function.get_map_records.function_name
    account_names         = aws_lambda_function.account_names.function_name
    scheduler             = aws_lambda_function.scheduler.function_name
    health                = aws_lambda_function.health.function_name
  }
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.auth_tokens.name
}

output "map_search_results_table_name" {
  value = aws_dynamodb_table.map_search_results.name
  description = "DynamoDB table name for map search results"
}

output "parameter_store_parameters" {
  value = {
    auth_api_url = data.aws_ssm_parameter.auth_api_url.name
    lead_api     = data.aws_ssm_parameter.lead_api.name
    account_api  = data.aws_ssm_parameter.account_api.name
    jwt_secret   = data.aws_ssm_parameter.jwt_secret.name
    email_user   = data.aws_ssm_parameter.email_user.name
    neon_db_connection_string = data.aws_ssm_parameter.neon_db_connection_string.name
    error_email = data.aws_ssm_parameter.error_email.name
  }
  description = "Parameter Store parameter names being used by Lambda functions"
}

output "ses_configuration" {
  value = {
    from_email = aws_ses_email_identity.from_email.email
    configuration_set_name = aws_ses_configuration_set.main.name
    verified_email = aws_ses_email_identity.from_email.email
  }
  description = "SES configuration details"
  sensitive = true
}

output "eventbridge_rule_name" {
  value = aws_cloudwatch_event_rule.scheduler_rule.name
  description = "EventBridge rule name for scheduler"
}

output "sns_topic_arn" {
  value = aws_sns_topic.error_notifications.arn
  description = "SNS topic ARN for error notifications"
}

output "cloudwatch_dashboard_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.lambda_monitoring.dashboard_name}"
  description = "CloudWatch dashboard URL for Lambda monitoring"
}