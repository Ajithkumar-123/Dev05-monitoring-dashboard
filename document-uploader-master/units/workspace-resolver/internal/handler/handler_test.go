package handler

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/opus2/docuploader/libs/data-access/go/workspaces"
	pb "github.com/opus2/docuploader/units/workspace-resolver/proto/workspacev1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type fakeKMS struct {
	mu      sync.Mutex
	aliases []string
}

func (f *fakeKMS) CreateAlias(ctx context.Context, params *kms.CreateAliasInput, _ ...func(*kms.Options)) (*kms.CreateAliasOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.aliases = append(f.aliases, *params.AliasName)
	return &kms.CreateAliasOutput{}, nil
}

// fakeWorkspaceStore is an in-memory stand-in for workspaces.Client. We can't
// stub the *workspaces.Client struct directly (no exported interface), so the
// tests focus on contract-level invariants the gRPC layer enforces *before*
// touching the data-access path: tenancy resolution, idempotency-key
// validation, NotFound mapping. Full data-access round-trip is exercised by
// libs/data-access/go/workspaces/workspace_test.go.
type fakeWorkspaceStore struct {
	mu    sync.Mutex
	items map[string]map[string]any // workspaceId -> marshalled item
}

func newFakeStore() *fakeWorkspaceStore {
	return &fakeWorkspaceStore{items: map[string]map[string]any{}}
}

func newHandlerWithStore(t *testing.T, store *fakeWorkspaceStore) (*Handler, *fakeKMS) {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	f := &fakeKMS{}
	// Use a workspaces.Client constructed against a nil ddb. We intercept
	// only the parts of the handler that don't actually call ddb in these
	// contract tests (CreateWorkspace fails before Put if validation fails;
	// GetWorkspace short-circuits on the workspace_id check).
	h := New(workspaces.NewClient(nil), f, logger)
	_ = store // store kept available for future tests that wire in a fake ddb
	return h, f
}

func TestCreateWorkspace_RequiresTenantInContext(t *testing.T) {
	h, _ := newHandlerWithStore(t, newFakeStore())
	_, err := h.CreateWorkspace(context.Background(), &pb.CreateWorkspaceRequest{IdempotencyKey: "k1"})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("want Unauthenticated; got %v", err)
	}
}

func TestCreateWorkspace_RequiresIdempotencyKey(t *testing.T) {
	h, _ := newHandlerWithStore(t, newFakeStore())
	ctx := WithTenantID(context.Background(), "tenant-a")
	_, err := h.CreateWorkspace(ctx, &pb.CreateWorkspaceRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument; got %v", err)
	}
}

func TestGetWorkspace_RequiresWorkspaceID(t *testing.T) {
	h, _ := newHandlerWithStore(t, newFakeStore())
	_, err := h.GetWorkspace(context.Background(), &pb.GetWorkspaceRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument; got %v", err)
	}
}

func TestUpdateWorkspace_RequiresBothIDAndIdempotencyKey(t *testing.T) {
	h, _ := newHandlerWithStore(t, newFakeStore())
	// Missing workspace_id
	_, err := h.UpdateWorkspace(context.Background(), &pb.UpdateWorkspaceRequest{IdempotencyKey: "k1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (missing workspace_id); got %v", err)
	}
	// Missing idempotency_key
	_, err = h.UpdateWorkspace(context.Background(), &pb.UpdateWorkspaceRequest{WorkspaceId: "ws-1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (missing idempotency_key); got %v", err)
	}
}

func TestPBToPipelineConfig_DefaultsForcedSlipsheet(t *testing.T) {
	// nil → default csv,ods
	pc := pbToPipelineConfig(nil)
	if len(pc.ForcedSlipsheetExtensions) != 2 ||
		pc.ForcedSlipsheetExtensions[0] != "csv" || pc.ForcedSlipsheetExtensions[1] != "ods" {
		t.Errorf("nil pb default drift: %v", pc.ForcedSlipsheetExtensions)
	}
	// empty list → default csv,ods (per FR-2.10)
	pc = pbToPipelineConfig(&pb.PipelineConfig{})
	if len(pc.ForcedSlipsheetExtensions) != 2 {
		t.Errorf("empty pb default drift: %v", pc.ForcedSlipsheetExtensions)
	}
	// explicit override propagates
	pc = pbToPipelineConfig(&pb.PipelineConfig{ForcedSlipsheetExtensions: []string{"xls"}})
	if len(pc.ForcedSlipsheetExtensions) != 1 || pc.ForcedSlipsheetExtensions[0] != "xls" {
		t.Errorf("override drift: %v", pc.ForcedSlipsheetExtensions)
	}
}

func TestPBToRetentionPolicy_DefaultsTo7Days(t *testing.T) {
	// nil → default 7 days (per FR-3.3)
	if rp := pbToRetentionPolicy(nil); rp.InputRetentionDays != 7 {
		t.Errorf("nil pb default drift: %d", rp.InputRetentionDays)
	}
	// explicit propagates
	if rp := pbToRetentionPolicy(&pb.RetentionPolicy{InputRetentionDays: 30}); rp.InputRetentionDays != 30 {
		t.Errorf("override drift: %d", rp.InputRetentionDays)
	}
}

func TestWorkspaceToPB_RoundtripsViaAttributevalue(t *testing.T) {
	// Compile-time sanity: workspaces.Workspace marshals via attributevalue,
	// and our handler converts both directions. Verify the pb shape is
	// well-formed (all required fields present).
	ws := &workspaces.Workspace{
		WorkspaceID:      "ws-1",
		TenantID:         "tenant-a",
		Status:           workspaces.StatusActive,
		RetentionPolicy:  workspaces.RetentionPolicy{InputRetentionDays: 14},
		EncryptionConfig: workspaces.EncryptionConfig{KmsAliasName: "alias/docuploader-tenant-ws-1"},
		PipelineConfig:   workspaces.PipelineConfig{ForcedSlipsheetExtensions: []string{"csv", "ods", "xls"}},
	}
	p := workspaceToPB(ws)
	if p.WorkspaceId != "ws-1" || p.TenantId != "tenant-a" || p.Status != "ACTIVE" {
		t.Errorf("scalar drift: %+v", p)
	}
	if p.RetentionPolicy.InputRetentionDays != 14 {
		t.Errorf("retention drift: %d", p.RetentionPolicy.InputRetentionDays)
	}
	if len(p.PipelineConfig.ForcedSlipsheetExtensions) != 3 {
		t.Errorf("forced-slipsheet drift: %v", p.PipelineConfig.ForcedSlipsheetExtensions)
	}

	// Compile-time sanity: data-access round-trip still works after the
	// gRPC refactor (nothing in the handler should affect the entity struct).
	item, err := attributevalue.MarshalMap(ws)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var round workspaces.Workspace
	if err := attributevalue.UnmarshalMap(item, &round); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if round.WorkspaceID != ws.WorkspaceID {
		t.Errorf("data-access round-trip broke")
	}
}
