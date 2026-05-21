# Build context = repo root; pass UNIT_NAME so one Dockerfile services every Go service.
# Used by: workspace-resolver, batch-resolver, document-resolver, wundergraph-router,
# email-extraction-service, virus-scanning-service.
#
# The container mirrors the repo layout under /workspace so the unit's go.mod
# replace directive (`replace … => ../../libs/data-access/go`) resolves correctly:
#   /workspace/units/<UNIT_NAME>/   ←  WORKDIR for the build
#   /workspace/libs/data-access/go/ ←  resolved by ../../libs/data-access/go
ARG UNIT_NAME

# --- build stage ---
FROM golang:1.23-alpine AS build
ARG UNIT_NAME
RUN apk add --no-cache git ca-certificates
WORKDIR /workspace

# Vendor the LIB-04 Go module at the same relative position the replace directive expects.
COPY libs/data-access/go ./libs/data-access/go

# Switch into the unit dir at its repo-relative path.
WORKDIR /workspace/units/${UNIT_NAME}
COPY units/${UNIT_NAME}/go.mod units/${UNIT_NAME}/go.sum ./
RUN go mod download

COPY units/${UNIT_NAME}/ ./
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags='-s -w -extldflags "-static"' \
      -o /out/server ./cmd/server

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
