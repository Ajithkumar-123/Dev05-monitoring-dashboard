package handler

import (
	"testing"

	"github.com/opus2/docuploader/libs/data-access/go/documents"
)

// Forward-only status transitions per NFR-2 / application-design.md:
// UPLOADED -> SCANNING -> QUEUED -> PROCESSING -> COMPLETED is the canonical
// happy path; FAILED is reachable from any non-terminal state; no backward
// transitions allowed.
func TestLegalTransition_ForwardOnly(t *testing.T) {
	forward := []struct {
		from, to documents.Status
		want     bool
	}{
		{documents.StatusUploaded, documents.StatusScanning, true},
		{documents.StatusScanning, documents.StatusQueued, true},
		{documents.StatusQueued, documents.StatusProcessing, true},
		{documents.StatusProcessing, documents.StatusCompleted, true},
		// Skipping intermediate states is allowed (e.g. UPLOADED -> COMPLETED
		// during a clean-path replay that emits the terminal Notify_X first).
		{documents.StatusUploaded, documents.StatusCompleted, true},
	}
	for _, tc := range forward {
		if got := legalTransition(tc.from, tc.to); got != tc.want {
			t.Errorf("legalTransition(%q, %q) = %v; want %v", tc.from, tc.to, got, tc.want)
		}
	}
}

func TestLegalTransition_BackwardRejected(t *testing.T) {
	backward := []struct{ from, to documents.Status }{
		{documents.StatusScanning, documents.StatusUploaded},
		{documents.StatusProcessing, documents.StatusQueued},
		{documents.StatusCompleted, documents.StatusProcessing},
	}
	for _, tc := range backward {
		if legalTransition(tc.from, tc.to) {
			t.Errorf("legalTransition(%q, %q) accepted a backward transition", tc.from, tc.to)
		}
	}
}

func TestLegalTransition_FailedIsTerminalSink(t *testing.T) {
	// FAILED is reachable from any non-terminal state.
	for _, from := range []documents.Status{
		documents.StatusUploaded,
		documents.StatusScanning,
		documents.StatusQueued,
		documents.StatusProcessing,
	} {
		if !legalTransition(from, documents.StatusFailed) {
			t.Errorf("FAILED should be reachable from %q", from)
		}
	}
	// FAILED -> FAILED and COMPLETED -> FAILED are NOT allowed
	// (terminal states do not re-transition).
	if legalTransition(documents.StatusFailed, documents.StatusFailed) {
		t.Error("FAILED -> FAILED should be rejected")
	}
	if legalTransition(documents.StatusCompleted, documents.StatusFailed) {
		t.Error("COMPLETED -> FAILED should be rejected (completed is terminal)")
	}
}

func TestLegalTransition_RejectsUnknownStatus(t *testing.T) {
	// Unknown statuses must be rejected. This guards against schema drift
	// between resolver versions during a rolling deploy.
	if legalTransition("UPLOADED", "WAT") {
		t.Error("transitions to unknown status should be rejected")
	}
	if legalTransition("WAT", "PROCESSING") {
		t.Error("transitions from unknown status should be rejected")
	}
}
