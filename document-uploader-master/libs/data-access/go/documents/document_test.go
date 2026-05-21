package documents

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
)

func TestDocument_AttributevalueRoundtrip(t *testing.T) {
	now := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	original := &Document{
		DocumentID:     "doc-001",
		TenantID:       "tenant-a",
		WorkspaceID:    "ws-001",
		BatchID:        "batch-001",
		Status:         StatusProcessing,
		PipelineStage:  "convert",
		IdempotencyKey: "deadbeef",
		Outputs: []Output{
			{Type: "searchable-pdf", S3Key: "doc-001/searchable.pdf"},
			{Type: "text", S3Key: "doc-001/text.txt", Trigger: "NATIVE"},
		},
		ProcessingError: &ProcessingError{
			Code:      "CONVERT_FAILED",
			Message:   "Aspose threw a renderer exception",
			Retryable: false,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	item, err := attributevalue.MarshalMap(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var round Document
	if err := attributevalue.UnmarshalMap(item, &round); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if round.DocumentID != original.DocumentID || round.IdempotencyKey != original.IdempotencyKey {
		t.Errorf("scalar drift: documentId=%q idempotencyKey=%q", round.DocumentID, round.IdempotencyKey)
	}
	if len(round.Outputs) != 2 {
		t.Fatalf("outputs len: got %d want 2", len(round.Outputs))
	}
	if round.Outputs[1].Trigger != "NATIVE" {
		t.Errorf("output Trigger drift: got %q", round.Outputs[1].Trigger)
	}
	if round.ProcessingError == nil || round.ProcessingError.Code != "CONVERT_FAILED" {
		t.Errorf("processingError drift: %+v", round.ProcessingError)
	}
	if round.ProcessingError.Retryable != false {
		t.Errorf("Retryable boolean drifted")
	}
}

func TestStatusLifecycleConstants(t *testing.T) {
	// Pin the full status set from application-design.md § Document.statusChanged.
	want := []Status{
		StatusUploaded, StatusScanning, StatusQueued,
		StatusProcessing, StatusCompleted, StatusFailed,
	}
	got := []string{"UPLOADED", "SCANNING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"}
	for i, s := range want {
		if string(s) != got[i] {
			t.Errorf("status[%d] drift: got %q want %q", i, s, got[i])
		}
	}
}

func TestTableNameAndIndexAreBinding(t *testing.T) {
	if TableName != "docuploader-api-documents" {
		t.Errorf("TableName drift: %q", TableName)
	}
	if IdempotencyIndexName != "idempotency-index" {
		t.Errorf("IdempotencyIndexName drift: %q", IdempotencyIndexName)
	}
}

func TestNilProcessingErrorRoundtrip(t *testing.T) {
	// A COMPLETED document carries no processingError; the field is omitempty.
	original := &Document{
		DocumentID:     "doc-002",
		TenantID:       "tenant-a",
		WorkspaceID:    "ws-001",
		BatchID:        "batch-001",
		Status:         StatusCompleted,
		IdempotencyKey: "deadbeef-2",
	}
	item, err := attributevalue.MarshalMap(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var round Document
	if err := attributevalue.UnmarshalMap(item, &round); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if round.ProcessingError != nil {
		t.Errorf("processingError should be nil for completed docs; got %+v", round.ProcessingError)
	}
}
