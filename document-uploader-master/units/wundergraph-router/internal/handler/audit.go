// Package handler implements the router-side audit-emission middleware.
//
// One SQS message per state-changing mutation is dispatched, including caller
// identity (user, workspace, tenant), request id, idempotency key, and
// mutation payload. Redaction strips presigned URLs / OIDC tokens / data keys
// / document content / PII metadata per AUDIT_REDACTION_FIELDS before sending.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/google/uuid"
)

type SQSSender interface {
	SendMessage(ctx context.Context, params *sqs.SendMessageInput, optFns ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
}

type AuditEmitter struct {
	sqs       SQSSender
	queueURL  string
	redaction map[string]struct{}
	logger    *slog.Logger
}

type AuditEvent struct {
	EventID        string         `json:"eventId"`
	TenantID       string         `json:"tenantId"`
	WorkspaceID    string         `json:"workspaceId"`
	UserID         string         `json:"userId"`
	RequestID      string         `json:"requestId"`
	IdempotencyKey string         `json:"idempotencyKey,omitempty"`
	Mutation       string         `json:"mutation"`
	Payload        map[string]any `json:"payload"`
	OccurredAt     time.Time      `json:"occurredAt"`
	SchemaVersion  int            `json:"schemaVersion"`
}

func NewAuditEmitter(s SQSSender, queueURL string, redactionFields []string, l *slog.Logger) *AuditEmitter {
	red := make(map[string]struct{}, len(redactionFields))
	for _, f := range redactionFields {
		if f != "" {
			red[f] = struct{}{}
		}
	}
	return &AuditEmitter{sqs: s, queueURL: queueURL, redaction: red, logger: l}
}

// Emit redacts the event payload then dispatches one SQS message.
func (e *AuditEmitter) Emit(ctx context.Context, event AuditEvent) error {
	if event.EventID == "" {
		event.EventID = uuid.NewString()
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	if event.SchemaVersion == 0 {
		event.SchemaVersion = 1
	}
	event.Payload = e.redact(event.Payload)

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	_, err = e.sqs.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    aws.String(e.queueURL),
		MessageBody: aws.String(string(body)),
	})
	return err
}

func (e *AuditEmitter) redact(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		if _, banned := e.redaction[k]; banned {
			continue
		}
		if sub, ok := v.(map[string]any); ok {
			out[k] = e.redact(sub)
			continue
		}
		out[k] = v
	}
	return out
}
