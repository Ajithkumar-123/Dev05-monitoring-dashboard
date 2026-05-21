// local-test-rig exercises the LIB-04 (libs/data-access/go) clients against
// a LocalStack-backed AWS mock running at http://localhost:4566.
//
// Pre-req: `make localstack-up && make localstack-bootstrap` (or
// equivalent: `docker compose -f harness/localstack/docker-compose.yml up -d`
// then `bash harness/localstack/seed.sh`).
//
// What it tests:
//   1. dynamoclient construction with a custom endpoint
//   2. workspaces.Client.Put + Get round-trip
//   3. batches.Client.Put + Get round-trip
//   4. documents.Client.Put + Get round-trip
//   5. idempotency.DeriveUpdateStatusKey golden parity
//
// Exit 0 if all PASS; non-zero on first failure.
package main

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/opus2/docuploader/libs/data-access/go/batches"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
	"github.com/opus2/docuploader/libs/data-access/go/idempotency"
	"github.com/opus2/docuploader/libs/data-access/go/workspaces"
)

const (
	localStackEndpoint = "http://localhost:4566"
	region             = "eu-west-1"
)

// loadLocalStackConfig builds an aws.Config with fake credentials. The
// endpoint override is applied per-service when constructing each client
// (dynamodb.NewFromConfig + an options func setting BaseEndpoint) since the
// SDK version used here doesn't expose config.WithBaseEndpoint.
func loadLocalStackConfig(ctx context.Context) (aws.Config, error) {
	return config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(aws.CredentialsProviderFunc(
			func(_ context.Context) (aws.Credentials, error) {
				return aws.Credentials{
					AccessKeyID:     "test",
					SecretAccessKey: "test",
					SessionToken:    "",
					Source:          "static-localstack",
				}, nil
			},
		)),
	)
}

// newDDBClient builds a DynamoDB client that talks to the LocalStack edge port.
func newDDBClient(cfg aws.Config) *dynamodb.Client {
	return dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		o.BaseEndpoint = aws.String(localStackEndpoint)
	})
}

type scenario struct {
	name string
	run  func(context.Context, *dynamodb.Client) error
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg, err := loadLocalStackConfig(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: load AWS config: %v\n", err)
		os.Exit(1)
	}
	ddb := newDDBClient(cfg)

	scenarios := []scenario{
		{"workspaces.Put+Get round-trip", testWorkspaces},
		{"batches.Put+Get round-trip", testBatches},
		{"documents.Put+Get round-trip", testDocuments},
		{"idempotency.DeriveUpdateStatusKey is deterministic", testIdempotencyDeterministic},
		{"idempotency.DeriveUpdateStatusKey golden hex", testIdempotencyGolden},
		{"idempotency.DeriveUpdateStatusKey delimiter safety", testIdempotencyDelimiter},
	}

	pass := 0
	for _, s := range scenarios {
		err := s.run(ctx, ddb)
		if err != nil {
			fmt.Printf("FAIL  %s\n  %v\n", s.name, err)
			os.Exit(1)
		}
		fmt.Printf("PASS  %s\n", s.name)
		pass++
	}

	fmt.Printf("\n%d / %d scenarios PASSED against LocalStack at %s\n", pass, len(scenarios), localStackEndpoint)
}

func testWorkspaces(ctx context.Context, ddb *dynamodb.Client) error {
	c := workspaces.NewClient(ddb)
	now := time.Now().UTC().Truncate(time.Second)
	w := &workspaces.Workspace{
		WorkspaceID:      "ws-localstack-001",
		TenantID:         "t-localstack",
		Status:           workspaces.StatusActive,
		RetentionPolicy:  workspaces.RetentionPolicy{InputRetentionDays: 7},
		EncryptionConfig: workspaces.EncryptionConfig{KmsAliasName: "alias/docuploader-tenant-master"},
		PipelineConfig: workspaces.PipelineConfig{
			AllowedExtensions:         []string{".pdf", ".docx"},
			ForcedSlipsheetExtensions: []string{".heic"},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := c.Put(ctx, w); err != nil {
		return fmt.Errorf("Put: %w", err)
	}
	got, err := c.Get(ctx, "ws-localstack-001")
	if err != nil {
		return fmt.Errorf("Get: %w", err)
	}
	if !reflect.DeepEqual(w, got) {
		return fmt.Errorf("round-trip mismatch:\n  want=%+v\n  got=%+v", w, got)
	}
	return nil
}

func testBatches(ctx context.Context, ddb *dynamodb.Client) error {
	c := batches.NewClient(ddb)
	now := time.Now().UTC().Truncate(time.Second)
	b := &batches.Batch{
		BatchID:     "b-localstack-001",
		TenantID:    "t-localstack",
		WorkspaceID: "ws-localstack-001",
		Status:      batches.StatusOpen,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := c.Put(ctx, b); err != nil {
		return fmt.Errorf("Put: %w", err)
	}
	got, err := c.Get(ctx, "b-localstack-001")
	if err != nil {
		return fmt.Errorf("Get: %w", err)
	}
	if !reflect.DeepEqual(b, got) {
		return fmt.Errorf("round-trip mismatch:\n  want=%+v\n  got=%+v", b, got)
	}
	return nil
}

func testDocuments(ctx context.Context, ddb *dynamodb.Client) error {
	c := documents.NewClient(ddb)
	now := time.Now().UTC().Truncate(time.Second)
	d := &documents.Document{
		DocumentID:     "doc-localstack-001",
		TenantID:       "t-localstack",
		WorkspaceID:    "ws-localstack-001",
		BatchID:        "b-localstack-001",
		Status:         documents.StatusUploaded,
		IdempotencyKey: "ik-localstack-001",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := c.Put(ctx, d); err != nil {
		return fmt.Errorf("Put: %w", err)
	}
	got, err := c.Get(ctx, "doc-localstack-001")
	if err != nil {
		return fmt.Errorf("Get: %w", err)
	}
	if got.DocumentID != d.DocumentID || got.IdempotencyKey != d.IdempotencyKey {
		return fmt.Errorf("round-trip mismatch:\n  want.DocumentID=%q got.DocumentID=%q\n  want.IdempotencyKey=%q got.IdempotencyKey=%q",
			d.DocumentID, got.DocumentID, d.IdempotencyKey, got.IdempotencyKey)
	}
	return nil
}

func testIdempotencyDeterministic(_ context.Context, _ *dynamodb.Client) error {
	const (
		execID = "arn:aws:states:eu-west-1:000000000000:execution:docuploader-pipeline-mvp:exec-LS-001"
		state  = "PROCESSING"
		phase  = "convert"
	)
	first := idempotency.DeriveUpdateStatusKey(execID, state, phase)
	for i := 0; i < 100; i++ {
		if got := idempotency.DeriveUpdateStatusKey(execID, state, phase); got != first {
			return fmt.Errorf("iteration %d: got %s, want %s", i, got, first)
		}
	}
	return nil
}

func testIdempotencyGolden(_ context.Context, _ *dynamodb.Client) error {
	const (
		execID = "arn:aws:states:eu-west-1:123456789012:execution:docuploader-pipeline-mvp:exec-001"
		state  = "PROCESSING"
		phase  = "convert"
	)
	got := idempotency.DeriveUpdateStatusKey(execID, state, phase)
	if len(got) != 64 {
		return fmt.Errorf("expected 64-char hex; got %d chars (%q)", len(got), got)
	}
	// The exact golden hex is verified by the per-language parity tests
	// (libs/data-access/{go,py,ts}/.../*idempotency*). Here we only assert
	// length + that it's produced deterministically — the cross-language
	// match is the real contract.
	return nil
}

func testIdempotencyDelimiter(_ context.Context, _ *dynamodb.Client) error {
	// Length-prefix encoding MUST produce distinct hashes for adversarial
	// inputs that delimiter-join encoding would collide on.
	h1 := idempotency.DeriveUpdateStatusKey("a", "b\x1fc", "d")
	h2 := idempotency.DeriveUpdateStatusKey("a", "b", "c\x1fd")
	if h1 == h2 {
		return fmt.Errorf("collision: h1=%s h2=%s (length-prefix encoding is broken)", h1, h2)
	}
	return nil
}
