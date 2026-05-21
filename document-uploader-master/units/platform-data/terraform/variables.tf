variable "aws_region" {
  type        = string
  description = "Single MVP region; binding eu-west-1 per tech-environment.md"
  default     = "eu-west-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment label; sandbox only at MVP"
  default     = "sandbox"
}

variable "input_retention_days_default" {
  type        = number
  description = "Default workspace.retentionPolicy.inputRetentionDays for the staging-bucket lifecycle rule"
  default     = 7
}

variable "audit_archive_retention_years" {
  type        = number
  description = "S3 Object Lock Compliance retention for the audit-archive bucket"
  default     = 7
}

variable "kms_key_rotation_days" {
  type        = number
  description = "Customer-managed KMS key rotation cadence; 6-month default per tech-environment.md"
  default     = 180
}
