// Package tasktokens provides typed access to textract-task-tokens (async
// Textract callback correlation; 1-day TTL).
package tasktokens

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const TableName = "textract-task-tokens"

type TaskToken struct {
	TaskToken   string    `dynamodbav:"taskToken"`
	DocumentID  string    `dynamodbav:"documentId"`
	ExecutionID string    `dynamodbav:"executionId"`
	JobID       string    `dynamodbav:"jobId"`
	CreatedAt   time.Time `dynamodbav:"createdAt"`
	ExpiresAt   int64     `dynamodbav:"expiresAt"`
}

func TTLForToken(createdAt time.Time) int64 {
	return createdAt.AddDate(0, 0, 1).Unix()
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("tasktokens: not found")

func (c *Client) Get(ctx context.Context, taskToken string) (*TaskToken, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"taskToken": &types.AttributeValueMemberS{Value: taskToken},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	t := &TaskToken{}
	if err := attributevalue.UnmarshalMap(out.Item, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (c *Client) Put(ctx context.Context, t *TaskToken) error {
	if t.ExpiresAt == 0 {
		t.ExpiresAt = TTLForToken(t.CreatedAt)
	}
	item, err := attributevalue.MarshalMap(t)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}

func (c *Client) Delete(ctx context.Context, taskToken string) error {
	_, err := c.ddb.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"taskToken": &types.AttributeValueMemberS{Value: taskToken},
		},
	})
	return err
}
