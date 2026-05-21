# email-extraction-service — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | aws-sdk-go-v2 (s3, sqs) + uuid; data-access library via replace |
| `cmd/server/main.go` | Entrypoint; IRSA AWS config; constructs handler with QueueURL/ClassificationQueueURL/StagingBucket |
| `internal/handler/handler.go` | Long-poll SQS, parse EML via Go stdlib (`net/mail` + `mime/multipart`), per-attachment PUT to staging + SendMessage to classification (child fan-out) |
| `helm/` | Chassis chart; 2 replicas; 500m/512Mi Guaranteed-QoS |

**MSG support stub**: full Compound File Binary Format parsing (`mscfb` + `crtf`) is on the test-authoring follow-on; the current handler routes MSG inputs to the `DocumentProcessingError` slipsheet branch implicitly via parse failure.
