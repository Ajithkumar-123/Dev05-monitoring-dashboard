resource "aws_guardduty_detector" "main" {
  enable = true

  datasources {
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = false
        }
      }
    }
  }

  tags = merge(local.common_tags, { Name = "docuploader-guardduty-detector" })
}

resource "aws_guardduty_malware_protection_plan" "staging" {
  role = aws_iam_role.guardduty_malware_protection.arn

  protected_resource {
    s3_bucket {
      bucket_name = local.s3_bucket_names.staging
    }
  }

  actions {
    tagging {
      status = "ENABLED"
    }
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "guardduty_malware_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["malware-protection-plan.guardduty.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

data "aws_iam_policy_document" "guardduty_malware_permissions" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectTagging",
      "s3:PutObjectTagging", "s3:ListBucket",
    ]
    resources = [
      local.staging_bucket_arn,
      "${local.staging_bucket_arn}/*",
    ]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [local.tenant_kms_arn]
  }
}

resource "aws_iam_role" "guardduty_malware_protection" {
  name               = "docuploader-guardduty-malware-protection"
  assume_role_policy = data.aws_iam_policy_document.guardduty_malware_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "guardduty_malware_protection" {
  name   = "permissions"
  role   = aws_iam_role.guardduty_malware_protection.id
  policy = data.aws_iam_policy_document.guardduty_malware_permissions.json
}
