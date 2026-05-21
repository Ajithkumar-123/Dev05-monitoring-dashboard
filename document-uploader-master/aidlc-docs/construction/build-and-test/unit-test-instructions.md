# Unit Test Instructions

## Three-tier minimum gate (binding for every unit)

Every unit must pass **all three** before being considered complete:

1. **Local in-process** — fast, no external dependencies
2. **Local integration via LocalStack** — DDB + S3 + KMS + SQS + Step Functions + EventBridge + IAM basic + Secrets Manager (Textract + GuardDuty mocked at SDK boundary)
3. **Deployed sandbox** — real AWS in `eu-west-1`

## Per-language toolchains

### Go

```bash
# Local
cd units/<unit>
go test ./... -race -coverprofile=coverage.out
# Allure report
go-allure --output=allure-results ./...
```

Property tests via `testing/quick` or hand-rolled `fast-check`-style invariants.

### Python (uv)

```bash
cd units/<unit>
uv sync --locked
uv run pytest --cov --alluredir=allure-results
# Property-based via hypothesis
```

### TypeScript (pnpm)

```bash
cd units/<unit>
pnpm install --frozen-lockfile
pnpm test                        # vitest + fast-check + msw
# Allure-vitest emits allure-results/ automatically per allure-vitest config
```

### C++ (Conan-in-Docker harness)

Canonical entrypoint — **only Docker is required**; no local Conan, CMake, or
GoogleTest install:

```bash
make -C units/office-conversion-aspose-container test
```

This builds `Dockerfile.test` (Ubuntu 24.04 + Conan 2.x + CMake + Ninja),
installs deps from `conanfile.txt`, builds the unit, and runs `ctest` inside
the container. `docker run` exits with `ctest`'s status, so CI uses the
container's exit code directly as pass/fail.

Useful variants from the same `Makefile`:

```bash
make -C units/office-conversion-aspose-container shell        # drop into the test image for gdb / single-test rerun
make -C units/office-conversion-aspose-container test-clean   # force --no-cache rebuild
```

For local-only contributors who prefer not to use Docker, the underlying
steps remain:

```bash
cd units/office-conversion-aspose-container
conan install . --output-folder=build --build=missing -s build_type=Release -s compiler.cppstd=20
cmake -S . -B build/build -DCMAKE_TOOLCHAIN_FILE=build/build/Release/generators/conan_toolchain.cmake -DCMAKE_BUILD_TYPE=Release
cmake --build build/build
ctest --test-dir build/build --output-on-failure
```

Allure-format reports are produced via `gtest-allure-adapter --output=allure-results build/build/render_test` (run inside or outside the container; the
harness mounts the host directory if invoked with `-v $(pwd)/allure-results:/src/allure-results`).

## Coverage targets

- **80% line + 70% branch** (sensible default; refined post-MVP).

## Property-based testing (binding — `property-based-testing` extension enforced)

Property tests required for at minimum:

| Unit | Properties |
| --- | --- |
| `libs/data-access` (all 3 languages) | Idempotency-key derivation is deterministic + bit-identical across languages; entity type round-trip preserves all fields |
| `document-resolver` | Idempotency-keyed mutations are de-duplicated; presigned URL TTL and content-type are server-set; status transitions are forward-only |
| `classification-service` | Per-route mapping is total over the design's MIME set; forced-slipsheet extensions short-circuit before magic-byte detection |
| `zip-extraction-service` | Peak RAM is bounded by per-entry chunk size, NOT archive size or nesting depth |
| `pdf-processing-service` | Page count preserved; output PDF parses; no orphaned XObjects |
| `office-conversion-orchestrator-sidecar` | Peak RAM is bounded by `CHUNK_PAGES`; qpdf merge preserves chunk page order |
| `image-tiff-conversion-service` | Bounded RAM regardless of input dimensions |
| `pre-token-generation-lambda` | Validation rejects on any missing required claim |
| `audit-event-storage-lambda` | Dual-sink idempotent on `eventId`; redaction strips never-log fields at any nesting depth |

## Allure reports (binding)

Every test runner emits Allure-format results into `allure-results/` per unit. CI aggregates via `allure generate` into a single report per branch.
