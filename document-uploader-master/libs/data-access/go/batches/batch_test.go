package batches

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
)

func TestBatch_AttributevalueRoundtrip(t *testing.T) {
	now := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	original := &Batch{
		BatchID:     "batch-001",
		TenantID:    "tenant-a",
		WorkspaceID: "ws-001",
		Status:      StatusOpen,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	item, err := attributevalue.MarshalMap(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var round Batch
	if err := attributevalue.UnmarshalMap(item, &round); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if round.BatchID != original.BatchID || round.TenantID != original.TenantID ||
		round.WorkspaceID != original.WorkspaceID || round.Status != original.Status {
		t.Errorf("scalar fields drifted: got %+v want %+v", round, original)
	}
	if !round.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt drift: got %v want %v", round.CreatedAt, original.CreatedAt)
	}
}

func TestTableNameIsBinding(t *testing.T) {
	if TableName != "docuploader-api-batches" {
		t.Fatalf("TableName drift: got %q", TableName)
	}
}

func TestStatusConstants(t *testing.T) {
	// Pin the only legal batch statuses per the application-design state machine.
	if StatusOpen != "OPEN" || StatusClosed != "CLOSED" {
		t.Errorf("status constants drifted: open=%q closed=%q", StatusOpen, StatusClosed)
	}
}
