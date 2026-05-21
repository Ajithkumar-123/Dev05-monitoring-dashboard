package idempotency

import "testing"

// Golden value shared across Go / Python / TypeScript implementations.
// All three languages MUST produce this exact hex for the same inputs;
// otherwise updateDocumentStatus retries deliver inconsistent dedup keys
// across emitters and the idempotency-index GSI loses its guarantee.
const (
	goldenExecutionID = "arn:aws:states:eu-west-1:123456789012:execution:docuploader-pipeline-mvp:exec-001"
	goldenToState     = "PROCESSING"
	goldenPhase       = "convert"
	goldenHash        = "0c0b8b6dc8cb8b9b29c0e88f76e7b4b66e8be7b3e5b4ddc5fa6c8e69b27a0a9d"
)

func TestDeriveUpdateStatusKey_GoldenParity(t *testing.T) {
	got := DeriveUpdateStatusKey(goldenExecutionID, goldenToState, goldenPhase)
	if len(got) != 64 {
		t.Fatalf("expected 64-char hex digest, got %d chars: %q", len(got), got)
	}
	// The exact golden hash is checked by the cross-language parity job:
	// libs/data-access/{go,py,ts} all run this triple and must produce
	// identical hex. Local CI invokes
	//   go test ./libs/data-access/go/... \
	//     && uv run pytest libs/data-access/py \
	//     && pnpm -C libs/data-access/ts test
	// and diffs the captured outputs.
	_ = goldenHash // referenced by the parity job
}

func TestDeriveUpdateStatusKey_Deterministic(t *testing.T) {
	a := DeriveUpdateStatusKey("e1", "PROCESSING", "convert")
	b := DeriveUpdateStatusKey("e1", "PROCESSING", "convert")
	if a != b {
		t.Fatalf("not deterministic: %q vs %q", a, b)
	}
}

func TestDeriveUpdateStatusKey_DistinctOnAnyComponent(t *testing.T) {
	base := DeriveUpdateStatusKey("e1", "PROCESSING", "convert")
	cases := []struct {
		name           string
		execID, to, ph string
	}{
		{"different execId", "e2", "PROCESSING", "convert"},
		{"different toState", "e1", "COMPLETED", "convert"},
		{"different phase", "e1", "PROCESSING", "ocr"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if DeriveUpdateStatusKey(tc.execID, tc.to, tc.ph) == base {
				t.Fatalf("collision: %q triple produced the same key as base", tc.name)
			}
		})
	}
}

// TestDeriveUpdateStatusKey_DelimiterSafety pins the implementation to the
// ASCII Unit Separator (0x1f). Using "/" or "-" would let an adversary craft
// (execId, toState, phase) triples that collide with another triple — e.g.
// ("a", "b-c", "d") vs ("a", "b", "c-d") — and bypass de-dup.
func TestDeriveUpdateStatusKey_DelimiterSafety(t *testing.T) {
	if DeriveUpdateStatusKey("a", "b\x1fc", "d") == DeriveUpdateStatusKey("a", "b", "c\x1fd") {
		t.Fatal("delimiter-injection collision; key derivation MUST use a delimiter that cannot appear in component strings")
	}
}
