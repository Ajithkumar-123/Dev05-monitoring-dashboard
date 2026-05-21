# Integration Test Instructions

## Tier 2: LocalStack-backed integration

```bash
docker run -d --name localstack -p 4566:4566 \
  -e SERVICES=dynamodb,s3,sqs,sns,kms,events,states,iam,secretsmanager \
  -e DEBUG=0 \
  localstack/localstack:3
```

Seed Terraform resources against the LocalStack endpoint by setting `AWS_ENDPOINT_URL=http://localhost:4566` and running `terraform apply` in the platform units (the AWS provider honours the endpoint var). Then per-unit:

- **Go**: `AWS_ENDPOINT_URL=http://localhost:4566 go test -tags integration ./...`
- **Python**: `AWS_ENDPOINT_URL=http://localhost:4566 uv run pytest -m integration`
- **TypeScript**: `AWS_ENDPOINT_URL=http://localhost:4566 pnpm test -- integration`

### LocalStack coverage gaps (mock at SDK boundary)

- **Textract** — mocked in `ocr-service`
- **GuardDuty** — mocked in `document-event-handler-lambda`

## Tier 3: Sandbox-deployed integration

Real AWS in `eu-west-1`. Run the four MVP journey suites from `requirements.md`:

| Journey | Test fixture | Pass criterion |
| --- | --- | --- |
| J1: Tenant admin configures Workspace | `tests/journeys/j1-workspace-config.test.ts` | `createWorkspace` → `Workspace.status=ACTIVE`; per-tenant KMS alias exists; `Workspace.retentionPolicy.inputRetentionDays=7` (default) or per-call value |
| J2: End user uploads single document | `tests/journeys/j2-single-upload.test.ts` | `createBatch` + `createDocument` + presigned PUT → `Document.statusChanged` delivers every state transition → terminal `COMPLETED` with `outputs` populated |
| J3: End user uploads mixed-format batch | `tests/journeys/j3-mixed-batch.test.ts` | N documents started in parallel; per-document `pipelineStage` surfaces; CSV/ODS produce slipsheet with `nativeTrigger=SLIPSHEET`; ZIP/EMAIL produce child documents with parent linkage |
| J4: Compliance reviewer audits a workspace | `tests/journeys/j4-audit-feed.test.ts` | Synthetic mutation traffic produces matching DDB hot-store + S3 Glacier IR cold-store records; no DLQ accumulation |

## Contract tests

- **gRPC**: `buf breaking --against ssh://git@…#main` (or equivalent) on every `.proto` change
- **GraphQL**: `npm exec graphql-inspector diff` against the previously-deployed schema; CI fails on breaking changes outside a sunset window

## End-to-end gate

All four MVP journey suites must pass against the sandbox before sign-off.
