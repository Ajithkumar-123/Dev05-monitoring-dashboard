output "api_acm_certificate_arn" {
  value = aws_acm_certificate_validation.api.certificate_arn
}

output "api_hostname" {
  value = var.api_hostname
}

output "ecr_repository_urls" {
  value = { for k, v in aws_ecr_repository.all : k => v.repository_url }
}
