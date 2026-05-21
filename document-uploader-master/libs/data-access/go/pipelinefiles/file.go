// Package pipelinefiles provides typed access to docuploader-pipeline-files
// (per-execution scratch metadata; 7-day TTL; folderPath-index GSI).
package pipelinefiles

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
	TableName           = "docuploader-pipeline-files"
	FolderPathIndexName = "folderPath-index"
)

type PipelineFile struct {
	FileID      string    `dynamodbav:"fileId"`
	DocumentID  string    `dynamodbav:"documentId"`
	ExecutionID string    `dynamodbav:"executionId"`
	FolderPath  string    `dynamodbav:"folderPath"`
	S3Bucket    string    `dynamodbav:"s3Bucket"`
	S3Key       string    `dynamodbav:"s3Key"`
	SizeBytes   int64     `dynamodbav:"sizeBytes"`
	CreatedAt   time.Time `dynamodbav:"createdAt"`
	ExpiresAt   int64     `dynamodbav:"expiresAt"`
}

func TTLForFile(createdAt time.Time) int64 {
	return createdAt.AddDate(0, 0, 7).Unix()
}

type Client struct{ ddb *dynamodb.Client }

func NewClient(ddb *dynamodb.Client) *Client { return &Client{ddb: ddb} }

var ErrNotFound = errors.New("pipelinefiles: not found")

func (c *Client) Get(ctx context.Context, fileID string) (*PipelineFile, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(TableName),
		Key: map[string]types.AttributeValue{
			"fileId": &types.AttributeValueMemberS{Value: fileID},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, ErrNotFound
	}
	f := &PipelineFile{}
	if err := attributevalue.UnmarshalMap(out.Item, f); err != nil {
		return nil, err
	}
	return f, nil
}

func (c *Client) Put(ctx context.Context, f *PipelineFile) error {
	if f.ExpiresAt == 0 {
		f.ExpiresAt = TTLForFile(f.CreatedAt)
	}
	item, err := attributevalue.MarshalMap(f)
	if err != nil {
		return err
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(TableName),
		Item:      item,
	})
	return err
}

func (c *Client) ListByFolder(ctx context.Context, folderPath string) ([]PipelineFile, error) {
	out, err := c.ddb.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(TableName),
		IndexName:              aws.String(FolderPathIndexName),
		KeyConditionExpression: aws.String("folderPath = :p"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":p": &types.AttributeValueMemberS{Value: folderPath},
		},
	})
	if err != nil {
		return nil, err
	}
	files := make([]PipelineFile, 0, len(out.Items))
	for _, item := range out.Items {
		var f PipelineFile
		if err := attributevalue.UnmarshalMap(item, &f); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}
