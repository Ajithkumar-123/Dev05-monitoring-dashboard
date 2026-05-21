package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/opus2/docuploader/libs/data-access/go/documents"
	"github.com/opus2/docuploader/libs/data-access/go/dynamoclient"
	"github.com/opus2/docuploader/units/document-resolver/internal/handler"
	"google.golang.org/grpc"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		logger.Error("aws config load failed", "error", err)
		os.Exit(1)
	}

	stagingBucket := envOr("STAGING_BUCKET", "docuploader-api-staging")
	presignTTL := envOr("PRESIGN_TTL", "15m")

	ddb := dynamoclient.New(cfg)
	s3c := s3.NewFromConfig(cfg)
	presigner := s3.NewPresignClient(s3c)

	addr := envOr("LISTEN_ADDR", ":50053")
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		logger.Error("listen failed", "addr", addr, "error", err)
		os.Exit(1)
	}

	srv := grpc.NewServer()
	h := handler.New(documents.NewClient(ddb), presigner, stagingBucket, presignTTL, logger)
	handler.Register(srv, h)

	logger.Info("document-resolver listening", "addr", addr, "stagingBucket", stagingBucket)
	go func() { _ = srv.Serve(lis) }()

	<-ctx.Done()
	logger.Info("shutting down")
	srv.GracefulStop()
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
