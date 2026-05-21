package handler

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/opus2/docuploader/libs/data-access/go/batches"
	pb "github.com/opus2/docuploader/units/batch-resolver/proto/batchv1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func newHandler() *Handler {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	return New(batches.NewClient(nil), logger)
}

func TestCreateBatch_RequiresTenantContext(t *testing.T) {
	h := newHandler()
	_, err := h.CreateBatch(context.Background(), &pb.CreateBatchRequest{
		WorkspaceId: "ws-1", IdempotencyKey: "k1",
	})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("want Unauthenticated; got %v", err)
	}
}

func TestCreateBatch_RequiresWorkspaceID(t *testing.T) {
	h := newHandler()
	ctx := WithTenantID(context.Background(), "tenant-a")
	_, err := h.CreateBatch(ctx, &pb.CreateBatchRequest{IdempotencyKey: "k1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument; got %v", err)
	}
}

func TestCreateBatch_RequiresIdempotencyKey(t *testing.T) {
	h := newHandler()
	ctx := WithTenantID(context.Background(), "tenant-a")
	_, err := h.CreateBatch(ctx, &pb.CreateBatchRequest{WorkspaceId: "ws-1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument; got %v", err)
	}
}

func TestCloseBatch_RequiresBatchAndIdempotencyKey(t *testing.T) {
	h := newHandler()
	_, err := h.CloseBatch(context.Background(), &pb.CloseBatchRequest{IdempotencyKey: "k1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (missing batch_id); got %v", err)
	}
	_, err = h.CloseBatch(context.Background(), &pb.CloseBatchRequest{BatchId: "b1"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (missing idempotency_key); got %v", err)
	}
}

func TestGetBatch_RequiresBatchID(t *testing.T) {
	h := newHandler()
	_, err := h.GetBatch(context.Background(), &pb.GetBatchRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument; got %v", err)
	}
}

func TestBatchToPB_RoundTripsStatus(t *testing.T) {
	for _, s := range []batches.Status{batches.StatusOpen, batches.StatusClosed} {
		p := batchToPB(&batches.Batch{
			BatchID: "b1", TenantID: "t-a", WorkspaceID: "ws-1", Status: s,
		})
		if p.Status != string(s) {
			t.Errorf("status drift: got %q want %q", p.Status, s)
		}
	}
}
