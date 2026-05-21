#!/usr/bin/env bash
# Build a single unit's container image locally. Does NOT push.
#
# Usage:
#   ./scripts/build-image.sh <unit-name> [tag]
#
# Examples:
#   ./scripts/build-image.sh workspace-resolver
#   ./scripts/build-image.sh classification-service v0.1.0
set -euo pipefail

UNIT="${1:?usage: $0 <unit-name> [tag]}"
TAG="${2:-$(git rev-parse --short=8 HEAD 2>/dev/null || echo dev)}"
REGISTRY="${ECR_REGISTRY:-537462380503.dkr.ecr.eu-west-1.amazonaws.com}"

declare -A ARCHETYPE=(
  [workspace-resolver]=go-service
  [batch-resolver]=go-service
  [document-resolver]=go-service
  [wundergraph-router]=go-service
  [email-extraction-service]=go-service
  [virus-scanning-service]=go-service
  [pre-token-generation-lambda]=go-lambda
  [document-event-handler-lambda]=go-lambda
  [audit-event-storage-lambda]=go-lambda
  [update-document-state-lambda]=go-lambda
  [classification-service]=ts-service
  [ocr-service]=ts-service
  [zip-extraction-service]=ts-service
  [output-assembly-service]=ts-service
  [slipsheet-service]=ts-service
  [html-conversion-typescript-sidecar]=ts-service
  [tiff-cog-service]=ts-service
  [image-tiff-conversion-service]=ts-service
  [media-conversion-service]=ts-service
  [react-web-module]=ts-web
  [pdf-processing-service]=python-service
  [office-conversion-orchestrator-sidecar]=python-service
  [office-conversion-aspose-container]=cpp-aspose
)

ARCH="${ARCHETYPE[$UNIT]:-}"
if [[ -z "$ARCH" ]]; then
  echo "error: no archetype mapping for unit '$UNIT'" >&2
  echo "known units:" >&2
  printf '  %s\n' "${!ARCHETYPE[@]}" | sort >&2
  exit 2
fi

DOCKERFILE="deploy/dockerfiles/${ARCH}.Dockerfile"
IMAGE="${REGISTRY}/docuploader/${UNIT}:${TAG}"

echo ">>> Building $IMAGE"
echo ">>> Using   $DOCKERFILE"
echo ">>> Context $(pwd)"
docker build \
  --platform linux/amd64 \
  --file "$DOCKERFILE" \
  --build-arg "UNIT_NAME=$UNIT" \
  --tag "$IMAGE" \
  --tag "${REGISTRY}/docuploader/${UNIT}:latest" \
  .

echo ">>> Built: $IMAGE"
