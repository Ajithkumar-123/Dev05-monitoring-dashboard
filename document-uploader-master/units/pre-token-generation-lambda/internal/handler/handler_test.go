package handler

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func newHandler() *Handler {
	return New(slog.New(slog.NewJSONHandler(os.Stderr, nil)))
}

func eventWithClaims(claims map[string]string) events.CognitoEventUserPoolsPreTokenGen {
	return events.CognitoEventUserPoolsPreTokenGen{
		Request: events.CognitoEventUserPoolsPreTokenGenRequest{
			UserAttributes: claims,
		},
	}
}

func TestValidate_AllRequiredClaimsPresent(t *testing.T) {
	h := newHandler()
	err := h.Validate(context.Background(), eventWithClaims(map[string]string{
		"custom:userID":      "user-1",
		"custom:workspaceID": "ws-1",
		"custom:tenantId":    "tenant-a",
	}))
	if err != nil {
		t.Fatalf("expected nil error; got %v", err)
	}
}

func TestValidate_RejectsOnAnyMissingClaim(t *testing.T) {
	cases := []struct {
		name   string
		claims map[string]string
	}{
		{"missing userID", map[string]string{
			"custom:workspaceID": "ws-1", "custom:tenantId": "tenant-a",
		}},
		{"missing workspaceID", map[string]string{
			"custom:userID": "user-1", "custom:tenantId": "tenant-a",
		}},
		{"missing tenantId", map[string]string{
			"custom:userID": "user-1", "custom:workspaceID": "ws-1",
		}},
		{"empty userID", map[string]string{
			"custom:userID": "", "custom:workspaceID": "ws-1", "custom:tenantId": "tenant-a",
		}},
		{"empty workspaceID", map[string]string{
			"custom:userID": "user-1", "custom:workspaceID": "", "custom:tenantId": "tenant-a",
		}},
		{"empty tenantId", map[string]string{
			"custom:userID": "user-1", "custom:workspaceID": "ws-1", "custom:tenantId": "",
		}},
		{"all missing", map[string]string{}},
	}
	h := newHandler()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := h.Validate(context.Background(), eventWithClaims(tc.claims))
			if !errors.Is(err, ErrMissingClaim) {
				t.Errorf("expected ErrMissingClaim; got %v", err)
			}
		})
	}
}

// TestValidate_NeverTrustsCallerTenantId pins behaviour: the validator only
// asserts presence — it does NOT compare against any request-supplied value.
// Tenant resolution happens at token-mint time from
// docuploader-api-workspaces; the token claims are the source of truth.
func TestValidate_NeverTrustsCallerTenantId(t *testing.T) {
	h := newHandler()
	err := h.Validate(context.Background(), eventWithClaims(map[string]string{
		"custom:userID":      "user-1",
		"custom:workspaceID": "ws-1",
		"custom:tenantId":    "tenant-from-token", // never compared with anything
	}))
	if err != nil {
		t.Fatalf("validator should not require external comparison; got %v", err)
	}
}
