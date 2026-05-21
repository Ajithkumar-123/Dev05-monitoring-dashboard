#!/usr/bin/env bash
# Phased deploy of docuploader to dev05. Each phase has a confirmation prompt
# (suppress with --yes). Use --dry-run to preview every action without
# executing.
#
# Usage:
#   ./scripts/deploy-dev05.sh --phase A --dry-run
#   ./scripts/deploy-dev05.sh --phase A          # Terraform apply
#   ./scripts/deploy-dev05.sh --phase B          # Build + push 22 images
#   ./scripts/deploy-dev05.sh --phase C          # Transplant gitops manifests
#   ./scripts/deploy-dev05.sh --phase E          # ArgoCD sync (creates workloads)
#   ./scripts/deploy-dev05.sh --all              # A→E with confirmations
set -euo pipefail

PHASE=""
DRY_RUN="false"
YES="false"
AWS_PROFILE_NAME="${AWS_PROFILE:-opus2-dev}"
TF_BACKEND_BUCKET="${TF_BACKEND_BUCKET:-docuploader-tf-state-dev05}"

usage() {
  cat <<EOF
deploy-dev05.sh — phased deploy

  --phase A|B|C|E    Run a single phase
  --all              Run phases A through E sequentially
  --dry-run          Print what would happen; do not execute
  --yes              Skip confirmation prompts (CI use)
  -h | --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    --all) PHASE="all"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --yes) YES="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -z "$PHASE" ]] && { usage >&2; exit 2; }

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] $*"
  else
    echo "$ $*"
    eval "$@"
  fi
}

confirm() {
  [[ "$YES" == "true" || "$DRY_RUN" == "true" ]] && return 0
  read -r -p "Proceed with $1? [yes/NO] " ans
  [[ "$ans" == "yes" ]]
}

phase_a() {
  echo "==> Phase A: Terraform apply (4 platform units)"
  confirm "Phase A (creates AWS resources, ongoing cost)" || { echo "aborted"; return 1; }
  for unit in platform-data platform-iam-and-security platform-network-and-compute platform-orchestration; do
    echo "--- $unit ---"
    run "AWS_PROFILE=$AWS_PROFILE_NAME terraform -chdir=units/$unit/terraform init -input=false"
    run "AWS_PROFILE=$AWS_PROFILE_NAME terraform -chdir=units/$unit/terraform apply -input=false -auto-approve -var environment=dev05"
  done
}

phase_b() {
  echo "==> Phase B: Build + push 22 images to ECR"
  confirm "Phase B (push to ECR)" || { echo "aborted"; return 1; }
  run "AWS_PROFILE=$AWS_PROFILE_NAME aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin 537462380503.dkr.ecr.eu-west-1.amazonaws.com"
  TAG="${IMAGE_TAG:-$(git rev-parse --short=8 HEAD)}"
  run "./scripts/build-all-images.sh $TAG"
  # Push pushed by build-and-push.yml CI normally; manual push below for one-off.
  for u in workspace-resolver batch-resolver document-resolver wundergraph-router \
           email-extraction-service virus-scanning-service \
           pre-token-generation-lambda document-event-handler-lambda \
           audit-event-storage-lambda update-document-state-lambda \
           classification-service ocr-service zip-extraction-service \
           output-assembly-service slipsheet-service html-conversion-typescript-sidecar \
           tiff-cog-service image-tiff-conversion-service media-conversion-service \
           react-web-module pdf-processing-service \
           office-conversion-orchestrator-sidecar office-conversion-aspose-container; do
    run "docker push 537462380503.dkr.ecr.eu-west-1.amazonaws.com/docuploader/$u:$TAG"
    run "docker push 537462380503.dkr.ecr.eu-west-1.amazonaws.com/docuploader/$u:latest"
  done
}

phase_c() {
  echo "==> Phase C: Transplant manifests to argocd-gitops repo"
  confirm "Phase C (commit + push to argocd-gitops-development)" || { echo "aborted"; return 1; }
  GITOPS_PATH="${GITOPS_PATH:-../argocd-gitops-development-main}"
  TARGET="$GITOPS_PATH/platform-deployments/environments/dev05/docuploader-dev05"
  run "mkdir -p $TARGET"
  run "cp -r deploy/argocd-dev05/. $TARGET/"
  run "git -C $GITOPS_PATH add platform-deployments/environments/dev05/docuploader-dev05"
  run "git -C $GITOPS_PATH commit -m 'Add docuploader-dev05 tenant'"
  run "git -C $GITOPS_PATH push origin HEAD"
}

phase_e() {
  echo "==> Phase E: Trigger ArgoCD sync"
  confirm "Phase E (deploy 18 workloads to dev05 cluster)" || { echo "aborted"; return 1; }
  run "kubectl -n argocd apply -f deploy/argocd-dev05/project.yaml"
  run "kubectl -n argocd apply -f deploy/argocd-dev05/namespace.yaml"
  run "kubectl -n argocd apply -f deploy/argocd-dev05/docuploader-appset.yaml"
  run "kubectl -n argocd get applications -l docuploader.opus2.com/archetype"
}

case "$PHASE" in
  A) phase_a ;;
  B) phase_b ;;
  C) phase_c ;;
  E) phase_e ;;
  all) phase_a && phase_b && phase_c && phase_e ;;
  *) echo "unknown phase: $PHASE" >&2; exit 2 ;;
esac
