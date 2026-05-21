package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/opus2/docuploader/units/email-extraction-service/internal/handler"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		logger.Error("aws config load failed", "error", err)
		os.Exit(1)
	}

	h := handler.New(handler.Config{
		QueueURL:               envReq("EMAIL_QUEUE_URL"),
		ClassificationQueueURL: envReq("CLASSIFICATION_QUEUE_URL"),
		StagingBucket:          envReq("STAGING_BUCKET"),
		Logger:                 logger,
		SQS:                    sqs.NewFromConfig(cfg),
		S3:                     s3.NewFromConfig(cfg),
	})

	if err := h.Run(ctx); err != nil {
		logger.Error("run failed", "error", err)
		os.Exit(1)
	}
}

func envReq(k string) string {
	v := os.Getenv(k)
	if v == "" {
		panic("missing env: " + k)
	}
	return v
}
