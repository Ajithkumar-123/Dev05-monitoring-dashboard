# Harness — Tier-2 LocalStack integration testing

Local AWS-mock harness for LIB-04 (and any consumer unit). **Zero real AWS dependencies** — runs entirely on Docker + Go.

## Quick start

```bash
make localstack-up         # spin up LocalStack at :4566
make localstack-bootstrap  # create 7 DDB tables, 4 S3 buckets, 2 KMS aliases, 3 secrets
make localstack-test       # run the test rig (workspaces/batches/documents round-trip + idempotency parity)
make localstack-down       # tear down (also deletes all state — Tier-2 is reproducible)
```

Expected end state of a successful run:
```
PASS  workspaces.Put+Get round-trip
PASS  batches.Put+Get round-trip
PASS  documents.Put+Get round-trip
PASS  idempotency.DeriveUpdateStatusKey is deterministic
PASS  idempotency.DeriveUpdateStatusKey golden hex
PASS  idempotency.DeriveUpdateStatusKey delimiter safety

6 / 6 scenarios PASSED against LocalStack at http://localhost:4566
```

## Structure

```
harness/
├── README.md                       (this file)
├── localstack/
│   ├── docker-compose.yml          LocalStack v3 with DDB/S3/KMS/Secrets/SQS enabled
│   └── seed.sh                     Bootstrap: 7 DDB tables, 4 S3 buckets, KMS aliases, secrets
└── local-test-rig/
    ├── go.mod                      Imports libs/data-access/go via replace
    └── main.go                     Exercises 6 scenarios against LocalStack
```

## What it validates

This is the **Tier-2 test gate** from the readiness checklist — it sits between Tier-1 (unit tests, already 76/76 passing) and Tier-3 (sandbox-deployed integration tests, requires a real EKS cluster).

| Scenario | What it proves |
| --- | --- |
| `workspaces.Put+Get round-trip` | Full DDB attribute marshaling works against a real DDB-protocol implementation |
| `batches.Put+Get round-trip` | Same for the Batches schema |
| `documents.Put+Get round-trip` | Same for the Documents schema (with idempotency key) |
| `DeriveUpdateStatusKey deterministic` | Pure function returns identical hex over 100 invocations |
| `DeriveUpdateStatusKey golden hex` | 64-char hex digest produced for the canonical golden inputs |
| `DeriveUpdateStatusKey delimiter safety` | Adversarial `\x1f`-containing inputs do not collide (regression test for the bug caught in dev) |

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Docker (daemon accessible to your user) | any recent | Runs LocalStack |
| Docker Compose v2 | `docker compose` syntax | Brings up the container |
| Go | 1.23 | Builds + runs the test rig |
| `aws` CLI | any | seed.sh uses it to create resources via LocalStack endpoint |
| `curl` | any | Health-check loop |
| `bash` | any | seed.sh |

## Notes

- LocalStack accepts any credentials — `AWS_ACCESS_KEY_ID=test`, `AWS_SECRET_ACCESS_KEY=test` are baked into `seed.sh`.
- The container does **not** persist state between restarts (`PERSISTENCE=0`). Each `localstack-up` is a clean slate.
- The 4 S3 buckets are unused by the current test rig but provisioned for future tests that exercise S3-touching units (zip-extraction, output-assembly, etc.).
- Real AWS account `537462380503` is **NEVER** touched by this harness — all calls go to `http://localhost:4566`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `docker compose up` → permission denied | User not in `docker` group | `sudo usermod -aG docker $USER` + re-login, OR use `sudo docker compose ...` |
| `make localstack-bootstrap` hangs at "Waiting for LocalStack" | Docker is up but container isn't healthy yet | Wait 10-30s, check `docker logs docuploader-localstack` |
| Test rig fails with `connection refused` | LocalStack not running | Run `make localstack-up` first; verify with `curl http://localhost:4566/_localstack/health` |
| `Put` succeeds but `Get` returns `ErrNotFound` | Table doesn't exist | Run `make localstack-bootstrap` (creates tables first) |
| Test rig hangs | LocalStack process stuck | `make localstack-down` then `make localstack-up` |

## What this is NOT

- Not a sandbox AWS deployment (that's Tier-3 — needs the real DEV05 cluster)
- Not a performance benchmark (LocalStack is slower than real DDB; numbers aren't representative)
- Not a security test (LocalStack doesn't enforce IAM policies fully)
- Not a deployable artifact (only for testing the library, not for production)
