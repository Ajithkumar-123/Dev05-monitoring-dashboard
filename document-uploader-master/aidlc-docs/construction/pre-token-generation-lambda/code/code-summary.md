# pre-token-generation-lambda — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; `provided.al2023` runtime with `aws-lambda-go` |
| `cmd/bootstrap/main.go` | Lambda entrypoint (binary name `bootstrap` per `provided.al2023` convention); `lambda.Start` with `HandleRequest`; JSON slog initialised once in `init()` |
| `internal/handler/handler.go` | Validates required custom claims (`custom:userID`, `custom:workspaceID`, `custom:tenantId`) present and non-empty; returns `ErrMissingClaim` otherwise |

**Wiring**: IAM role `docuploader-pre-token-generation-lambda` (read Secrets Manager for any JWK material in production); event source = Cognito Pre Token Generation trigger (sandbox-managed).

**Forward-compatibility**: Returning a `CognitoEventUserPoolsPreTokenGen` shape lets a future Opus 2 IdP re-point at this same hook without code change. The validator currently asserts claim presence; JWK-based signature verification is a follow-on per-environment configuration (JWKs URL via env var) and is intentionally not hard-coded.

**Build**: `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/bootstrap` then package as zip per AWS Lambda provided.al2023 convention.
