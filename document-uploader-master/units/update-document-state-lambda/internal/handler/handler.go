// Package handler drains the state-change-notification-queue and applies the
// new state to the documents table. Idempotency key is derived from
// (executionId, toState, phase); idempotency-index GSI de-duplicates retries.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
	"github.com/opus2/docuploader/libs/data-access/go/idempotency"
)

type Handler struct {
	docs   *documents.Client
	logger *slog.Logger
}

func New(d *documents.Client, l *slog.Logger) *Handler {
	return &Handler{docs: d, logger: l}
}

type notification struct {
	DocumentID  string `json:"documentId"`
	ToState     string `json:"toState"`
	Phase       string `json:"phase"`
	ExecutionID string `json:"executionId"`
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
	var n notification
	if err := json.Unmarshal([]byte(body), &n); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	if n.DocumentID == "" || n.ToState == "" {
		return fmt.Errorf("missing required fields")
	}
	key := idempotency.DeriveUpdateStatusKey(n.ExecutionID, n.ToState, n.Phase)

	// Idempotency hit short-circuit.
	if existing, err := h.docs.FindByIdempotencyKey(ctx, key); err == nil && existing.DocumentID == n.DocumentID {
		return nil
	}

	doc, err := h.docs.Get(ctx, n.DocumentID)
	if err != nil {
		return err
	}
	doc.Status = documents.Status(n.ToState)
	doc.PipelineStage = n.Phase
	doc.IdempotencyKey = key
	doc.UpdatedAt = time.Now().UTC()
	if err := h.docs.Put(ctx, doc); err != nil {
		return fmt.Errorf("persist: %w", err)
	}
	h.logger.Info("document state updated", "documentId", n.DocumentID, "toState", n.ToState, "phase", n.Phase)
	return nil
}
