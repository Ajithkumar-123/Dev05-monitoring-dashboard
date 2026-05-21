// Package workspaces provides typed access to docuploader-api-workspaces.
//
// The Workspace entity is the source of truth for tenant identity. Tenancy is
// resolved at token-mint time from this table; client-supplied tenantId is
// never trusted (see workspace-resolver and pre-token-generation-lambda).
package workspaces

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const TableName = "docuploader-api-workspaces"

type Status string

const (
	StatusActive   Status = "ACTIVE"
	StatusArchived Status = "ARCHIVED"
)

type RetentionPolicy struct {
	InputRetentionDays int `dynamodbav:"inputRetentionDays"`
}

type EncryptionConfig struct {
	KmsAliasName string `dynamodbav:"kmsAliasName"`
}

type PipelineConfig struct {
	AllowedExtensions         []string `dynamodbav:"allowedExtensions,omitempty"`
	ForcedSlipsheetExtensions []string `dynamodbav:"forcedSlipsheetExtensions,omitempty"`
}

type Workspace struct {
	WorkspaceID      string           `dynamodbav:"workspaceId"`
	TenantID         string           `dynamodbav:"tenantId"`
	Status           Status           `dynamodbav:"status"`
	RetentionPolicy  RetentionPolicy  `dynamodbav:"retentionPolicy"`
	EncryptionConfig EncryptionConfig `dynamodbav:"encryptionConfig"`
	PipelineConfig   PipelineConfig   `dynamodbav:"pipelineConfig"`
	CreatedAt        time.Time        `dynamodbav:"createdAt"`
	UpdatedAt        time.Time        `dynamodbav:"updatedAt"`
}

type Client struct {
	ddb *dynamodb.Client
}

func NewClient(ddb *dynamodb.Client) *Client {
	return &Client{ddb: ddb}
}

var ErrNotFound = errors.New("workspaces: not found")

func (c *Client) Get(ctx context.Context, workspaceID string) (*Workspace, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"workspaceId": &types.AttributeValueMemberS{Value: workspaceID},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	ws := &Workspace{}
	if err := attributevalue.UnmarshalMap(out.Item, ws); err != nil {
		return nil, err
	}
	return ws, nil
}

func (c *Client) Put(ctx context.Context, ws *Workspace) error {
	item, err := attributevalue.MarshalMap(ws)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}
