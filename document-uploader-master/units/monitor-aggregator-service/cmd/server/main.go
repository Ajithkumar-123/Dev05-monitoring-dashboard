// Command server runs the docuploader monitor aggregator.
//
// It polls each configured service's /healthz endpoint on a fixed interval,
// caches the most recent result, and serves two endpoints:
//
//	GET /api/snapshot       — JSON of the latest cached state for all services
//	GET /api/stream         — Server-Sent Events stream pushing updates on every poll
//	GET /healthz            — its own liveness probe (always 200 OK)
//
// Config comes from --config <path> (YAML) or env vars. The poller never
// blocks the HTTP server; HTTP handlers read from an atomically-swapped snapshot.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/opus2/docuploader/units/monitor-aggregator-service/internal/config"
	"github.com/opus2/docuploader/units/monitor-aggregator-service/internal/poller"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	configPath := flag.String("config", envOr("MONITOR_CONFIG", "./monitor.config.yaml"), "Path to YAML config file")
	listenAddr := flag.String("listen", envOr("LISTEN_ADDR", ":8080"), "HTTP listen address")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("config load failed", "path", *configPath, "err", err)
		os.Exit(1)
	}
	logger.Info("config loaded", "services", len(cfg.Services), "interval", cfg.PollInterval)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	p := poller.New(cfg, logger)
	go p.Run(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/snapshot", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(p.Snapshot())
	})
	mux.HandleFunc("GET /api/stream", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		ch := p.Subscribe()
		defer p.Unsubscribe(ch)

		// Send the current snapshot immediately so the client doesn't wait one tick.
		if buf, err := json.Marshal(p.Snapshot()); err == nil {
			_, _ = w.Write([]byte("data: " + string(buf) + "\n\n"))
			flusher.Flush()
		}

		for {
			select {
			case <-r.Context().Done():
				return
			case snap, ok := <-ch:
				if !ok {
					return
				}
				if buf, err := json.Marshal(snap); err == nil {
					_, _ = w.Write([]byte("data: " + string(buf) + "\n\n"))
					flusher.Flush()
				}
			}
		}
	})

	srv := &http.Server{
		Addr:              *listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		logger.Info("listening", "addr", *listenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("listen error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envOrInt is kept around for future tunables (refresh seconds, etc.) — unused for now.
//nolint:unused
func envOrInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
