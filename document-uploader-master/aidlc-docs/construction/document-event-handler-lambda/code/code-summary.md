# document-event-handler-lambda — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; `aws-lambda-go`, AWS SDK v2 (sfn), data-access library |
| `cmd/bootstrap/main.go` | Lambda entrypoint; init() loads AWS config, instantiates handler with sfn + documents data-access client + `STATE_MACHINE_ARN` env |
| `internal/handler/handler.go` | EventBridge event demux: `Object Created` (S3 PutObject) logs trace continuity; `GuardDuty Malware Protection Object Scan Result` starts Step Functions execution on `NO_THREATS_FOUND` and marks document `FAILED` (non-retryable) on `THREATS_FOUND`. Document ID extracted from canonical S3 key shape `<tenantId>/<batchId>/<documentId>` |

**Wiring**: IAM role `docuploader-document-event-handler-lambda` (states:StartExecution + dynamodb on documents); EventBridge bus `docuploader-api-events`; state machine ARN from `platform-orchestration` output; this unit's Terraform owns the EventBridge target resources (`aws_cloudwatch_event_target` against the rules created in platform-orchestration).

**Notable behaviour**:
- S3 PutObject is observed-only; Step Functions execution is deferred to the matching GuardDuty `NO_THREATS_FOUND` finding (matches design Journey 2)
- Execution name encodes documentId + nanosecond timestamp for uniqueness; idempotency on Step Functions side is execution-name-based
- Malware findings short-circuit pipeline entry and write a terminal `FAILED` status with `MALWARE_DETECTED` non-retryable error code

**Build**: `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/bootstrap`
