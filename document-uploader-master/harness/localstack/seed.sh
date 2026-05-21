#!/usr/bin/env bash
# Bootstrap the 7 DynamoDB tables LIB-04 expects, plus 4 S3 buckets,
# 2 KMS keys, and 3 Secrets Manager entries — all in LocalStack.
#
# Pre-req: LocalStack is up at http://localhost:4566 (`make localstack-up`).
#
# Usage: ./seed.sh [--reset]
#   --reset  Delete all docuploader-* resources first (clean slate).

set -euo pipefail

ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-eu-west-1}"

# LocalStack accepts any credentials; set fake ones so the SDK is happy.
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION="$REGION"

aws_cmd() {
  aws --endpoint-url="$ENDPOINT" --region="$REGION" "$@"
}

wait_for_ready() {
  echo "Waiting for LocalStack at $ENDPOINT ..."
  for _ in $(seq 1 30); do
    if curl -fsS "$ENDPOINT/_localstack/health" >/dev/null 2>&1; then
      echo "  ready."
      return 0
    fi
    sleep 1
  done
  echo "  FAIL: LocalStack did not become ready in 30s" >&2
  exit 1
}

create_ddb_table() {
  local name="$1"; shift
  local pk_attr="$1"; shift
  local pk_type="${1:-S}"; shift || true

  if aws_cmd dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    echo "  DDB: $name already exists"
  else
    echo "  DDB: creating $name"
    aws_cmd dynamodb create-table \
      --table-name "$name" \
      --attribute-definitions "AttributeName=$pk_attr,AttributeType=$pk_type" \
      --key-schema "AttributeName=$pk_attr,KeyType=HASH" \
      --billing-mode PAY_PER_REQUEST \
      --output text >/dev/null
  fi
}

create_ddb_table_with_gsi() {
  local name="$1"; local pk="$2"; local gsi_name="$3"; local gsi_pk="$4"
  if aws_cmd dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    echo "  DDB: $name already exists"
  else
    echo "  DDB: creating $name (with GSI $gsi_name)"
    aws_cmd dynamodb create-table \
      --table-name "$name" \
      --attribute-definitions \
        "AttributeName=$pk,AttributeType=S" \
        "AttributeName=$gsi_pk,AttributeType=S" \
      --key-schema "AttributeName=$pk,KeyType=HASH" \
      --global-secondary-indexes "IndexName=$gsi_name,KeySchema=[{AttributeName=$gsi_pk,KeyType=HASH}],Projection={ProjectionType=ALL}" \
      --billing-mode PAY_PER_REQUEST \
      --output text >/dev/null
  fi
}

create_s3_bucket() {
  local name="$1"
  if aws_cmd s3api head-bucket --bucket "$name" >/dev/null 2>&1; then
    echo "  S3: $name already exists"
  else
    echo "  S3: creating $name"
    aws_cmd s3api create-bucket --bucket "$name" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
}

create_kms_alias() {
  local alias="$1"
  if aws_cmd kms describe-key --key-id "alias/$alias" >/dev/null 2>&1; then
    echo "  KMS: alias/$alias already exists"
  else
    echo "  KMS: creating alias/$alias"
    local key_id
    key_id=$(aws_cmd kms create-key --description "$alias (LocalStack)" --output text --query 'KeyMetadata.KeyId')
    aws_cmd kms create-alias --alias-name "alias/$alias" --target-key-id "$key_id" >/dev/null
  fi
}

create_secret() {
  local name="$1"; local value="${2:-placeholder}"
  if aws_cmd secretsmanager describe-secret --secret-id "$name" >/dev/null 2>&1; then
    echo "  SECRET: $name already exists"
  else
    echo "  SECRET: creating $name"
    aws_cmd secretsmanager create-secret --name "$name" --secret-string "$value" >/dev/null
  fi
}

# ─────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
  echo "=== Resetting docuploader-* resources in LocalStack ==="
  for t in docuploader-api-workspaces docuploader-api-batches docuploader-api-documents \
           docuploader-api-audit-events docuploader-content-hashes \
           docuploader-pipeline-files textract-task-tokens; do
    aws_cmd dynamodb delete-table --table-name "$t" 2>/dev/null && echo "  DDB: deleted $t" || true
  done
  for b in docuploader-api-staging docuploader-pipeline docuploader-pipeline-config docuploader-api-audit-archive; do
    aws_cmd s3 rb "s3://$b" --force 2>/dev/null && echo "  S3: deleted $b" || true
  done
fi

wait_for_ready

echo ""
echo "=== Creating 7 DynamoDB tables ==="
create_ddb_table "docuploader-api-workspaces" "workspaceId"
create_ddb_table "docuploader-api-batches"    "batchId"
create_ddb_table_with_gsi "docuploader-api-documents" "documentId" "idempotency-index" "idempotencyKey"
create_ddb_table "docuploader-api-audit-events" "eventId"
create_ddb_table "docuploader-content-hashes"   "hashSha256"
create_ddb_table_with_gsi "docuploader-pipeline-files" "fileId" "folderPath-index" "folderPath"
create_ddb_table "textract-task-tokens"         "taskToken"

echo ""
echo "=== Creating 4 S3 buckets ==="
create_s3_bucket "docuploader-api-staging"
create_s3_bucket "docuploader-pipeline"
create_s3_bucket "docuploader-pipeline-config"
create_s3_bucket "docuploader-api-audit-archive"

echo ""
echo "=== Creating 2 KMS aliases ==="
create_kms_alias "docuploader-tenant-master"
create_kms_alias "docuploader-audit-archive"

echo ""
echo "=== Creating 3 Secrets Manager entries ==="
create_secret "docuploader/aspose-licence"        "LOCALSTACK_PLACEHOLDER_NOT_A_REAL_LICENSE"
create_secret "docuploader/audit-archive-cmk-arn" "arn:aws:kms:eu-west-1:000000000000:alias/docuploader-audit-archive"
create_secret "docuploader/graphql-internal-auth" "$(head -c 32 /dev/urandom | base64)"

echo ""
echo "=== Bootstrap complete ==="
echo "LocalStack endpoint: $ENDPOINT"
echo "Region:              $REGION"
echo ""
echo "Try: cd harness/local-test-rig && go run ."
