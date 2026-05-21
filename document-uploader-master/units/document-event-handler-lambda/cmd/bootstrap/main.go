package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
	"github.com/opus2/docuploader/libs/data-access/go/dynamoclient"
	"github.com/opus2/docuploader/units/document-event-handler-lambda/internal/handler"
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

	stateMachineArn := os.Getenv("STATE_MACHINE_ARN")
	ddb := dynamoclient.New(cfg)
	h = handler.New(documents.NewClient(ddb), sfn.NewFromConfig(cfg), stateMachineArn, logger)
}

// HandleRequest demuxes EventBridge events: S3 PutObject (start execution
// after GuardDuty clean) and GuardDuty Malware Protection findings.
func HandleRequest(ctx context.Context, event events.EventBridgeEvent) error {
	return h.Handle(ctx, event)
}

func main() {
	lambda.Start(HandleRequest)
}
