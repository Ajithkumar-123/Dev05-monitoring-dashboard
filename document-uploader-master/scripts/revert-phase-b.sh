#!/usr/bin/env bash
# Deletes the 21 docuploader/* ECR repos created by Phase B.
# --force removes any images in the repo in the same call.
#
# Usage:
#   ./scripts/revert-phase-b.sh --dry-run   # show what would be deleted
#   ./scripts/revert-phase-b.sh --yes       # actually delete
#
# Idempotent: missing repos are silently skipped.

set -euo pipefail

REGION="${AWS_REGION:-eu-west-1}"

REPOS=(
  # 9 TS services
  docuploader/classification-service
  docuploader/ocr-service
  docuploader/zip-extraction-service
  docuploader/output-assembly-service
  docuploader/slipsheet-service
  docuploader/html-conversion-typescript-sidecar
  docuploader/tiff-cog-service
  docuploader/image-tiff-conversion-service
  docuploader/media-conversion-service
  # 1 TS web
  docuploader/react-web-module
  # 2 Python services
  docuploader/pdf-processing-service
  docuploader/office-conversion-orchestrator-sidecar
  # 5 Go services
  docuploader/workspace-resolver
  docuploader/batch-resolver
  docuploader/document-resolver
  docuploader/wundergraph-router
  docuploader/email-extraction-service
  # 4 Go lambdas
  docuploader/pre-token-generation-lambda
  docuploader/document-event-handler-lambda
  docuploader/audit-event-storage-lambda
  docuploader/update-document-state-lambda
)
# NOTE: docuploader/office-conversion-aspose-container is NOT in this list because the image
# never built (vendor Conan remote + Aspose.Total license required). Add it back if the
# Aspose Dockerfile is fixed and that repo is created.

case "${1:-}" in
  --dry-run)
    echo "[dry-run] would delete ${#REPOS[@]} repos in region $REGION:"
    printf '  - %s\n' "${REPOS[@]}"
    exit 0
    ;;
  --yes)
    ;;
  *)
    echo "usage: $0 --dry-run | --yes" >&2
    exit 2
    ;;
esac

echo "Deleting ${#REPOS[@]} ECR repos in $REGION ..."
for repo in "${REPOS[@]}"; do
  if aws ecr describe-repositories --region "$REGION" --repository-names "$repo" >/dev/null 2>&1; then
    echo "  deleting $repo"
    aws ecr delete-repository --region "$REGION" --repository-name "$repo" --force >/dev/null
  else
    echo "  skip $repo (not present)"
  fi
done

echo "done."
