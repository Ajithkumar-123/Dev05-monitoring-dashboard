// Package auditevents provides typed access to docuploader-api-audit-events
// (90-day TTL hot store; encrypted with the operator-managed audit CMK).
package auditevents

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const TableName = "docuploader-api-audit-events"

// AuditEvent is a record of a state-changing mutation on the public API
// surface. The Payload is the redacted mutation body (presigned URLs, tokens,
// data keys, customer document content, and PII metadata are removed before
// storage per the never-log set in tech-environment.md).
type AuditEvent struct {
	EventID        string                 `dynamodbav:"eventId"`
	TenantID       string                 `dynamodbav:"tenantId"`
	WorkspaceID    string                 `dynamodbav:"workspaceId"`
	UserID         string                 `dynamodbav:"userId"`
	RequestID      string                 `dynamodbav:"requestId"`
	IdempotencyKey string                 `dynamodbav:"idempotencyKey,omitempty"`
	Mutation       string                 `dynamodbav:"mutation"`
	Payload        map[string]interface{} `dynamodbav:"payload"`
	OccurredAt     time.Time              `dynamodbav:"occurredAt"`
	ExpiresAt      int64                  `dynamodbav:"expiresAt"` // unix seconds; 90 days from occurredAt
}

// TTLForEvent returns the unix-second expiry value 90 days after occurredAt.
func TTLForEvent(occurredAt time.Time) int64 {
	return occurredAt.AddDate(0, 0, 90).Unix()
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("auditevents: not found")

func (c *Client) Get(ctx context.Context, eventID string) (*AuditEvent, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"eventId": &types.AttributeValueMemberS{Value: eventID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	e := &AuditEvent{}
	if err := attributevalue.UnmarshalMap(out.Item, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (c *Client) Put(ctx context.Context, e *AuditEvent) error {
	if e.ExpiresAt == 0 {
		e.ExpiresAt = TTLForEvent(e.OccurredAt)
	}
	item, err := attributevalue.MarshalMap(e)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}
