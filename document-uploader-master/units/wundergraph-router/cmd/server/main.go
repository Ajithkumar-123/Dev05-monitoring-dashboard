// The wundergraph-router process embeds the WunderGraph router binary plus
// the docuploader audit-emission middleware. At process start it loads its
// configuration from env (queue URL, schema location, resolver targets) and
// hands the HTTP/WS surface to the router. Audit emission runs as a
// middleware-style hook on every state-changing mutation.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/opus2/docuploader/units/wundergraph-router/internal/handler"
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

	auditURL := os.Getenv("AUDIT_SQS_QUEUE_URL")
	if auditURL == "" {
		logger.Error("AUDIT_SQS_QUEUE_URL not set")
		os.Exit(1)
	}
	redaction := strings.Split(os.Getenv("AUDIT_REDACTION_FIELDS"), ",")

	emitter := handler.NewAuditEmitter(sqs.NewFromConfig(cfg), auditURL, redaction, logger)

	// In production, the WunderGraph router binary is exec'd here with its
	// configured schema and the audit emitter wired as middleware via a
	// custom module hook. For the inception-stage scaffold we stand up a
	// minimal HTTP surface that exercises the emitter on /audit-probe.
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/audit-probe", func(w http.ResponseWriter, r *http.Request) {
		event := handler.AuditEvent{
			TenantID:    r.Header.Get("X-Tenant-Id"),
			WorkspaceID: r.Header.Get("X-Workspace-Id"),
			UserID:      r.Header.Get("X-User-Id"),
			Mutation:    "probe",
			Payload:     map[string]any{"probe": true},
		}
		if err := emitter.Emit(r.Context(), event); err != nil {
			logger.Error("emit failed", "error", err)
			http.Error(w, "emit failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	logger.Info("wundergraph-router scaffold listening", "addr", srv.Addr)
	go func() { _ = srv.ListenAndServe() }()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
