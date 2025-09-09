# variables.tf
variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "recordsw-app"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

