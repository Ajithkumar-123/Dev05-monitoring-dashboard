package contenthashes

import (
	"testing"
	"time"
)

func TestTTLForHash_Is90DaysOut(t *testing.T) {
	seenAt := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	want := seenAt.AddDate(0, 0, 90).Unix()
	if got := TTLForHash(seenAt); got != want {
		t.Errorf("TTLForHash drift: got %d want %d", got, want)
	}
}

func TestTableNameIsBinding(t *testing.T) {
	if TableName != "docuploader-content-hashes" {
		t.Errorf("TableName drift: %q", TableName)
	}
}
