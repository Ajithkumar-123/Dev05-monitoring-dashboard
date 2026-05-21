# pre-token-generation-lambda

**Tier**: API
**Language**: Go
**Compute**: AWS Lambda (Sync variant; `provided.al2023` runtime)

## Purpose
OIDC token validation surface. Validates inbound tokens carrying custom claims `userID`, `workspaceID`, `tenantId`. Re-pointable at a future Opus 2 IdP's pre-token-generation hook without code change.

## Responsibilities
- Validate token signature, expiry, issuer, audience
- Assert required custom claims present
- Resolve tenancy from token claims (never from caller-supplied input downstream)
- Reject invalid/missing claims with 401/403

## Inputs (consumed)
- Inbound OIDC tokens from clients (via WunderGraph router)
- Cognito (token-validation surface only at MVP)

## Outputs (produced)
- Validation decision returned to caller (router middleware)
- Cached JWKs (in-Lambda 12-minute TTL)

## Dependencies
- `platform-iam-and-security` (Secrets Manager for any verification secrets; IAM role)

## Test gate
Three-tier — Local: unit + property tests on token validation; LocalStack: Secrets Manager; Sandbox: real Cognito-minted tokens (and synthetic invalid tokens).

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/pre-token-generation-lambda/`
- Source: `units/pre-token-generation-lambda/`
