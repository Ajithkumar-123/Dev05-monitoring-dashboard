resource "aws_kms_key" "tenant" {
  description              = "docuploader: customer-managed key for per-tenant aliases (A27 single-bucket model)"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  enable_key_rotation      = true
  rotation_period_in_days  = var.kms_key_rotation_days
  deletion_window_in_days  = 30

  tags = {
    Name        = "docuploader-tenant-key"
    Component   = "platform-data"
    Environment = var.environment
  }
}

resource "aws_kms_key" "audit_archive" {
  description              = "docuploader: separate operator-managed CMK for the audit-archive bucket"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  enable_key_rotation      = true
  rotation_period_in_days  = var.kms_key_rotation_days
  deletion_window_in_days  = 30

  tags = {
    Name        = "docuploader-audit-archive-key"
    Component   = "platform-data"
    Environment = var.environment
  }
}
