package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/opus2/docuploader/libs/data-access/go/auditevents"
	"github.com/opus2/docuploader/libs/data-access/go/dynamoclient"
	"github.com/opus2/docuploader/units/audit-event-storage-lambda/internal/handler"
)

var h *handler.Handler

func init() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		logger.Error("aws config load failed", "error", err)
		os.Exit(1)
	}

	archiveBucket := os.Getenv("ARCHIVE_BUCKET")
	if archiveBucket == "" {
		archiveBucket = "docuploader-api-audit-archive"
	}

	ddb := dynamoclient.New(cfg)
	h = handler.New(auditevents.NewClient(ddb), s3.NewFromConfig(cfg), archiveBucket, logger)
}

func HandleRequest(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	return h.Handle(ctx, event)
}

func main() {
	lambda.Start(HandleRequest)
}
