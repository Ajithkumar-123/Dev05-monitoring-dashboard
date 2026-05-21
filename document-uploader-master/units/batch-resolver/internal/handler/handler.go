// Package handler implements the BatchService gRPC contract.
//
// Batch is the envelope for one or more Documents. State machine: OPEN -> CLOSED
// (terminal). New createDocument calls require an OPEN batch.
package handler

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/opus2/docuploader/libs/data-access/go/batches"
	pb "github.com/opus2/docuploader/units/batch-resolver/proto/batchv1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements pb.BatchServiceServer.
type Handler struct {
	pb.UnimplementedBatchServiceServer

	batches *batches.Client
	logger  *slog.Logger
}

func New(b *batches.Client, l *slog.Logger) *Handler {
	return &Handler{batches: b, logger: l}
}

func Register(srv *grpc.Server, h *Handler) {
	pb.RegisterBatchServiceServer(srv, h)
}

var ErrIllegalTransition = errors.New("batch: illegal status transition")

// tenantIDKey carries the authenticated tenant identity in the gRPC context.
type tenantIDKey struct{}

// WithTenantID returns a context carrying the validated tenantId.
func WithTenantID(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, tenantIDKey{}, tenantID)
}

func tenantIDFromContext(ctx context.Context) (string, error) {
	if v, ok := ctx.Value(tenantIDKey{}).(string); ok && v != "" {
		return v, nil
	}
	return "", status.Error(codes.Unauthenticated, "tenant identity missing from context")
}

// CreateBatch implements pb.BatchServiceServer.
func (h *Handler) CreateBatch(ctx context.Context, req *pb.CreateBatchRequest) (*pb.Batch, error) {
	tenantID, err := tenantIDFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if req.GetWorkspaceId() == "" {
		return nil, status.Error(codes.InvalidArgument, "workspace_id required")
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}
	now := time.Now().UTC()
	b := &batches.Batch{
		BatchID:     uuid.NewString(),
		TenantID:    tenantID,
		WorkspaceID: req.GetWorkspaceId(),
		Status:      batches.StatusOpen,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := h.batches.Put(ctx, b); err != nil {
		return nil, status.Errorf(codes.Internal, "persist batch: %v", err)
	}
	h.logger.Info("batch created", "batchId", b.BatchID, "tenantId", tenantID, "workspaceId", req.GetWorkspaceId())
	return batchToPB(b), nil
}

// CloseBatch implements pb.BatchServiceServer.
func (h *Handler) CloseBatch(ctx context.Context, req *pb.CloseBatchRequest) (*pb.Batch, error) {
	if req.GetBatchId() == "" {
		return nil, status.Error(codes.InvalidArgument, "batch_id required")
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}
	b, err := h.batches.Get(ctx, req.GetBatchId())
	if errors.Is(err, batches.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "batch not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get batch: %v", err)
	}
	if b.Status != batches.StatusOpen {
		return nil, status.Error(codes.FailedPrecondition, ErrIllegalTransition.Error())
	}
	b.Status = batches.StatusClosed
	b.UpdatedAt = time.Now().UTC()
	if err := h.batches.Put(ctx, b); err != nil {
		return nil, status.Errorf(codes.Internal, "persist batch: %v", err)
	}
	h.logger.Info("batch closed", "batchId", b.BatchID)
	return batchToPB(b), nil
}

// GetBatch implements pb.BatchServiceServer.
func (h *Handler) GetBatch(ctx context.Context, req *pb.GetBatchRequest) (*pb.Batch, error) {
	if req.GetBatchId() == "" {
		return nil, status.Error(codes.InvalidArgument, "batch_id required")
	}
	b, err := h.batches.Get(ctx, req.GetBatchId())
	if errors.Is(err, batches.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "batch not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get batch: %v", err)
	}
	return batchToPB(b), nil
}

func batchToPB(b *batches.Batch) *pb.Batch {
	return &pb.Batch{
		BatchId:     b.BatchID,
		TenantId:    b.TenantID,
		WorkspaceId: b.WorkspaceID,
		Status:      string(b.Status),
		CreatedAt:   timestamppb.New(b.CreatedAt),
		UpdatedAt:   timestamppb.New(b.UpdatedAt),
	}
}
