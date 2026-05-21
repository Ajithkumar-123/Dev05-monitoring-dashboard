// Package batches provides typed access to docuploader-api-batches.
package batches

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const TableName = "docuploader-api-batches"

type Status string

const (
	StatusOpen   Status = "OPEN"
	StatusClosed Status = "CLOSED"
)

type Batch struct {
	BatchID     string    `dynamodbav:"batchId"`
	TenantID    string    `dynamodbav:"tenantId"`
	WorkspaceID string    `dynamodbav:"workspaceId"`
	Status      Status    `dynamodbav:"status"`
	CreatedAt   time.Time `dynamodbav:"createdAt"`
	UpdatedAt   time.Time `dynamodbav:"updatedAt"`
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("batches: not found")

func (c *Client) Get(ctx context.Context, batchID string) (*Batch, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"batchId": &types.AttributeValueMemberS{Value: batchID},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	b := &Batch{}
	if err := attributevalue.UnmarshalMap(out.Item, b); err != nil {
		return nil, err
	}
	return b, nil
}

func (c *Client) Put(ctx context.Context, b *Batch) error {
	item, err := attributevalue.MarshalMap(b)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}
