# wundergraph-router

**Tier**: API
**Language**: Go
**Compute**: EKS Deployment

## Purpose
Public GraphQL entry point. Composes the schema across the three Go resolvers, serves HTTP (queries/mutations) and `graphql-transport-ws` (subscriptions), and emits audit events on every state-changing mutation via the custom audit-emission module.

## Responsibilities
- Schema composition (Workspace + Batch + Document subgraphs)
- HTTP + WebSocket transport
- Subscription fan-out for `Document.statusChanged`
- Audit-event emission: one SQS message per state-changing mutation, including actor, request_id, idempotency_key, and mutation payload (subject to redaction rules)
- W3C Trace Context propagation into downstream gRPC calls

## Inputs (consumed)
- gRPC backends: `workspace-resolver`, `batch-resolver`, `document-resolver`
- Token validation: `pre-token-generation-lambda` (validates inbound OIDC tokens)
- Service-account JWT from Secrets Manager (`GRAPHQL_INTERNAL_AUTH_SECRET_ARN`)

## Outputs (produced)
- Public GraphQL surface (HTTP + WS) on the ALB hostname
- SQS messages to `docuploader-api-audit-events`

## Dependencies
- All three resolver units
- `pre-token-generation-lambda`
- `platform-orchestration` (audit SQS queue), `platform-iam-and-security` (service-account secret + IRSA), `platform-network-and-compute` (ALB Ingress)

## Test gate
Three-tier — Local: schema composition + `vitest`-style integration with mocked resolvers; LocalStack: SQS + Secrets Manager; Sandbox: end-to-end E2E across MVP journeys.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/wundergraph-router/`
- Source: `units/wundergraph-router/`
