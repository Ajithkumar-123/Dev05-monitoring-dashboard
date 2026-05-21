// Package handler routes EventBridge events to either Step Functions
// (clean upload) or a documents-table status update (malware finding).
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
)

type StateMachineClient interface {
	StartExecution(ctx context.Context, params *sfn.StartExecutionInput, optFns ...func(*sfn.Options)) (*sfn.StartExecutionOutput, error)
}

type Handler struct {
	documents       *documents.Client
	sfn             StateMachineClient
	stateMachineArn string
	logger          *slog.Logger
}

func New(d *documents.Client, s StateMachineClient, arn string, l *slog.Logger) *Handler {
	return &Handler{documents: d, sfn: s, stateMachineArn: arn, logger: l}
}

type s3PutDetail struct {
	Bucket struct {
		Name string `json:"name"`
	} `json:"bucket"`
	Object struct {
		Key string `json:"key"`
	} `json:"object"`
}

type gdMalwareDetail struct {
	S3ObjectDetails struct {
		BucketName string `json:"bucketName"`
		ObjectKey  string `json:"objectKey"`
	} `json:"s3ObjectDetails"`
	ScanResultDetails struct {
		ScanResultStatus string `json:"scanResultStatus"` // NO_THREATS_FOUND | THREATS_FOUND | UNSUPPORTED | ACCESS_DENIED
	} `json:"scanResultDetails"`
}

func (h *Handler) Handle(ctx context.Context, event events.EventBridgeEvent) error {
	switch event.DetailType {
	case "Object Created":
		return h.handleS3Put(ctx, event)
	case "GuardDuty Malware Protection Object Scan Result":
		return h.handleGuardDuty(ctx, event)
	default:
		h.logger.Warn("unknown detail-type", "detailType", event.DetailType)
		return nil
	}
}

// handleS3Put is a no-op pre-scan: the design defers execution start to the
// GuardDuty NO_THREATS_FOUND finding. We log the put for trace continuity.
func (h *Handler) handleS3Put(_ context.Context, event events.EventBridgeEvent) error {
	var d s3PutDetail
	if err := json.Unmarshal(event.Detail, &d); err != nil {
		return err
	}
	h.logger.Info("s3 put observed", "bucket", d.Bucket.Name, "key", d.Object.Key)
	return nil
}

func (h *Handler) handleGuardDuty(ctx context.Context, event events.EventBridgeEvent) error {
	var d gdMalwareDetail
	if err := json.Unmarshal(event.Detail, &d); err != nil {
		return err
	}
	documentID := extractDocumentID(d.S3ObjectDetails.ObjectKey)

	switch d.ScanResultDetails.ScanResultStatus {
	case "NO_THREATS_FOUND":
		_, err := h.sfn.StartExecution(ctx, &sfn.StartExecutionInput{
			StateMachineArn: aws.String(h.stateMachineArn),
			Name:            aws.String(fmt.Sprintf("doc-%s-%d", documentID, time.Now().UnixNano())),
			Input:           aws.String(fmt.Sprintf(`{"documentId":%q,"s3Bucket":%q,"s3Key":%q}`, documentID, d.S3ObjectDetails.BucketName, d.S3ObjectDetails.ObjectKey)),
		})
		if err != nil {
			return fmt.Errorf("start execution: %w", err)
		}
		h.logger.Info("execution started", "documentId", documentID)
		return nil

	case "THREATS_FOUND":
		h.logger.Warn("malware detected; aborting pipeline entry", "documentId", documentID)
		// Mark the document as FAILED with a non-retryable processing error.
		doc, err := h.documents.Get(ctx, documentID)
		if err != nil {
			return err
		}
		doc.Status = documents.StatusFailed
		doc.UpdatedAt = time.Now().UTC()
		doc.ProcessingError = &documents.ProcessingError{
			Code:      "MALWARE_DETECTED",
			Message:   "GuardDuty Malware Protection finding",
			Retryable: false,
		}
		return h.documents.Put(ctx, doc)

	default:
		h.logger.Info("guardduty result not actioned", "status", d.ScanResultDetails.ScanResultStatus, "documentId", documentID)
		return nil
	}
}

// extractDocumentID parses the canonical S3 key shape `<tenantId>/<batchId>/<documentId>`.
func extractDocumentID(key string) string {
	for i := len(key) - 1; i >= 0; i-- {
		if key[i] == '/' {
			return key[i+1:]
		}
	}
	return key
}
