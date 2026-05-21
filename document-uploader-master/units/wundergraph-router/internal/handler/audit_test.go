package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

// fakeSQS captures sent messages for inspection.
type fakeSQS struct {
	mu   sync.Mutex
	sent []sqs.SendMessageInput
}

func (f *fakeSQS) SendMessage(ctx context.Context, params *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, *params)
	return &sqs.SendMessageOutput{}, nil
}

func newEmitter(t *testing.T) (*AuditEmitter, *fakeSQS) {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	fs := &fakeSQS{}
	emitter := NewAuditEmitter(fs, "https://sqs.test/audit", []string{
		"presignedUrl", "oidcToken", "documentBytes", "piiMetadata",
	}, logger)
	return emitter, fs
}

func decodeLast(t *testing.T, fs *fakeSQS) AuditEvent {
	t.Helper()
	if len(fs.sent) == 0 {
		t.Fatal("no SQS sends captured")
	}
	body := *fs.sent[len(fs.sent)-1].MessageBody
	var ev AuditEvent
	if err := json.Unmarshal([]byte(body), &ev); err != nil {
		t.Fatalf("decode emitted body: %v", err)
	}
	return ev
}

func TestEmit_StripsTopLevelNeverLogFields(t *testing.T) {
	emitter, fs := newEmitter(t)
	err := emitter.Emit(context.Background(), AuditEvent{
		TenantID: "t1", Mutation: "createDocument",
		Payload: map[string]any{
			"filename":     "report.pdf",
			"presignedUrl": "https://s3/...?X-Amz-Signature=secret",
			"oidcToken":    "eyJ...",
		},
	})
	if err != nil {
		t.Fatalf("emit: %v", err)
	}
	ev := decodeLast(t, fs)
	if _, ok := ev.Payload["presignedUrl"]; ok {
		t.Error("presignedUrl leaked into emitted payload")
	}
	if _, ok := ev.Payload["oidcToken"]; ok {
		t.Error("oidcToken leaked into emitted payload")
	}
	if ev.Payload["filename"] != "report.pdf" {
		t.Error("non-redacted fields were dropped")
	}
}

// TestEmit_StripsNestedNeverLogFields pins the recursive redaction property.
// Without recursive redaction, a payload like {"document": {"documentBytes": …}}
// would leak document content into the audit feed.
func TestEmit_StripsNestedNeverLogFields(t *testing.T) {
	emitter, fs := newEmitter(t)
	err := emitter.Emit(context.Background(), AuditEvent{
		TenantID: "t1", Mutation: "updateDocumentStatus",
		Payload: map[string]any{
			"document": map[string]any{
				"id":            "doc-001",
				"documentBytes": "Q29uZmlkZW50aWFsIGNvbnRlbnQ=",
				"metadata": map[string]any{
					"author":      "user-1",
					"piiMetadata": "passport: 1234",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("emit: %v", err)
	}
	ev := decodeLast(t, fs)
	doc := ev.Payload["document"].(map[string]any)
	if _, ok := doc["documentBytes"]; ok {
		t.Error("documentBytes leaked at nesting depth 1")
	}
	meta := doc["metadata"].(map[string]any)
	if _, ok := meta["piiMetadata"]; ok {
		t.Error("piiMetadata leaked at nesting depth 2")
	}
	if meta["author"] != "user-1" {
		t.Error("non-redacted nested fields were dropped")
	}
}

func TestEmit_PopulatesDefaults(t *testing.T) {
	emitter, fs := newEmitter(t)
	err := emitter.Emit(context.Background(), AuditEvent{TenantID: "t1", Mutation: "createBatch"})
	if err != nil {
		t.Fatalf("emit: %v", err)
	}
	ev := decodeLast(t, fs)
	if ev.EventID == "" {
		t.Error("EventID should be defaulted to a fresh UUID")
	}
	if ev.OccurredAt.IsZero() {
		t.Error("OccurredAt should be defaulted to time.Now()")
	}
	if ev.SchemaVersion == 0 {
		t.Error("SchemaVersion should be defaulted to 1")
	}
}
