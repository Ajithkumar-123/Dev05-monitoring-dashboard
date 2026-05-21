#!/usr/bin/env bash
# Revert every AWS change made on 2026-05-13.
# Run order is reverse-creation order to satisfy dependencies.
#
# Usage:
#   ./revert.sh --dry-run     # show what would happen, do nothing
#   ./revert.sh --yes         # actually destroy (skips confirmations)
#
# WARNING: S3 buckets with Object Lock Compliance retention CANNOT be
# emptied before retention expires (7 years on audit-archive). Terraform
# destroy will fail on that bucket; you can force-delete the others.

set -euo pipefail

YES="${1:-}"
DRY=$([[ "$YES" == "--yes" ]] && echo "" || echo "echo [dry-run]")

export AWS_PROFILE=${AWS_PROFILE:-opus2-dev}

# Path to the source .tf files (NOT this snapshot — Terraform state references
# the main repo paths).
# The script lives at:
#   <project-root>/aidlc-docs/operations/dev05-aws-deployment-2026-05-13/revert.sh
# So <project-root> is 3 levels up.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

confirm() {
  [[ "$YES" == "--yes" ]] && return 0
  [[ "$YES" == "--dry-run" ]] && { echo "  (dry-run: auto-confirming '$1')"; return 0; }
  read -r -p "Proceed with $1? [yes/NO] " ans
  [[ "$ans" == "yes" ]]
}

echo "==> Step 1/4: terraform destroy platform-iam-and-security"
confirm "destroy IAM roles + secrets + GuardDuty" || exit 1
$DRY cd "$PROJECT_ROOT/units/platform-iam-and-security/terraform"
$DRY terraform destroy -auto-approve \
  -var environment=dev05 \
  -var tfstate_bucket=docuploader-tfstate-537462380503 \
  -var platform_data_remote_state_key=dev05/platform-data/terraform.tfstate \
  -var eks_cluster_name=DEV05-EKS-CLUSTER \
  -var k8s_namespace=docuploader-dev05 \
  -var aspose_namespace=docuploader-dev05

echo "==> Step 2/4: terraform destroy platform-data"
confirm "destroy DDB tables + S3 buckets + KMS keys (S3 audit-archive has Object Lock — will fail)" || exit 1
$DRY cd "$PROJECT_ROOT/units/platform-data/terraform"
$DRY terraform destroy -auto-approve -var environment=dev05

echo "==> Step 3/4: remove the state bucket (after both stacks destroyed)"
confirm "delete s3://docuploader-tfstate-537462380503" || exit 1
$DRY aws s3 rm s3://docuploader-tfstate-537462380503 --recursive
$DRY aws s3api delete-bucket --bucket docuploader-tfstate-537462380503 --region eu-west-1

echo "==> Step 4/4: SKIPPED — Keep EKS CIDR allowlist as-is"
echo "  (operator decision: do NOT modify publicAccessCidrs on revert)"
echo "  To remove your specific CIDR later — without touching others —"
echo "  first list the current allowlist:"
echo "    aws eks describe-cluster --name DEV05-EKS-CLUSTER --region eu-west-1 \\"
echo "      --query 'cluster.resourcesVpcConfig.publicAccessCidrs'"
echo "  then aws eks update-cluster-config with the desired subset."

echo "==> Revert complete."
echo "Caveat: docuploader-api-audit-archive bucket has Object Lock Compliance 7y."
echo "        terraform destroy will not be able to delete it. To force-delete you'd need"
echo "        to wait out the retention period or use Object Lock Governance override (audit-significant)."
