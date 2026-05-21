// Package contenthashes provides typed access to docuploader-content-hashes
// (SHA-256 dedup table; 90-day TTL).
package contenthashes

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const TableName = "docuploader-content-hashes"

type ContentHash struct {
	SHA256     string    `dynamodbav:"sha256"`
	DocumentID string    `dynamodbav:"documentId"`
	TenantID   string    `dynamodbav:"tenantId"`
	SeenAt     time.Time `dynamodbav:"seenAt"`
	ExpiresAt  int64     `dynamodbav:"expiresAt"`
}

func TTLForHash(seenAt time.Time) int64 {
	return seenAt.AddDate(0, 0, 90).Unix()
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("contenthashes: not found")

func (c *Client) Get(ctx context.Context, sha256 string) (*ContentHash, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"sha256": &types.AttributeValueMemberS{Value: sha256},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	h := &ContentHash{}
	if err := attributevalue.UnmarshalMap(out.Item, h); err != nil {
		return nil, err
	}
	return h, nil
}

func (c *Client) Put(ctx context.Context, h *ContentHash) error {
	if h.ExpiresAt == 0 {
		h.ExpiresAt = TTLForHash(h.SeenAt)
	}
	item, err := attributevalue.MarshalMap(h)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}
