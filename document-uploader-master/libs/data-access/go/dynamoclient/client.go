// Package dynamoclient provides a thin construction helper for the shared
// DynamoDB client used by every data-access sub-package. Callers pass a
// pre-configured aws.Config (typically constructed via config.LoadDefaultConfig
// with IRSA credentials) and receive a *dynamodb.Client.
package dynamoclient

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

func New(cfg aws.Config, opts ...func(*dynamodb.Options)) *dynamodb.Client {
	return dynamodb.NewFromConfig(cfg, opts...)
}
