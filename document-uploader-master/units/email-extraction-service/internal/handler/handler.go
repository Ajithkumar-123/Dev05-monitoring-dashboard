// Package handler implements the email-extraction worker.
//
// EML is parsed via Go stdlib (`net/mail` + `mime/multipart`). Each attachment
// is materialised as a child Document via S3 PUT to staging plus a SendMessage
// to the classification queue (re-entry). MSG support is stubbed — production
// adds `mscfb` + `crtf` parsing for Compound File Binary Format.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/google/uuid"
)

type Config struct {
	QueueURL               string
	ClassificationQueueURL string
	StagingBucket          string
	Logger                 *slog.Logger
	SQS                    *sqs.Client
	S3                     *s3.Client
}

type Handler struct{ Config }

func New(c Config) *Handler { return &Handler{Config: c} }

type message struct {
	DocumentID  string `json:"documentId"`
	TenantID    string `json:"tenantId"`
	WorkspaceID string `json:"workspaceId"`
	BatchID     string `json:"batchId"`
	S3Bucket    string `json:"s3Bucket"`
	S3Key       string `json:"s3Key"`
}

func (h *Handler) Run(ctx context.Context) error {
	h.Logger.Info("starting", "queueUrl", h.QueueURL)
	for {
		select {
		case <-ctx.Done():
			h.Logger.Info("shutting down")
			return nil
		default:
		}
		out, err := h.SQS.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(h.QueueURL),
			MaxNumberOfMessages: 1,
			WaitTimeSeconds:     20,
		})
		if err != nil {
			h.Logger.Warn("receive failed", "error", err)
			continue
		}
		for _, m := range out.Messages {
			if err := h.handleOne(ctx, m); err != nil {
				h.Logger.Warn("handle failed; redrive", "error", err)
				continue
			}
			_, _ = h.SQS.DeleteMessage(ctx, &sqs.DeleteMessageInput{
				QueueUrl:      aws.String(h.QueueURL),
				ReceiptHandle: m.ReceiptHandle,
			})
		}
	}
}

func (h *Handler) handleOne(ctx context.Context, m sqstypes.Message) error {
	var msg message
	if err := json.Unmarshal([]byte(*m.Body), &msg); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	obj, err := h.S3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(msg.S3Bucket),
		Key:    aws.String(msg.S3Key),
	})
	if err != nil {
		return fmt.Errorf("get source: %w", err)
	}
	defer obj.Body.Close()

	em, err := mail.ReadMessage(obj.Body)
	if err != nil {
		return fmt.Errorf("parse EML: %w", err)
	}

	contentType := em.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return fmt.Errorf("parse content-type: %w", err)
	}
	if !strings.HasPrefix(mediaType, "multipart/") {
		// Body-only email: store the body as a single child of route "convert/html" or write inline output.
		// For inception scaffold we just log and skip fan-out.
		h.Logger.Info("email body-only; no attachments to fan out", "documentId", msg.DocumentID)
		return nil
	}

	mr := multipart.NewReader(em.Body, params["boundary"])
	count := 0
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("next part: %w", err)
		}
		buf := &bytes.Buffer{}
		if _, err := io.Copy(buf, part); err != nil {
			_ = part.Close()
			return fmt.Errorf("copy part: %w", err)
		}
		_ = part.Close()
		childID := uuid.NewString()
		childKey := fmt.Sprintf("%s/%s/%s", msg.TenantID, msg.BatchID, childID)
		if _, err := h.S3.PutObject(ctx, &s3.PutObjectInput{
			Bucket:      aws.String(h.StagingBucket),
			Key:         aws.String(childKey),
			Body:        bytes.NewReader(buf.Bytes()),
			ContentType: aws.String("application/octet-stream"),
		}); err != nil {
			return fmt.Errorf("put attachment: %w", err)
		}
		body, err := json.Marshal(map[string]any{
			"documentId":       childID,
			"tenantId":         msg.TenantID,
			"workspaceId":      msg.WorkspaceID,
			"batchId":          msg.BatchID,
			"s3Bucket":         h.StagingBucket,
			"s3Key":            childKey,
			"parentDocumentId": msg.DocumentID,
			"schemaVersion":    1,
		})
		if err != nil {
			return err
		}
		if _, err := h.SQS.SendMessage(ctx, &sqs.SendMessageInput{
			QueueUrl:    aws.String(h.ClassificationQueueURL),
			MessageBody: aws.String(string(body)),
		}); err != nil {
			return fmt.Errorf("send classification: %w", err)
		}
		count++
	}
	h.Logger.Info("email fan-out complete", "documentId", msg.DocumentID, "childCount", count)
	return nil
}

