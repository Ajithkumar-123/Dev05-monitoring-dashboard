// Package handler validates inbound OIDC tokens.
//
// At MVP, tokens are minted externally; this Lambda only verifies the
// required custom claims (userID, workspaceID, tenantId) are present and
// non-empty. A future Opus 2 IdP slots in without code change by re-pointing
// the Lambda at the IdP's pre-token-generation hook.
package handler

import (
	"context"
	"errors"
	"log/slog"

	"github.com/aws/aws-lambda-go/events"
)

var (
	ErrMissingClaim = errors.New("required custom claim missing")
)

type Handler struct {
	logger *slog.Logger
}

func New(l *slog.Logger) *Handler {
	return &Handler{logger: l}
}

func (h *Handler) Validate(_ context.Context, event events.CognitoEventUserPoolsPreTokenGen) error {
	claims := event.Request.UserAttributes
	for _, key := range [...]string{"custom:userID", "custom:workspaceID", "custom:tenantId"} {
		if v, ok := claims[key]; !ok || v == "" {
			return ErrMissingClaim
		}
	}
	return nil
}
