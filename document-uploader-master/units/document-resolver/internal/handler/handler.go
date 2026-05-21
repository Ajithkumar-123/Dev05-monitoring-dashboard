// Package handler implements the DocumentService gRPC contract.
//
// CreateDocument mints a server-set presigned PUT URL with server-set TTL and
// content-type (never client-set). UpdateDocumentStatus requires an
// idempotency key; collisions on the idempotency-index GSI are de-duplicated
// to the existing row.
package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
	pb "github.com/opus2/docuploader/units/document-resolver/proto/documentv1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Presigner interface {
	PresignPutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*PresignedRequest, error)
}

type PresignedRequest struct {
	URL       string
	ExpiresAt time.Time
}

// Handler implements pb.DocumentServiceServer.
type Handler struct {
	pb.UnimplementedDocumentServiceServer

	documents     *documents.Client
	presigner     *s3.PresignClient
	stagingBucket string
	presignTTL    time.Duration
	logger        *slog.Logger

	subsMu sync.Mutex
	subs   map[string][]chan *documents.Document
}

func New(d *documents.Client, p *s3.PresignClient, bucket, presignTTLStr string, l *slog.Logger) *Handler {
	ttl, err := time.ParseDuration(presignTTLStr)
	if err != nil || ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &Handler{
		documents:     d,
		presigner:     p,
		stagingBucket: bucket,
		presignTTL:    ttl,
		logger:        l,
		subs:          map[string][]chan *documents.Document{},
	}
}

func Register(srv *grpc.Server, h *Handler) {
	pb.RegisterDocumentServiceServer(srv, h)
}

var ErrIllegalTransition = errors.New("documents: illegal status transition")

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

// workspaceIDKey carries the workspace identity (also injected by the auth
// interceptor; resolved from the token at mint time).
type workspaceIDKey struct{}

// WithWorkspaceID returns a context carrying the workspace identity.
func WithWorkspaceID(ctx context.Context, workspaceID string) context.Context {
	return context.WithValue(ctx, workspaceIDKey{}, workspaceID)
}

func workspaceIDFromContext(ctx context.Context) (string, error) {
	if v, ok := ctx.Value(workspaceIDKey{}).(string); ok && v != "" {
		return v, nil
	}
	return "", status.Error(codes.Unauthenticated, "workspace identity missing from context")
}

// CreateDocument implements pb.DocumentServiceServer.
func (h *Handler) CreateDocument(ctx context.Context, req *pb.CreateDocumentRequest) (*pb.CreateDocumentResponse, error) {
	tenantID, err := tenantIDFromContext(ctx)
	if err != nil {
		return nil, err
	}
	workspaceID, err := workspaceIDFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}
	if req.GetBatchId() == "" {
		return nil, status.Error(codes.InvalidArgument, "batch_id required")
	}
	doc, presignedURL, expiresAt, err := h.createDocument(ctx, tenantID, workspaceID, req.GetBatchId(), req.GetIdempotencyKey(), req.GetFilename())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create document: %v", err)
	}
	resp := &pb.CreateDocumentResponse{Document: documentToPB(doc), PresignedUrl: presignedURL}
	if !expiresAt.IsZero() {
		resp.PresignedUrlExpiresAt = timestamppb.New(expiresAt)
	}
	return resp, nil
}

// UpdateDocumentStatus implements pb.DocumentServiceServer.
func (h *Handler) UpdateDocumentStatus(ctx context.Context, req *pb.UpdateDocumentStatusRequest) (*pb.Document, error) {
	if req.GetDocumentId() == "" {
		return nil, status.Error(codes.InvalidArgument, "document_id required")
	}
	if req.GetIdempotencyKey() == "" {
		return nil, status.Error(codes.InvalidArgument, "idempotency_key required")
	}
	doc, err := h.updateStatus(ctx, req.GetDocumentId(), req.GetToStatus(), req.GetPipelineStage(), req.GetIdempotencyKey())
	if errors.Is(err, ErrIllegalTransition) {
		return nil, status.Error(codes.FailedPrecondition, err.Error())
	}
	if errors.Is(err, documents.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "document not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update status: %v", err)
	}
	return documentToPB(doc), nil
}

// GetDocument implements pb.DocumentServiceServer.
func (h *Handler) GetDocument(ctx context.Context, req *pb.GetDocumentRequest) (*pb.Document, error) {
	if req.GetDocumentId() == "" {
		return nil, status.Error(codes.InvalidArgument, "document_id required")
	}
	doc, err := h.documents.Get(ctx, req.GetDocumentId())
	if errors.Is(err, documents.ErrNotFound) {
		return nil, status.Error(codes.NotFound, "document not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get document: %v", err)
	}
	return documentToPB(doc), nil
}

// SubscribeStatusChanged implements pb.DocumentServiceServer (server-streaming).
func (h *Handler) SubscribeStatusChanged(req *pb.SubscribeStatusChangedRequest, stream pb.DocumentService_SubscribeStatusChangedServer) error {
	if req.GetDocumentId() == "" {
		return status.Error(codes.InvalidArgument, "document_id required")
	}
	ch, cancel := h.subscribe(req.GetDocumentId())
	defer cancel()
	for {
		select {
		case <-stream.Context().Done():
			return nil
		case doc, ok := <-ch:
			if !ok {
				return nil
			}
			if err := stream.Send(documentToPB(doc)); err != nil {
				return err
			}
		}
	}
}

// ---------- internal helpers (decoupled from gRPC types) ----------

func (h *Handler) createDocument(ctx context.Context, tenantID, workspaceID, batchID, idempotencyKey, _ string) (*documents.Document, string, time.Time, error) {
	if existing, err := h.documents.FindByIdempotencyKey(ctx, idempotencyKey); err == nil {
		h.logger.Info("idempotency hit", "documentId", existing.DocumentID, "idempotencyKey", idempotencyKey)
		return existing, "", time.Time{}, nil
	}
	now := time.Now().UTC()
	id := uuid.NewString()
	key := fmt.Sprintf("%s/%s/%s", tenantID, batchID, id)

	req, err := h.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.stagingBucket),
		Key:         aws.String(key),
		ContentType: aws.String("application/octet-stream"),
	}, s3.WithPresignExpires(h.presignTTL))
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("presign: %w", err)
	}
	doc := &documents.Document{
		DocumentID:     id,
		TenantID:       tenantID,
		WorkspaceID:    workspaceID,
		BatchID:        batchID,
		Status:         documents.StatusUploaded,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := h.documents.Put(ctx, doc); err != nil {
		return nil, "", time.Time{}, fmt.Errorf("persist document: %w", err)
	}
	h.logger.Info("document created", "documentId", id, "tenantId", tenantID, "batchId", batchID)
	return doc, req.URL, now.Add(h.presignTTL), nil
}

func (h *Handler) updateStatus(ctx context.Context, documentID, toStatus, pipelineStage, idempotencyKey string) (*documents.Document, error) {
	if existing, err := h.documents.FindByIdempotencyKey(ctx, idempotencyKey); err == nil && existing.DocumentID == documentID && existing.Status == documents.Status(toStatus) {
		return existing, nil
	}
	doc, err := h.documents.Get(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if !legalTransition(doc.Status, documents.Status(toStatus)) {
		return nil, ErrIllegalTransition
	}
	doc.Status = documents.Status(toStatus)
	doc.PipelineStage = pipelineStage
	doc.IdempotencyKey = idempotencyKey
	doc.UpdatedAt = time.Now().UTC()
	if err := h.documents.Put(ctx, doc); err != nil {
		return nil, fmt.Errorf("persist document: %w", err)
	}
	h.fanout(doc)
	return doc, nil
}

func (h *Handler) subscribe(documentID string) (<-chan *documents.Document, func()) {
	ch := make(chan *documents.Document, 16)
	h.subsMu.Lock()
	h.subs[documentID] = append(h.subs[documentID], ch)
	h.subsMu.Unlock()
	return ch, func() {
		h.subsMu.Lock()
		defer h.subsMu.Unlock()
		subs := h.subs[documentID]
		for i, c := range subs {
			if c == ch {
				h.subs[documentID] = append(subs[:i], subs[i+1:]...)
				close(ch)
				return
			}
		}
	}
}

func legalTransition(from, to documents.Status) bool {
	// Permissive forward-only model: any later state in the canonical sequence
	// is allowed; FAILED is a terminal sink from any non-terminal state.
	order := map[documents.Status]int{
		documents.StatusUploaded:   0,
		documents.StatusScanning:   1,
		documents.StatusQueued:     2,
		documents.StatusProcessing: 3,
		documents.StatusCompleted:  4,
	}
	if to == documents.StatusFailed {
		return from != documents.StatusCompleted && from != documents.StatusFailed
	}
	fi, fok := order[from]
	ti, tok := order[to]
	return fok && tok && ti >= fi
}

func (h *Handler) fanout(doc *documents.Document) {
	h.subsMu.Lock()
	subs := append([]chan *documents.Document(nil), h.subs[doc.DocumentID]...)
	h.subsMu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- doc:
		default:
			// drop on slow consumer; client must reconnect to pick up the
			// missed transition via a fresh Get.
		}
	}
}

// ---------- pb <-> data-access translation ----------

func documentToPB(d *documents.Document) *pb.Document {
	out := &pb.Document{
		DocumentId:     d.DocumentID,
		TenantId:       d.TenantID,
		WorkspaceId:    d.WorkspaceID,
		BatchId:        d.BatchID,
		Status:         string(d.Status),
		PipelineStage:  d.PipelineStage,
		IdempotencyKey: d.IdempotencyKey,
		CreatedAt:      timestamppb.New(d.CreatedAt),
		UpdatedAt:      timestamppb.New(d.UpdatedAt),
	}
	for _, o := range d.Outputs {
		out.Outputs = append(out.Outputs, &pb.Output{
			Type:          o.Type,
			S3Key:         o.S3Key,
			NativeTrigger: o.Trigger,
		})
	}
	if d.ProcessingError != nil {
		out.ProcessingError = &pb.ProcessingError{
			Code:       d.ProcessingError.Code,
			Message:    d.ProcessingError.Message,
			Detail:     d.ProcessingError.Detail,
			Retryable:  d.ProcessingError.Retryable,
			Extensions: d.ProcessingError.Extension,
		}
	}
	return out
}
