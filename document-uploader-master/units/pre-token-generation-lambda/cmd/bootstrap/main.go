package main

import (
	"context"
	"errors"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/opus2/docuploader/units/pre-token-generation-lambda/internal/handler"
)

var (
	logger *slog.Logger
	h      *handler.Handler
)

func init() {
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	h = handler.New(logger)
}

// HandleRequest validates the inbound token's required custom claims and
// resolves tenancy from them. Returning a Cognito pre-token-generation
// response shape lets a future Opus 2 IdP slot in without code change.
func HandleRequest(ctx context.Context, event events.CognitoEventUserPoolsPreTokenGen) (events.CognitoEventUserPoolsPreTokenGen, error) {
	if err := h.Validate(ctx, event); err != nil {
		logger.Warn("token validation rejected", "error", err)
		return event, errors.New("Unauthorized")
	}
	return event, nil
}

func main() {
	lambda.Start(HandleRequest)
}
