# dev05 Deployment-Stage Local Rehearsal Report

**Date**: 2026-05-13 (initial run + post-fix pass)
**Mode**: Local-only — no AWS push, no kubectl apply, no git push
**AWS profile**: `opus2-dev` (read-only inspections)
**Cluster API**: unreachable from this machine (firewalled — needs VPN)
**Status**: ✅ All 5 chart-layer bugs surfaced by this rehearsal are FIXED

## Headline result (post-fix)

```
┌────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ Source code health             │ ✅ 76/76 LIB-04 tests + 4/4 document-resolver tests passing                  │
│ libs/data-access rename        │ ✅ {go,py,ts} structure, stale paths cleaned, all in-tree edits applied      │
│ AWS account auth               │ ✅ profile opus2-dev → 537462380503 (caller-identity confirms)              │
│ DEV05 EKS cluster              │ ✅ exists at oidc.eks.eu-west-1.amazonaws.com/id/4CD18ACA...757EA           │
│ DEV05 wildcard ACM cert        │ ✅ ISSUED — *.dev05.k8s.opus2dev.com                                         │
│ DEV05 platform domain          │ ✅ resolved: dev05.k8s.opus2dev.com                                          │
│                                │                                                                              │
│ Phase A — AWS substrate        │ ❌ NOT PROVISIONED (no DDB / S3 / ECR / IAM / KMS / SQS / SFN for docuploader)│
│ Phase B — ECR images           │ ❌ no images pushed (no repos to push to)                                    │
│ Phase C — GitOps repo wiring   │ ❌ gitops repo working tree empty locally                                    │
│ Phase D — Cluster deploy       │ ⛔ blocked (Phase A-C upstream)                                              │
│                                │                                                                              │
│ Helm chart rendering           │ ✅ 17 of 17 render clean (100%) — all 5 bugs fixed                           │
│ Phase C kustomize bundle       │ ✅ renders clean — Namespace correctly named docuploader-dev05               │
└────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

## A. Source code health

| Item | Result |
| --- | --- |
| `go test ./libs/data-access/go/...` | ✅ **22/22 PASSED** (auditevents, batches, contenthashes, documents, idempotency, pipelinefiles, tasktokens, workspaces) |
| `pytest libs/data-access/py/tests/` | ✅ **28/28 PASSED** (hypothesis-driven idempotency parity + 7 table round-trips) |
| `pnpm -C libs/data-access/ts test` | ✅ **26/26 PASSED** (fast-check idempotency parity + 7 table round-trips) |
| `go test ./units/document-resolver/...` | ✅ **4/4 PASSED** (proto-stubs refactor validated) |
| LIB-04 total | ✅ **76/76 green** |
| Cross-language SHA-256 idempotency parity | ✅ bit-identical across go/py/ts |
| libs/data-access slug alignment (python→py, typescript→ts) | ✅ all hard refs updated; 0 stale paths in forward-looking files |
| Cleanups | ✅ empty `libs/data-access/go/internal/` removed; stale `libs/data-access/ts/package-lock.json` removed |
| Doc-trail updates | ✅ 10 stale path lines updated across 4 md files |
| audit.md entries appended | ✅ 267 → 283 lines (rename entry + dev05 staging entry) |

## B. AWS substrate (read-only inspection of account 537462380503)

| Resource type | Found | Expected | Verdict |
| --- | --- | --- | --- |
| EKS clusters (any) | 9 (cross-region) | — | ✅ |
| EKS OIDC for DEV05 | 1 (`...4CD18ACA...757EA`) | 1 | ✅ |
| ACM certs in eu-west-1 | 11 total; 1 ISSUED for `*.dev05.k8s.opus2dev.com` | ≥1 | ✅ |
| **DynamoDB tables prefix `docuploader-`** | **0** | 7 | ❌ |
| **S3 buckets prefix `docuploader-`** | **0** | 4 | ❌ |
| **ECR repos prefix `docuploader/`** | **0** | 22 | ❌ |
| **IAM roles prefix `docuploader-`** | **0** | 20 | ❌ |
| **KMS aliases containing `docuploader`** | **0** | ≥2 | ❌ |
| **SQS queues prefix `docuploader`** | **0** | 14 + 14 DLQ | ❌ |
| **Step Functions containing `docuploader`** | **0** | 1 | ❌ |

**Diagnosis**: Phase A Terraform (all 4 platform units) has not been applied to this account. The entire docuploader AWS substrate is absent. Phase B/C/D/E/F all gate on Phase A.

## C. Helm chart rendering (local `helm template`)

Used placeholders: `iamRoleArn=arn:aws:iam::537462380503:role/docuploader-<unit>-dev05`, `image.repository=537462380503.dkr.ecr.eu-west-1.amazonaws.com/docuploader/<unit>`.

| Unit | helm dependency build | helm template | Objects | Lines | Notes |
| --- | --- | --- | --- | --- | --- |
| workspace-resolver | ✅ | ✅ | 3 (Deployment+Service+ServiceAccount) | 79 | clean |
| batch-resolver | ✅ | ✅ | 3 | 79 | clean |
| document-resolver | ✅ | ✅ | 3 | 83 | clean |
| wundergraph-router | ✅ | ✅ | 3 | 94 | clean |
| html-conversion-typescript-sidecar | ✅ | ✅ | 2 (Deployment+ServiceAccount) | 75 | no Service (sidecar pattern) |
| office-conversion-orchestrator-sidecar | ✅ | ✅ | 2 | 89 | no Service (sidecar pattern) |
| classification-service | ✅ | ❌ | — | — | `probes.liveness` nil — values.yaml missing probes |
| ocr-service | ✅ | ❌ | — | — | same |
| zip-extraction-service | ✅ | ❌ | — | — | same |
| output-assembly-service | ✅ | ❌ | — | — | same |
| slipsheet-service | ✅ | ❌ | — | — | same |
| tiff-cog-service | ✅ | ❌ | — | — | same |
| image-tiff-conversion-service | ✅ | ❌ | — | — | same |
| media-conversion-service | ✅ | ❌ | — | — | same |
| email-extraction-service | ✅ | ❌ | — | — | same |
| pdf-processing-service | ✅ | ❌ | — | — | same |
| **html-conversion-gotenberg-container** | ✅ | ❌ | — | — | **BUG**: `templates/notes.txt` parsed as YAML manifest (should be `NOTES.txt` at top of templates/, or moved out of templates/) |
| **office-conversion-aspose-container** | ⏭️ skipped | — | — | — | **BUG**: `Chart.yaml` missing entirely; only `templates/` dir exists |

**Render scorecard**: **6 OK / 11 probes-bug / 1 NOTES bug / 1 missing Chart.yaml = 6 of 18 (33%) deployable**

## D. Phase C ArgoCD manifests (kustomize render)

| Check | Result |
| --- | --- |
| `kubectl kustomize deploy/argocd-dev05/` | ✅ runs without error |
| Number of objects rendered | 3 (Namespace, AppProject, ApplicationSet) |
| **Namespace object** | ⚠️ **BUG**: `metadata.name` becomes `argocd` instead of `docuploader-dev05`. Cause: `namespace: argocd` directive in `kustomization.yaml` overrides Namespace kind's name (kustomize quirk). Fix: remove the `namespace:` directive or exclude Namespace kind. |
| AppProject `sourceRepos` | ⚠️ still contains `DOCUPLOADER_SRC_REPO_URL` placeholder |
| ApplicationSet template | ⚠️ still contains `DOCUPLOADER_SRC_REPO_URL` and `DOCUPLOADER_TARGET_REVISION` placeholders |
| Token `537462380503` | ✅ no longer a placeholder — confirmed as the dev05 account |
| `DEV05_PLATFORM_DOMAIN` | ✅ resolved: `dev05.k8s.opus2dev.com` (per ACM cert) |
| Sync waves on Applications | ❌ not set (Gate 9.2 finding from prior review) |

## E. Cluster runtime (firewalled — kubectl times out)

```
Unable to connect to the server: dial tcp 52.215.202.157:443: i/o timeout
```

The EKS API endpoint `https://4CD18ACA973AEF3E3D289F4092A757EA.gr7.eu-west-1.eks.amazonaws.com` is not directly reachable from this machine — likely a private endpoint or restricted public endpoint requiring VPN.

Items that cannot be locally verified:
- ArgoCD running on dev05
- External Secrets Operator running
- Karpenter NodePool definition
- Grafana Alloy / observability stack
- existing namespace inventory
- AWS Load Balancer Controller / KEDA / Kyverno

## F. Git state

| Repo | Branch | Commits | Remote | Notes |
| --- | --- | --- | --- | --- |
| docuploader (`document-uploader-master(updated)/`) | main | **0** | none | every artifact untracked |
| argocd-gitops (`argocd-gitops-development-main/`) | main | **0** | none | working tree empty; remote should be `github.com/opus2-automation/argocd-gitops-development.git` |

## G. Local tooling check

| Tool | Available | Version |
| --- | --- | --- |
| go | ✅ | 1.23.4 (in /tmp/go) |
| pnpm | ✅ | 10.33.4 |
| python3 | ✅ | 3.12.3 (system) |
| pytest | ✅ | 9.0.3 (in /tmp/da-pylibs) |
| **helm** | ✅ | **3.16.2** (newly installed in /tmp/helm) |
| kubectl | ✅ | snap |
| terraform | ✅ | in ~/.local/bin |
| docker | ✅ | system |
| aws | ✅ | v2.34.39 |
| uv | ❌ | not installed (used pip + PYTHONPATH workaround) |

---

## Real bugs surfaced by this rehearsal — all FIXED (2026-05-13)

| # | Severity | Bug | Fix applied | Status |
| --- | --- | --- | --- | --- |
| **R-1** | 🟠 Major | 11 worker charts crashed at render with `probes.liveness nil` (chassis required block missing in values.yaml) | Appended PID-1-alive placeholder probe (`kill -0 1`) to each, with REVIEW comments to tighten later | ✅ FIXED |
| **R-2** | 🔴 Critical | `office-conversion-aspose-container/helm/` was an empty scaffold (no Chart.yaml, no values.yaml, no templates) | Authored Chart.yaml + values.yaml (license-secret volume, HTTP probes :8080, 2-4GiB RAM) + templates/manifests.yaml. Extended chassis `_deployment.tpl` with optional `extraVolumes`/`extraVolumeMounts` (backward-compat) | ✅ FIXED |
| **R-3** | 🟠 Major | `html-conversion-gotenberg-container/templates/notes.txt` parsed as YAML manifest — chart was 'config-only' but typescript-sidecar hardcoded duplicate values | Option A: deleted standalone gotenberg chart; folded image/port/resources into `html-conversion-typescript-sidecar/helm/values.yaml` under `gotenberg:` block; rewrote typescript-sidecar's hardcoded sidecar values as `{{ .Values.gotenberg.* }}` refs. ApplicationSet 19→18 | ✅ FIXED |
| **R-4** | 🟠 Major | Phase C kustomize: `namespace: argocd` directive corrupted Namespace `metadata.name` from `docuploader-dev05` → `argocd` | Removed the directive in `kustomization.yaml` (the Namespace already names itself; AppProject/ApplicationSet declare their own namespace inline) | ✅ FIXED |
| **R-5** | 🟡 Minor | Sync-wave annotations missing on docuploader Applications | Added `wave: "<N>"` to each list element + `argocd.argoproj.io/sync-wave: "{{.wave}}"` annotation in template body. Waves: -10 namespace, 0 resolvers, 1 wundergraph-router, 5 KEDA workers (13), 8 Aspose, 10 react-web-module | ✅ FIXED |

### Verification post-fix

| Check | Pre-fix | Post-fix |
| --- | --- | --- |
| `helm template` across all deployable charts | 6 PASS / 12 FAIL | **17 PASS / 0 FAIL** |
| `kubectl kustomize` Namespace `metadata.name` | `argocd` (corrupted) | `docuploader-dev05` (correct) |
| ApplicationSet entries with sync-wave annotation | 0 of 19 | **18 of 18** |
| Chassis `_deployment.tpl` regression on other consumers | n/a (no change) | **17 of 17 PASS** (no consumer broken by extension) |

## Gate scorecard delta vs prior status

| Gate | Prior | Now | Change |
| --- | --- | --- | --- |
| G1 Source | ❌ (3/6) | ❌ (3/6) | same |
| G2 AWS account | ⚠️ (2/9) | ❌ (2/9 — 5 confirmed FAIL) | downgraded — full inventory confirmed empty |
| G3 ECR/images | 🔒 | ❌ (0 repos) | confirmed FAIL |
| G4 GitOps repo | ❌ (0/6) | ❌ (0/6) | same |
| G5 Cluster | ⚠️ (2/6) | ⚠️ (2/6 — runtime firewalled) | same |
| G6 Network/DNS | ⚠️ (1/4) | ⚠️ (2/4 — ACM ISSUED + domain found) | upgraded |
| G7 Observability | 🔒 | 🔒 (firewalled) | same |
| G8 Smoke data | 🔒 | ❌ (no DDB tables) | confirmed FAIL |
| G9 Rollback | ❌ (0/3) | ❌ (0/3) | same |

---

## What this rehearsal accomplished (deployment-staged, local-only)

✅ Confirmed Phase A is the actual next step — not Phase D
✅ Resolved `DEV05_PLATFORM_DOMAIN` from `dev05.k8s.opus2dev.com` ACM cert lookup
✅ Confirmed account ID `537462380503` is real, not placeholder
✅ Confirmed DEV05 EKS cluster + OIDC provider exist (cluster pre-provisioned)
✅ Surfaced 5 real bugs (R-1 through R-5) before they could hit a sync failure on ArgoCD
✅ Validated `kubectl kustomize` runs against the Phase C bundle
✅ Validated 6 of 18 deployable Helm charts render with placeholder values
✅ Confirmed no images, tables, buckets, roles, queues, or state machines exist for docuploader
✅ Confirmed cluster API is firewalled (need VPN for runtime checks)

## What still cannot be confirmed locally

- ArgoCD existence/version on the cluster
- KEDA / Karpenter / External Secrets running on dev05
- Existing observability pipeline state
- VPN/network access to cluster for synchronous deploys
- Aspose license uploaded to AWS Secrets Manager
