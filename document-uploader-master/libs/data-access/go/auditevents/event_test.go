package auditevents

import (
	"testing"
	"time"
)

func TestTTLForEvent_Is90DaysOut(t *testing.T) {
	occurredAt := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	expiresAt := TTLForEvent(occurredAt)
	want := occurredAt.AddDate(0, 0, 90).Unix()
	if expiresAt != want {
		t.Errorf("TTLForEvent drift: got %d want %d", expiresAt, want)
	}
}

func TestTTLForEvent_Deterministic(t *testing.T) {
	t0 := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	if TTLForEvent(t0) != TTLForEvent(t0) {
		t.Error("TTLForEvent is not deterministic")
	}
}

func TestTableNameIsBinding(t *testing.T) {
	if TableName != "docuploader-api-audit-events" {
		t.Errorf("TableName drift: %q", TableName)
	}
}
