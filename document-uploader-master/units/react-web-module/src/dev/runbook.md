# dev05 Deployment Runbook

**Status**: Operational runbook for first-time deploy to `DEV05-EKS-CLUSTER` (account `537462380503`, region `eu-west-1`).

**Prerequisites**:
- `aws sso login --profile opus2-dev` (session active)
- Your public IP is in `DEV05-EKS-CLUSTER`'s `publicAccessCidrs` allowlist (otherwise kubectl times out)
- GitHub auth configured (`gh auth login` or SSH key)
- Local Docker daemon running (for build steps)
- `helm`, `kubectl`, `terraform`, `aws`, `pnpm`, `go`, `python3 + uv` available

## Architecture summary

| Layer | Where | Authored by |
| --- | --- | --- |
| AWS substrate | 4 Terraform stacks under `units/platform-*/terraform/` | Phase A (this runbook) |
| Container images | 22 unit images in ECR `537462380503.dkr.ecr.eu-west-1.amazonaws.com/docuploader/*` | Phase B (CI or local) |
| Helm charts | 18 deployable charts under `units/<unit>/helm/` | Already in tree |
| ArgoCD manifests | `deploy/argocd-dev05/` (project + appset + namespace + 4 value overlays) | Already in tree |
| GitOps target | `argocd-gitops-development.git` → `platform-deployments/environments/dev05/docuploader-dev05/` | Phase C (transplant) |

## Phase A — AWS substrate (Terraform)

**Blast radius**: Creates AWS resources (DDB, S3, ECR, IAM, KMS, SQS, SFN). Reversible via `terraform destroy` but Object Lock buckets retain data for years.

```bash
make dev05-plan       # preview every change, no mutation
make dev05-deploy     # interactive — prompts before each phase
# OR per-phase:
./scripts/deploy-dev05.sh --phase A
```

**Order matters**: platform-data → platform-iam-and-security → platform-network-and-compute → platform-orchestration. The script enforces this.

**Verification after Phase A**:

```bash
aws dynamodb list-tables --region eu-west-1 | grep docuploader      # expect 7
aws s3 ls | grep docuploader                                         # expect 4
aws iam list-roles --query 'Roles[?starts_with(RoleName,`docuploader-`)]' | wc -l   # expect 20
aws ecr describe-repositories --region eu-west-1 \
  --query 'repositories[?starts_with(repositoryName,`docuploader/`)]' --output text \
  | wc -l                                                            # expect 22
```

## Phase B — Container images (build + push)

**Blast radius**: 22 images in ECR; ~$1-2/month storage.

```bash
# local build only, no push
make build-all

# or one image at a time
make build UNIT=workspace-resolver

# build + push (requires ECR auth and Phase A's repos)
./scripts/deploy-dev05.sh --phase B
```

The script uses 5 archetype Dockerfiles under `deploy/dockerfiles/`:

| Archetype | Dockerfile | Units |
| --- | --- | --- |
| `go-service` | `go-service.Dockerfile` | 6 Go HTTP/gRPC services |
| `go-lambda` | `go-lambda.Dockerfile` | 4 Go Lambdas (container image) |
| `ts-service` | `ts-service.Dockerfile` | 9 TS sidecars/services |
| `ts-web` | `ts-web.Dockerfile` | react-web-module (nginx-served) |
| `python-service` | `python-service.Dockerfile` | 2 Python services |
| `cpp-aspose` | `cpp-aspose.Dockerfile` | office-conversion-aspose-container |

**CI alternative**: push a tag `vX.Y.Z` to GitHub and `.github/workflows/build-and-push.yml` runs the same builds in parallel via matrix (uses OIDC federation, no static AWS creds).

### Phase B local rehearsal — 2026-05-19 outcome

21 of 22 archetype images built locally and stayed on the laptop (not pushed). Bugs surfaced + fixed:

| Bug | Archetype | Fix |
| --- | --- | --- |
| R-6 | go-service / go-lambda | Mirror repo layout under `/workspace/units/<unit>` so `replace ../../libs/data-access/go` resolves |
| R-7 | go-service | `virus-scanning-service` unit doesn't exist on disk — remove from build matrix |
| R-8 | go-lambda | Lambdas use `cmd/bootstrap`, not `cmd/lambda` |
| R-9 | ts-service | Build the LIB-04 TS lib before consumer; explicit `--filter "./libs/data-access/ts"` so its devDeps (`tsc`) install |
| R-10 | ts-service | LIB-04 TS lib was missing `@types/node` in devDependencies (uses `node:crypto` + `Buffer`) |
| R-11 | ts-service | pnpm v10 needs `--legacy` on `pnpm deploy` (or set `inject-workspace-packages=true`) |

**Aspose status: BLOCKED.** The `cpp-aspose.Dockerfile` build fails at `cmake --preset conan-release` because (a) `--output-folder=build` places `conan_toolchain.cmake` one directory above what the `project()` call resolves to from `-B build/build`, and (b) Aspose.Total is a licensed commercial SDK whose Conan recipe lives in a private remote. Unblock checklist before re-attempting:

1. Provision Aspose.Total license + Conan remote credentials (vendor portal).
2. Add `conan remote add` + `conan user` steps to the Dockerfile pre-`conan install`.
3. Align `--output-folder` with the cmake binary dir (either `--output-folder=build/build` or `cmake -B build`).
4. Mount license at runtime via k8s Secret `aspose-total-license` (already wired in the helm chart per row 185).

## Phase C — GitOps wiring

**Blast radius**: Adds a tenant to the shared `argocd-gitops-development` repo. Reversible by reverting the commit.

```bash
./scripts/deploy-dev05.sh --phase C
```

What the phase does:
1. Copies `deploy/argocd-dev05/` to `argocd-gitops-development/platform-deployments/environments/dev05/docuploader-dev05/`
2. Replaces placeholder tokens (5 of them — see `deploy/argocd-dev05/README.md`)
3. Commits + pushes

**Tokens to set before running** (export or edit):

```bash
export DOCUPLOADER_SRC_REPO_URL="https://github.com/opus2-automation/docuploader.git"
export DOCUPLOADER_TARGET_REVISION="dev05-rehearsal"   # or main, or a tag
export DEV05_PLATFORM_DOMAIN="dev05.k8s.opus2dev.com"
# DEV05_ACM_CERT_ARN — look up via: aws acm list-certificates --region eu-west-1
```

## Phase E — ArgoCD sync

**Blast radius**: Deploys 18 workloads to dev05 cluster (creates `docuploader-dev05` namespace, ServiceAccounts, Deployments, Services, KEDA ScaledObjects).

```bash
./scripts/deploy-dev05.sh --phase E
```

ArgoCD respects the sync waves set in the appset:

```
wave -10  docuploader-dev05 namespace
wave   0  workspace-resolver, batch-resolver, document-resolver
wave   1  wundergraph-router
wave   5  13 KEDA-driven workers (classification, ocr, zip-extraction, etc.)
wave   8  office-conversion-aspose-container
wave  10  react-web-module
```

**Watch sync progress**:

```bash
kubectl -n argocd get applications -l docuploader.opus2.com/archetype -w
```

Expected: each Application transitions `OutOfSync` → `Syncing` → `Synced/Healthy` within ~5 min. Aspose may take longer due to license-secret cold start.

## Phase F — Smoke test (J1–J4 journeys)

After Phase E shows all `Healthy`:

```bash
# J1 happy path: PDF upload
make smoke-j1   # TODO: stub script — author per real test data

# Or hit the wundergraph-router directly via port-forward
kubectl -n docuploader-dev05 port-forward svc/wundergraph-router 9991:9991
curl -X POST http://localhost:9991/graphql \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"mutation { createBatch(input: {...}) { batchId } }"}'
```

## Rollback

**Phase A rollback** — destroys AWS resources:

```bash
for unit in platform-orchestration platform-network-and-compute platform-iam-and-security platform-data; do
  terraform -chdir=units/$unit/terraform destroy -var environment=dev05
done
```

Note: reverse order. S3 buckets with Object Lock cannot be deleted until retention expires.

**Phase C rollback** — revert the gitops commit:

```bash
cd argocd-gitops-development
git revert HEAD
git push
```

ArgoCD will prune the 18 Applications + namespace within minutes.

**Phase E rollback (faster than C revert)** — manually delete:

```bash
kubectl -n argocd delete applicationset docuploader-dev05
kubectl -n argocd delete appproject docuploader
kubectl delete namespace docuploader-dev05
```

## Authentication reminders

| System | Auth | Command |
| --- | --- | --- |
| AWS | SSO via profile `opus2-dev` | `aws sso login --profile opus2-dev` |
| ECR | OIDC-federated GitHub Actions (for CI) OR direct AWS cred (for local) | `aws ecr get-login-password \| docker login --password-stdin ...` |
| GitHub (HTTPS) | PAT cached in `git credential-store` | `git config --global credential.helper store` |
| GitHub (SSH) | Key in `~/.ssh/` and added to GitHub account | `ssh -T git@github.com` |
| kubectl | EKS uses AWS creds via the kubeconfig's `aws eks get-token` | nothing to do — works once AWS_PROFILE is set |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `kubectl` times out | Your IP not in `publicAccessCidrs` | Add via `aws eks update-cluster-config`; see `dev05-readiness-checklist.md` G6 |
| All pods CrashLoop with `WebIdentityErr` | IRSA role-arn mismatch | Verify role arn in per-unit values matches Phase A2 output |
| `ImagePullBackOff` | Image not pushed to ECR yet | Re-run Phase B |
| `office-conversion-aspose-container` hangs at init | Aspose license Secret not synced | Verify via `kubectl -n docuploader-dev05 get secret aspose-total-license`; if absent, ESO source mapping is wrong |
| ArgoCD Application stuck `Unknown` | `helm dependency build` error — chassis chart not resolvable | Verify multi-source in appset has both `repoURL` references resolvable |
| Step Functions invocations fail | `STATE_MACHINE_ARN` env var wrong | Re-export from `terraform output` and re-apply Helm |

## Related artefacts

- `aidlc-docs/operations/dev05-readiness-checklist.md` — pre-deploy gates (43 items, currently 16 ticked)
- `aidlc-docs/operations/dev05-rehearsal-report.md` — local rehearsal results (5 bugs found and fixed)
- `deploy/argocd-dev05/README.md` — what each ArgoCD manifest does + token replacement table
- `deploy/dockerfiles/*.Dockerfile` — 6 archetype build templates
- `.github/workflows/{ci,build-and-push,terraform-plan}.yml` — automated equivalents of the manual steps above
