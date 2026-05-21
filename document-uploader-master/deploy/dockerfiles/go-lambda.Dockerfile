# Lambda container image — provided.al2023 runtime + bootstrap binary.
# Used by: pre-token-generation-lambda, document-event-handler-lambda,
# audit-event-storage-lambda, update-document-state-lambda.
ARG UNIT_NAME

FROM golang:1.23-alpine AS build
ARG UNIT_NAME
RUN apk add --no-cache git ca-certificates
WORKDIR /workspace

# Mirror the repo layout so the replace directive `../../libs/data-access/go`
# resolves correctly from /workspace/units/<unit>/ (R-6 fix, same as go-service).
COPY libs/data-access/go ./libs/data-access/go

WORKDIR /workspace/units/${UNIT_NAME}
COPY units/${UNIT_NAME}/go.mod units/${UNIT_NAME}/go.sum ./
RUN go mod download
COPY units/${UNIT_NAME}/ ./
RUN CGO_ENABLED=0 GOOS=linux go build \
      -tags lambda.norpc \
      -ldflags='-s -w -extldflags "-static"' \
      -o /out/bootstrap ./cmd/bootstrap

FROM public.ecr.aws/lambda/provided:al2023
COPY --from=build /out/bootstrap /var/runtime/bootstrap
CMD ["bootstrap"]
