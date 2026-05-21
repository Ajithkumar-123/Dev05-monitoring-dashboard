# dev05 Deployment Readiness Checklist

**Status**: Deployment-staged. Not deployed.

**Last updated**: 2026-05-12

This is the pre-flight gate list before triggering the dev05 docuploader rollout. Every box must be ticked before the corresponding Phase (A through F, from [dev05-rollout-plan]) is started.

The companion rollout plan lives in conversation context, not as a file yet — capture it as `dev05-rollout-plan.md` if you want a permanent reference.

---

## Gate 1 — Source state must be clean

- [ ] Commit the `libs/data-access` python→py / typescript→ts rename + the 4 md doc-trail updates as a single PR
- [x] Verify document-resolver proto-stubs refactor compiles: ✅ 4/4 PASSED (2026-05-12)
- [x] Delete empty `libs/data-access/go/internal/` directory ✅ removed
- [x] Delete stale `libs/data-access/ts/package-lock.json` ✅ removed
- [ ] Re-run all 76 LIB-04 tests on the committed SHA (working tree is 76/76 ✅; needs commit to gate the SHA)
- [x] `helm template` every unit chart locally ✅ 17/17 PASS post-rehearsal-fix (2026-05-13); `helm lint` not run separately because `helm template` is the stricter check that exercises the chassis dep + template logic

## Gate 2 — AWS account state for dev05

- [x] dev05 AWS account ID: **`537462380503`** ✅ confirmed via `aws sts get-caller-identity` against profile `opus2-dev` (dev04 and dev05 share this account)
- [ ] Confirm eu-west-1 quotas (need to provision via Terraform — currently 0 docuploader resources exist): DynamoDB (7 tables), S3 (4 buckets), KMS (2 + per-tenant aliases), IAM (20 roles), ECR (22 repos)
- [ ] Terraform backend state bucket exists; operator has read/write access
- [x] OIDC provider on `DEV05-EKS-CLUSTER` exists ✅ `arn:aws:iam::537462380503:oidc-provider/oidc.eks.eu-west-1.amazonaws.com/id/4CD18ACA973AEF3E3D289F4092A757EA`
- [ ] GuardDuty Malware Protection quota & cost confirmed for dev05

## Gate 3 — Container registry state (Phase A3 → Phase B)

- [ ] 22 ECR repos created (output of `platform-network-and-compute/terraform/`)
- [ ] CI runner has OIDC/IAM push credentials to those repos
- [ ] All 22 Dockerfiles build cleanly on `linux/amd64`; office-conversion-aspose-container is highest risk (Conan + CMake + GoogleTest)
- [ ] Aspose license uploaded to AWS Secrets Manager + synced into dev05 as k8s Secret `aspose-total-license` before the office-conversion-aspose-container pod starts
- [ ] Image tag strategy confirmed: `image.tag = <git-short-sha>` (current draft assumption)

## Gate 4 — GitOps repo state

- [ ] Restore `argocd-gitops-development-main` working tree: `git remote add origin https://github.com/opus2-automation/argocd-gitops-development.git && git fetch && git checkout main`
- [ ] Resolve 3 dev05 gaps:
  - [ ] Delete or rename `core-infrastructure/environments/dev05/grafana-k8s-monitoring copy.yaml` (space in filename trips kustomize)
  - [ ] Decide if dev05 needs `core-infrastructure-resources/monitoring-resources/environments/dev05/` overlay
  - [ ] Decide if dev05 needs `platform-infrastructure-resources/ocr/environments/dev05/` overlay
- [ ] Transplant `deploy/argocd-dev05/` → `argocd-gitops-development/platform-deployments/environments/dev05/docuploader-dev05/`
- [ ] Add tenant ref in `argo/app-sets/environments/dev05/platform-deployments.yaml`
- [ ] Replace placeholder tokens in transplanted files:
  - [ ] `DOCUPLOADER_SRC_REPO_URL`
  - [ ] `DOCUPLOADER_TARGET_REVISION` (e.g. `main` or release tag)
  - [ ] `537462380503` (replace with dev05 AWS account ID)
  - [ ] `DEV05_PLATFORM_DOMAIN`
  - [ ] `DEV05_ACM_CERT_ARN`
- [ ] Fill in the 16 missing per-unit values files (draft has 3 examples + `_shared.yaml`); `ignoreMissingValueFiles: true` means missing files won't error but services run with chart defaults

## Gate 5 — Cluster bootstrap state on dev05

- [x] `DEV05-EKS-CLUSTER` physically exists in AWS ✅ (5 worker nodes Ready, K8s 1.35)
- [x] ArgoCD installed on dev05 ✅ argocd ns 2y old; 8 pods Running (server, repo-server, controller, dex, image-updater, notifications, redis, applicationset). Already manages 21+ Apps for the Opus2 platform stack.
- [x] External Secrets Operator running ✅ 3 pods in `external-secrets` ns (operator + cert-controller + webhook)
- [x] AWS Load Balancer Controller, Karpenter, KEDA, Kyverno, metrics-server all green ✅ — ALB ctrl 2 pods in kube-system; KEDA 3 pods; Kyverno admission/background controllers Running; metrics-server Synced
- [x] Karpenter NodePools have instance types with ≥4GiB RAM (Aspose container minimum) ✅ 8 NodePools: spot-base (3 nodes Ready), on-demand-base/heavy/stateful/worker, spot-worker/heavy, graviton-worker — `on-demand-heavy` and `spot-heavy` cover ≥4GiB Aspose needs
- [x] kubectl context configured for `DEV05-EKS-CLUSTER` ✅
- [x] Target namespace `docuploader-dev05` available ✅ (not present yet — will be created on first sync; `doc-uploader-sandbox` exists separately, empty, 31d old)

## Gate 6 — Network & DNS

- [ ] DNS records for `DEV05_PLATFORM_DOMAIN` (`dev05.k8s.opus2dev.com`) resolvable (CNAME → ALB) — not verified from this machine
- [x] ACM certificate exists in eu-west-1, status `ISSUED` ✅ wildcard `*.dev05.k8s.opus2dev.com`
- [ ] WAF web ACL attached to the ALB (if required by security baseline)
- [ ] Security group allows ingress from office/VPN CIDRs

## Gate 7 — Observability before traffic

- [x] Grafana Alloy running ✅ — Alloy stack lives in `grafana` ns (not `observability`); multiple `alloy-logs`, `alloy-metrics`, `alloy-profiles` pods Running. **Note: `_shared.yaml` OTLP endpoint `grafana-alloy.observability.svc.cluster.local:4317` needs to be retargeted to the actual `grafana` namespace** before deploy
- [ ] Grafana dashboards for docuploader exist (need to check Grafana UI, not just k8s state):
  - [ ] gRPC latency (workspace/batch/document resolvers)
  - [ ] SQS queue depth (14 queues from `platform-orchestration/terraform/`)
  - [ ] Step Functions success rate
  - [ ] S3 PUT success rate (staging + pipeline buckets)
- [ ] Alerting wired to Slack/Teams/email for: pod CrashLoop, DLQ growth, Step Functions execution failure

## Gate 8 — Smoke-test data & access

- [ ] Test tenant seeded in `docuploader-api-workspaces` (one row, real CMK alias)
- [ ] Test JWT mintable from dev05 Cognito/OAuth with tenant + workspace claims
- [ ] Sample documents staged locally for J1-J4: PDF, zip, EML, DOCX, JPG
- [ ] Operator has read access to staging bucket to verify J1-J4 outputs

## Gate 9 — Rollback readiness

- [ ] ArgoCD `automated.selfHeal` setting confirmed (draft has `true`; decide whether to flip to `false` for first sync)
- [x] Per-Application sync waves set ✅ (R-5 fix 2026-05-13): namespace wave -10, resolvers 0, router 1, KEDA workers 5, Aspose 8, react-web-module 10
- [ ] One-command rollback path documented for each Application: `kubectl -n argocd patch app docuploader-<unit> --type=merge -p '{"spec":{"source":{"targetRevision":"<prev-sha>"}}}'`

---

## Highest-risk items (failure modes that hit first)

| Risk | Failure signature | Mitigation gate |
| --- | --- | --- |
| AWS account ID mismatch in IRSA arns | All 19 pods CrashLoop with `WebIdentityErr` | Gate 2 + Gate 4 token replace |
| `docuploader-chassis` lib chart not resolvable | ArgoCD Application stuck `Unknown`; `helm dependency build` error in events | Gate 1 (`helm lint` locally) |
| Aspose license missing | `office-conversion-aspose-container` pod hangs at init / CrashLoop | Gate 3 secret seeded |
| Step Functions ARN drift | Resolvers fail to start workflows; errors at `StartExecution` call | Gate 2 (`terraform output` value piped into Gate 4) |
| `DOCUPLOADER_SRC_REPO_URL` placeholder left in | ApplicationSet creates 19 Apps that all fail with "repository not found" | Gate 4 token replace |

---

## What's intentionally NOT in this checklist

- Production-grade SLOs, error budgets, capacity planning — dev05 is dev, not prod
- Compliance evidence collection (SOC 2, ISO 27001) — covered by `extensions/security/baseline/security-baseline.md` enforcement at construction stage
- Multi-region failover — dev05 is single-region eu-west-1 by design
- Tenant migration scripts — fresh dev05, no pre-existing tenant data to move

---

## How to use this file

1. Owner ticks each box as they verify (or delegate). Open items block the Phase that depends on them.
2. When all of Gates 1-9 are ✅, the operator can start Phase A (Terraform).
3. After Phase F (J1-J4 smoke tests pass), file a "dev05 ready" note and close this checklist.
4. Re-create from template for any subsequent cluster (dev06, dev07, …) — most gates apply identically, only the AWS account ID + tenant name change.
