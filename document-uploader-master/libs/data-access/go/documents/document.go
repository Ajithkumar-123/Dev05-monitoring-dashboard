// Package documents provides typed access to docuploader-api-documents.
//
// State-changing mutations require an idempotency key. The idempotency-index
// GSI enforces de-duplication. Callers should use
// idempotency.DeriveUpdateStatusKey for the (executionId, toState,
// phase) triple used by updateDocumentStatus, or supply their own key for
// createDocument paths.
package documents

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	TableName            = "docuploader-api-documents"
	IdempotencyIndexName = "idempotency-index"
)

type Status string

const (
	StatusUploaded   Status = "UPLOADED"
	StatusScanning   Status = "SCANNING"
	StatusQueued     Status = "QUEUED"
	StatusProcessing Status = "PROCESSING"
	StatusCompleted  Status = "COMPLETED"
	StatusFailed     Status = "FAILED"
)

type Output struct {
	Type    string `dynamodbav:"type"`
	S3Key   string `dynamodbav:"s3Key"`
	Trigger string `dynamodbav:"nativeTrigger,omitempty"`
}

type ProcessingError struct {
	Code      string            `dynamodbav:"code"`
	Message   string            `dynamodbav:"message"`
	Detail    string            `dynamodbav:"detail,omitempty"`
	Retryable bool              `dynamodbav:"retryable"`
	Extension map[string]string `dynamodbav:"extensions,omitempty"`
}

type Document struct {
	DocumentID      string           `dynamodbav:"documentId"`
	TenantID        string           `dynamodbav:"tenantId"`
	WorkspaceID     string           `dynamodbav:"workspaceId"`
	BatchID         string           `dynamodbav:"batchId"`
	Status          Status           `dynamodbav:"status"`
	PipelineStage   string           `dynamodbav:"pipelineStage,omitempty"`
	IdempotencyKey  string           `dynamodbav:"idempotencyKey"`
	Outputs         []Output         `dynamodbav:"outputs,omitempty"`
	ProcessingError *ProcessingError `dynamodbav:"processingError,omitempty"`
	CreatedAt       time.Time        `dynamodbav:"createdAt"`
	UpdatedAt       time.Time        `dynamodbav:"updatedAt"`
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("documents: not found")

func (c *Client) Get(ctx context.Context, documentID string) (*Document, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"documentId": &types.AttributeValueMemberS{Value: documentID},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	d := &Document{}
	if err := attributevalue.UnmarshalMap(out.Item, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (c *Client) Put(ctx context.Context, d *Document) error {
	item, err := attributevalue.MarshalMap(d)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}

// FindByIdempotencyKey queries the idempotency-index GSI. Returns ErrNotFound
// if no document carries the given key.
func (c *Client) FindByIdempotencyKey(ctx context.Context, key string) (*Document, error) {
	out, err := c.ddb.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(TableName),
		IndexName:              aws.String(IdempotencyIndexName),
		KeyConditionExpression: aws.String("idempotencyKey = :k"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":k": &types.AttributeValueMemberS{Value: key},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, ErrNotFound
	}
	d := &Document{}
	if err := attributevalue.UnmarshalMap(out.Items[0], d); err != nil {
		return nil, err
	}
	return d, nil
}
