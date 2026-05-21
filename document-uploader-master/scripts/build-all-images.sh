#!/usr/bin/env bash
# Build every unit's container image locally. Does NOT push.
# Logs to logs/build-<unit>.log per unit; exits non-zero if any build fails.
set -euo pipefail

TAG="${1:-$(git rev-parse --short=8 HEAD 2>/dev/null || echo dev)}"
mkdir -p logs

UNITS=(
  workspace-resolver batch-resolver document-resolver wundergraph-router
  email-extraction-service virus-scanning-service
  pre-token-generation-lambda document-event-handler-lambda
  audit-event-storage-lambda update-document-state-lambda
  classification-service ocr-service zip-extraction-service output-assembly-service
  slipsheet-service html-conversion-typescript-sidecar tiff-cog-service
  image-tiff-conversion-service media-conversion-service react-web-module
  pdf-processing-service office-conversion-orchestrator-sidecar
  office-conversion-aspose-container
)

PASS=()
FAIL=()
for u in "${UNITS[@]}"; do
  if ./scripts/build-image.sh "$u" "$TAG" > "logs/build-${u}.log" 2>&1; then
    echo "PASS $u"
    PASS+=("$u")
  else
    echo "FAIL $u   (see logs/build-${u}.log)"
    FAIL+=("$u")
  fi
done

echo
echo "=== Summary ==="
echo "PASS: ${#PASS[@]} / ${#UNITS[@]}"
echo "FAIL: ${#FAIL[@]}"
[[ ${#FAIL[@]} -gt 0 ]] && exit 1 || exit 0
