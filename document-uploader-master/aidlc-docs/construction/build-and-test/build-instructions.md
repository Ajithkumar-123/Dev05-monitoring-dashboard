# Build Instructions

## Prerequisites

- AWS CLI v2 with sandbox profile configured
- Terraform 1.10+
- kubectl + Helm 3.13+
- Docker 24+
- Go 1.23+
- Python 3.13 + `uv`
- Node.js 22 LTS + `pnpm`
- CMake 3.25+ + Conan 2.x (for the C++ unit)
- ECR login: `aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.eu-west-1.amazonaws.com`

## Build sequence (matches workflow-planning.md tiers)

### Tier-1 platform (Terraform-only; no images)

```bash
for unit in platform-data platform-iam-and-security platform-network-and-compute platform-orchestration; do
  pushd units/$unit/terraform
  terraform init
  terraform apply -auto-approve
  popd
done
```

Order matters: `platform-data` first (its outputs feed `platform-iam-and-security` and `platform-network-and-compute`); `platform-iam-and-security` second; the others can run in parallel after.

### Tier-2 API stack (7 Go units)

```bash
# Each resolver/Lambda follows the same pattern. Example for workspace-resolver:
pushd units/workspace-resolver
go mod download
go build -o bin/server ./cmd/server
docker build -t docuploader/workspace-resolver:0.1.0 .
docker tag docuploader/workspace-resolver:0.1.0 <account>.dkr.ecr.eu-west-1.amazonaws.com/docuploader/workspace-resolver:0.1.0
docker push <account>.dkr.ecr.eu-west-1.amazonaws.com/docuploader/workspace-resolver:0.1.0
popd
```

Lambdas use `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/bootstrap`, then package as zip via `aws lambda update-function-code`.

### Tier-3 pipeline workers (15 units)

- **TypeScript (9)**: `pnpm install --frozen-lockfile && pnpm build && docker build ...`
- **Python (2)**: `uv sync --locked && docker build ...`
- **C++ (1) `office-conversion-aspose-container`**: `make -C units/office-conversion-aspose-container test` — Conan-in-Docker harness (`Dockerfile.test` + `Makefile`). Builds the test image and runs `ctest` inside it; **no local Conan / CMake / GoogleTest install required**, only Docker. The production runtime image is built from a separate Dockerfile and reuses the same Conan-install layer via cache mount.
- **Go (2) `email-extraction-service`, `update-document-state-lambda`**: same pattern as Tier-2
- **Third-party `html-conversion-gotenberg-container`**: mirror `gotenberg/gotenberg:8` → ECR (no source build)

### Tier-4 web

```bash
pushd units/react-web-module
pnpm install --frozen-lockfile
pnpm build      # emits dist/index.js + dist/index.d.ts (consumed via npm or CloudFront/S3)
popd
```

### Deploy

```bash
# Kustomize substrate (namespaces + ServiceAccounts + Ingress)
kubectl apply -k units/platform-network-and-compute/kustomize/overlays/sandbox
kubectl apply -k units/platform-orchestration/kustomize/base/audit-emission

# Helm releases (one per workload)
for unit in workspace-resolver batch-resolver document-resolver wundergraph-router \
            classification-service ocr-service zip-extraction-service output-assembly-service \
            slipsheet-service pdf-processing-service office-conversion-orchestrator-sidecar \
            html-conversion-typescript-sidecar tiff-cog-service image-tiff-conversion-service \
            email-extraction-service media-conversion-service; do
  helm upgrade --install $unit units/$unit/helm \
    --namespace docuploader \
    --set image.repository=<account>.dkr.ecr.eu-west-1.amazonaws.com/docuploader/$unit \
    --set iamRoleArn=$(terraform -chdir=units/platform-iam-and-security/terraform output -raw $unit\_role_arn)
done
```

`office-conversion-orchestrator-sidecar` deploys to the `aspose-converter` namespace.

## Per-language lockfile policy (binding)

- `go.sum` committed; CI runs `go mod download` then `go build`
- `uv.lock` committed; CI runs `uv sync --locked`
- `pnpm-lock.yaml` committed; CI runs `pnpm install --frozen-lockfile`
- `conanfile.txt`-derived locks committed under `build/`; CI verifies via `conan install --lockfile`
