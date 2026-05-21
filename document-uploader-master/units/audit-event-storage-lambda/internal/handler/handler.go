// Package handler drains docuploader-api-audit-events SQS and dual-sinks each
// record into the DynamoDB hot store (90-day TTL) and S3 Glacier IR cold store
// (Object Lock Compliance, 7-year default).
//
// Partial-batch failures are reported via SQSEventResponse so messages that
// failed either sink are redriven via SQS retry policy and eventually move to
// the DLQ on exhaustion.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/opus2/docuploader/libs/data-access/go/auditevents"
)

type S3PutClient interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

type Handler struct {
	events        *auditevents.Client
	s3            S3PutClient
	archiveBucket string
	logger        *slog.Logger
}

func New(e *auditevents.Client, s S3PutClient, bucket string, l *slog.Logger) *Handler {
	return &Handler{events: e, s3: s, archiveBucket: bucket, logger: l}
}

func (h *Handler) Handle(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	var resp events.SQSEventResponse
	for _, msg := range event.Records {
		if err := h.handleOne(ctx, msg.Body); err != nil {
			h.logger.Warn("partial batch failure", "messageId", msg.MessageId, "error", err)
			resp.BatchItemFailures = append(resp.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: msg.MessageId})
		}
	}
	return resp, nil
}

func (h *Handler) handleOne(ctx context.Context, body string) error {
	var event auditevents.AuditEvent
	if err := json.Unmarshal([]byte(body), &event); err != nil {
		return fmt.Errorf("decode body: %w", err)
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}

	// Hot store (DynamoDB with 90-day TTL).
	if err := h.events.Put(ctx, &event); err != nil {
		return fmt.Errorf("hot store put: %w", err)
	}

	// Cold store (Glacier IR with Object Lock Compliance).
	body2, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("encode for cold store: %w", err)
	}
	key := fmt.Sprintf("audit/%s/%s/%s.json",
		event.TenantID,
		event.OccurredAt.Format("2006/01/02"),
		event.EventID,
	)
	_, err = h.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.archiveBucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body2),
		ContentType: aws.String("application/json"),
		// Object Lock retention is set at bucket-level (Compliance mode,
		// 7-year default); per-object overrides require ChangeRetention API.
	})
	if err != nil {
		// Don't unwind the hot-store write — the SQS retry will reattempt
		// both sinks and the hot-store write is idempotent on eventId.
		return fmt.Errorf("cold store put: %w", err)
	}
	_ = types.ObjectLockModeCompliance // ensure import retained for future override flow
	return nil
}
