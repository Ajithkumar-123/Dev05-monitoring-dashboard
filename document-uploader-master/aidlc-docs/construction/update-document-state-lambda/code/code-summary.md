# update-document-state-lambda — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | aws-lambda-go + AWS SDK v2 + data-access |
| `cmd/bootstrap/main.go` | Lambda entrypoint with `provided.al2023` bootstrap pattern; init() loads AWS config and instantiates handler |
| `internal/handler/handler.go` | Drains `state-change-notification-queue` with `ReportBatchItemFailures`; derives `(executionId, toState, phase)` → SHA-256 idempotency key via `libs/data-access/go/internal/idempotency`; FindByIdempotencyKey short-circuits retries; otherwise Get → mutate → Put on `docuploader-api-documents` |

**Wiring**: SQS event source mapping on `docuploader-state-change-notification-queue`; IAM role `docuploader-update-document-state-lambda` (sqs:* on the state-change queue + documents table CRUD + GSI Query).

**Build**: `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/bootstrap`
