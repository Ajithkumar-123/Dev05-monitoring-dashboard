variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type    = string
  default = "sandbox"
}

variable "api_hostname" {
  type        = string
  description = "Public API hostname (FQDN) for the WunderGraph router ALB"
  default     = "docuploader-api.sandbox.opus2.internal"
}

variable "route53_zone_name" {
  type        = string
  description = "Route53 zone for ACM DNS validation (sandbox-managed)"
  default     = "sandbox.opus2.internal."
}

variable "tfstate_bucket" {
  type    = string
  default = "docuploader-tfstate"
}

variable "platform_data_remote_state_key" {
  type    = string
  default = "platform-data/terraform.tfstate"
}

variable "platform_iam_remote_state_key" {
  type    = string
  default = "platform-iam-and-security/terraform.tfstate"
}
