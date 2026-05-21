locals {
  ecr_repositories = [
    # API tier
    "docuploader/wundergraph-router",
    "docuploader/workspace-resolver",
    "docuploader/batch-resolver",
    "docuploader/document-resolver",
    "docuploader/pre-token-generation-lambda",
    "docuploader/document-event-handler-lambda",
    "docuploader/audit-event-storage-lambda",
    "docuploader/update-document-state-lambda",

    # Pipeline tier
    "docuploader/classification-service",
    "docuploader/ocr-service",
    "docuploader/zip-extraction-service",
    "docuploader/output-assembly-service",
    "docuploader/slipsheet-service",
    "docuploader/pdf-processing-service",
    "docuploader/office-conversion-aspose-container",
    "docuploader/office-conversion-orchestrator-sidecar",
    "docuploader/html-conversion-gotenberg-mirror",
    "docuploader/html-conversion-typescript-sidecar",
    "docuploader/tiff-cog-service",
    "docuploader/image-tiff-conversion-service",
    "docuploader/email-extraction-service",
    "docuploader/media-conversion-service",

    # Web bundler (build-time image)
    "docuploader/react-web-module-bundler",
  ]
}

resource "aws_ecr_repository" "all" {
  for_each = toset(local.ecr_repositories)

  name                 = each.value
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = local.tenant_kms_arn
  }

  tags = merge(local.common_tags, { Name = each.value })
}

resource "aws_ecr_lifecycle_policy" "all" {
  for_each   = aws_ecr_repository.all
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Retain only the 50 most-recent tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPatternList = ["*"]
          countType     = "imageCountMoreThan"
          countNumber   = 50
        }
        action = { type = "expire" }
      },
    ]
  })
}
