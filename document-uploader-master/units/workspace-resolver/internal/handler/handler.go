// Package handler implements the WorkspaceService gRPC contract.
//
// Tenancy is sourced from the authenticated gRPC context — never from the
// request body. On CreateWorkspace, the handler provisions a per-tenant KMS
// alias bound to the shared tenant CMK per the A27 override.
package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/google/uuid"
	"github.com/opus2/docuploader/libs/data-access/go/workspaces"
	pb "github.com/opus2/docuploader/units/workspace-resolver/proto/workspacev1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AliasProvider is the subset of kms.Client we use; allows mocking.
type AliasProvider interface {
	CreateAlias(ctx context.Context, params *kms.CreateAliasInput, optFns ...func(*kms.Options)) (*kms.CreateAliasOutput, error)
}

// Handler implements pb.WorkspaceServiceServer.
type Handler struct {
	pb.UnimplementedWorkspaceServiceServer

	workspaces *workspaces.Client
	kms        AliasProvider
	tenantKey  string
	logger     *slog.Logger
}

func New(w *workspaces.Client, k AliasProvider, l *slog.Logger) *Handler {
	return &Handler{
		workspaces: w,
		kms:        k,
		tenantKey:  "alias/docuploader-tenant-master", // resolved from env in production
		logger:     l,
	}
}

// Register wires the handler into a gRPC server using the generated stub.
func Register(srv *grpc.Server, h *Handler) {
	pb.RegisterWorkspaceServiceServer(srv, h)
}

// tenantIDKey is the context key used by the auth interceptor to carry the
// validated tenant identity. Resolvers MUST source tenancy from the context
// (set by pre-token-generation-lambda upstream), never from the request body.
type tenantIDKey struct{}

// WithTenantID returns a context carrying the validated tenantId. Used by the
// auth interceptor in production and by tests directly.
func WithTenantID(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, tenantIDKey{}, tenantID)
}

func tenantIDFromContext(ctx context.Context) (string, error) {
	if v, ok := ctx.Value(tenantIDKey{}).(string); ok && v != "" {
		return v, nil
	}
	return "", status.Error(codes.Unauthenticated, "tenant identity missing from context")
}

// CreateWorkspace implements pb.WorkspaceServiceServer.
func (h *Handler) CreateWorkspace(ctx context.Context, req *pb.CreateWorkspaceRequest) (*pb.Workspace, error) {
	tenantID, err := tenantIDFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}

	now := time.Now().UTC()
	id := uuid.NewString()
	aliasName := fmt.Sprintf("alias/docuploader-tenant-%s", id)

	if _, err := h.kms.CreateAlias(ctx, &kms.CreateAliasInput{
		AliasName:   aws.String(aliasName),
		TargetKeyId: aws.String(h.tenantKey),
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "create KMS alias: %v", err)
	}

	ws := &workspaces.Workspace{
		WorkspaceID:      id,
		TenantID:         tenantID,
		Status:           workspaces.StatusActive,
		RetentionPolicy:  pbToRetentionPolicy(req.GetRetentionPolicy()),
		EncryptionConfig: workspaces.EncryptionConfig{KmsAliasName: aliasName},
		PipelineConfig:   pbToPipelineConfig(req.GetPipelineConfig()),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := h.workspaces.Put(ctx, ws); err != nil {
		return nil, status.Errorf(codes.Internal, "persist workspace: %v", err)
	}
	h.logger.Info("workspace created", "workspaceId", id, "tenantId", tenantID, "kmsAlias", aliasName)
	return workspaceToPB(ws), nil
}

// GetWorkspace implements pb.WorkspaceServiceServer.
func (h *Handler) GetWorkspace(ctx context.Context, req *pb.GetWorkspaceRequest) (*pb.Workspace, error) {
	if req.GetWorkspaceId() == "" {
		return nil, status.Error(codes.InvalidArgument, "workspace_id required")
	}
	ws, err := h.workspaces.Get(ctx, req.GetWorkspaceId())
	if errors.Is(err, workspaces.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "workspace not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get workspace: %v", err)
	}
	return workspaceToPB(ws), nil
}

// UpdateWorkspace implements pb.WorkspaceServiceServer.
func (h *Handler) UpdateWorkspace(ctx context.Context, req *pb.UpdateWorkspaceRequest) (*pb.Workspace, error) {
	if req.GetWorkspaceId() == "" {
		return nil, status.Error(codes.InvalidArgument, "workspace_id required")
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}
	ws, err := h.workspaces.Get(ctx, req.GetWorkspaceId())
	if errors.Is(err, workspaces.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "workspace not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get workspace: %v", err)
	}
	if req.GetRetentionPolicy() != nil {
		ws.RetentionPolicy = pbToRetentionPolicy(req.GetRetentionPolicy())
	}
	if req.GetPipelineConfig() != nil {
		ws.PipelineConfig = pbToPipelineConfig(req.GetPipelineConfig())
	}
	ws.UpdatedAt = time.Now().UTC()
	if err := h.workspaces.Put(ctx, ws); err != nil {
		return nil, status.Errorf(codes.Internal, "persist workspace: %v", err)
	}
	return workspaceToPB(ws), nil
}

// ---------- pb <-> data-access translation ----------

func pbToRetentionPolicy(p *pb.RetentionPolicy) workspaces.RetentionPolicy {
	if p == nil {
		return workspaces.RetentionPolicy{InputRetentionDays: 7}
	}
	return workspaces.RetentionPolicy{InputRetentionDays: int(p.GetInputRetentionDays())}
}

func pbToPipelineConfig(p *pb.PipelineConfig) workspaces.PipelineConfig {
	if p == nil {
		return workspaces.PipelineConfig{ForcedSlipsheetExtensions: []string{"csv", "ods"}}
	}
	pc := workspaces.PipelineConfig{
		AllowedExtensions:         append([]string(nil), p.GetAllowedExtensions()...),
		ForcedSlipsheetExtensions: append([]string(nil), p.GetForcedSlipsheetExtensions()...),
	}
	if len(pc.ForcedSlipsheetExtensions) == 0 {
		pc.ForcedSlipsheetExtensions = []string{"csv", "ods"}
	}
	return pc
}

func workspaceToPB(ws *workspaces.Workspace) *pb.Workspace {
	return &pb.Workspace{
		WorkspaceId: ws.WorkspaceID,
		TenantId:    ws.TenantID,
		Status:      string(ws.Status),
		RetentionPolicy: &pb.RetentionPolicy{
			InputRetentionDays: int32(ws.RetentionPolicy.InputRetentionDays),
		},
		EncryptionConfig: &pb.EncryptionConfig{KmsAliasName: ws.EncryptionConfig.KmsAliasName},
		PipelineConfig: &pb.PipelineConfig{
			AllowedExtensions:         append([]string(nil), ws.PipelineConfig.AllowedExtensions...),
			ForcedSlipsheetExtensions: append([]string(nil), ws.PipelineConfig.ForcedSlipsheetExtensions...),
		},
		CreatedAt: timestamppb.New(ws.CreatedAt),
		UpdatedAt: timestamppb.New(ws.UpdatedAt),
	}
}
