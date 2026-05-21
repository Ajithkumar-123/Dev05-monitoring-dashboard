package tasktokens

import (
	"testing"
	"time"
)

func TestTTLForToken_Is1DayOut(t *testing.T) {
	createdAt := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	want := createdAt.AddDate(0, 0, 1).Unix()
	if got := TTLForToken(createdAt); got != want {
		t.Errorf("TTLForToken drift: got %d want %d", got, want)
	}
}

func TestTableNameIsBinding(t *testing.T) {
	if TableName != "textract-task-tokens" {
		t.Errorf("TableName drift: %q", TableName)
	}
}
