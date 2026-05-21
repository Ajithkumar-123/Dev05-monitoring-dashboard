package pipelinefiles

import (
	"testing"
	"time"
)

func TestTTLForFile_Is7DaysOut(t *testing.T) {
	createdAt := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	want := createdAt.AddDate(0, 0, 7).Unix()
	if got := TTLForFile(createdAt); got != want {
		t.Errorf("TTLForFile drift: got %d want %d", got, want)
	}
}

func TestTableNameAndIndexAreBinding(t *testing.T) {
	if TableName != "docuploader-pipeline-files" {
		t.Errorf("TableName drift: %q", TableName)
	}
	if FolderPathIndexName != "folderPath-index" {
		t.Errorf("FolderPathIndexName drift: %q", FolderPathIndexName)
	}
}
