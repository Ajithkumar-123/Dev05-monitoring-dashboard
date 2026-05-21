# react-web-module

**Tier**: Web
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: Static asset bundle (served from CloudFront/S3 or embedded directly in host applications)

## Purpose
Embeddable TypeScript / React module fronting the GraphQL API. Provides upload UX, status surfacing (via `Document.statusChanged` subscription), and output retrieval. No inline preview or annotation at MVP.

## Responsibilities
- Upload UX: presigned-URL PUT to `docuploader-api-staging`
- Real-time status grid via WebSocket subscription on `Document.statusChanged`
- Output set retrieval and download from `Document.outputs`
- OIDC token consumption from host application (token source wired by integrator)
- No workspace-admin UI in MVP

## Inputs (consumed)
- Public GraphQL API (WunderGraph router) over HTTPS + `graphql-transport-ws`
- OIDC token from host application

## Outputs (produced)
- S3 PUTs (via presigned URLs)
- GraphQL queries / mutations / subscriptions

## Dependencies
- `wundergraph-router` (API surface), `document-resolver` (via router), `batch-resolver` (via router)

## Test gate
Three-tier — Local: `vitest` + `fast-check` + `msw` for UI + mocked GraphQL; LocalStack: end-to-end against LocalStack-backed router; Sandbox: real WunderGraph + real S3 presigned uploads + real WebSocket subscriptions.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/react-web-module/`
- Source: `units/react-web-module/`
