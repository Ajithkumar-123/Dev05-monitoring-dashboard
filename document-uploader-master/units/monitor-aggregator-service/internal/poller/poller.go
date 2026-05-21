// Package poller probes each configured service's /healthz on a fixed
// interval, caches the latest snapshot, and fans out updates to SSE clients.
package poller

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/opus2/docuploader/units/monitor-aggregator-service/internal/config"
)

// State mirrors the dashboard's ServiceHealth shape so the JSON over the wire
// is what the React app already expects.
type State struct {
	Unit      string `json:"unit"`
	Archetype string `json:"archetype"`
	URL       string `json:"url"`
	StateName string `json:"state"` // OK | DEGRADED | DOWN | UNKNOWN
	LatencyMs *int   `json:"latencyMs,omitempty"`
	Message   string `json:"message,omitempty"`
	CheckedAt int64  `json:"checkedAt"` // unix millis
}

// Snapshot is what /api/snapshot returns and what SSE pushes.
type Snapshot struct {
	GeneratedAt int64   `json:"generatedAt"` // unix millis
	PollEveryMs int     `json:"pollEveryMs"`
	Services    []State `json:"services"`
}

// Poller polls services + serves cached snapshots to consumers.
type Poller struct {
	cfg    *config.Config
	client *http.Client
	log    *slog.Logger

	mu     sync.RWMutex
	latest Snapshot

	subsMu sync.Mutex
	subs   map[chan Snapshot]struct{}
}

// New constructs a Poller. Start it with Run(ctx).
func New(cfg *config.Config, log *slog.Logger) *Poller {
	return &Poller{
		cfg: cfg,
		log: log,
		client: &http.Client{
			Timeout: cfg.ProbeTimeout,
		},
		subs: make(map[chan Snapshot]struct{}),
		latest: Snapshot{
			GeneratedAt: time.Now().UnixMilli(),
			PollEveryMs: int(cfg.PollInterval / time.Millisecond),
			Services:    initialUnknownStates(cfg.Services),
		},
	}
}

// Run blocks until ctx is cancelled. Polls every cfg.PollInterval.
func (p *Poller) Run(ctx context.Context) {
	t := time.NewTicker(p.cfg.PollInterval)
	defer t.Stop()
	p.tick(ctx) // immediate first poll
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.tick(ctx)
		}
	}
}

// Snapshot returns the most recent cached snapshot.
func (p *Poller) Snapshot() Snapshot {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.latest
}

// Subscribe returns a channel that receives every new snapshot. Caller MUST
// call Unsubscribe(ch) when done (e.g. when the SSE request closes).
func (p *Poller) Subscribe() chan Snapshot {
	ch := make(chan Snapshot, 4)
	p.subsMu.Lock()
	p.subs[ch] = struct{}{}
	p.subsMu.Unlock()
	return ch
}

// Unsubscribe removes + closes a subscriber channel.
func (p *Poller) Unsubscribe(ch chan Snapshot) {
	p.subsMu.Lock()
	delete(p.subs, ch)
	p.subsMu.Unlock()
	close(ch)
}

// --- internals ---

func (p *Poller) tick(ctx context.Context) {
	results := make([]State, len(p.cfg.Services))
	var wg sync.WaitGroup
	for i, svc := range p.cfg.Services {
		wg.Add(1)
		go func(i int, svc config.Service) {
			defer wg.Done()
			results[i] = p.probe(ctx, svc)
		}(i, svc)
	}
	wg.Wait()

	snap := Snapshot{
		GeneratedAt: time.Now().UnixMilli(),
		PollEveryMs: int(p.cfg.PollInterval / time.Millisecond),
		Services:    results,
	}
	p.mu.Lock()
	p.latest = snap
	p.mu.Unlock()

	p.fanOut(snap)
}

func (p *Poller) probe(ctx context.Context, svc config.Service) State {
	startedAt := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, svc.URL+"/healthz", nil)
	if err != nil {
		return down(svc, "build request: "+err.Error())
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return down(svc, err.Error())
	}
	defer resp.Body.Close()
	lat := int(time.Since(startedAt).Milliseconds())
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return State{
			Unit:      svc.Unit,
			Archetype: svc.Archetype,
			URL:       svc.URL,
			StateName: "OK",
			LatencyMs: &lat,
			CheckedAt: time.Now().UnixMilli(),
		}
	}
	return State{
		Unit:      svc.Unit,
		Archetype: svc.Archetype,
		URL:       svc.URL,
		StateName: "DEGRADED",
		LatencyMs: &lat,
		Message:   resp.Status,
		CheckedAt: time.Now().UnixMilli(),
	}
}

func (p *Poller) fanOut(snap Snapshot) {
	p.subsMu.Lock()
	defer p.subsMu.Unlock()
	for ch := range p.subs {
		// Non-blocking send — drop the update if a subscriber is slow rather
		// than slowing every other client. SSE will get the next tick.
		select {
		case ch <- snap:
		default:
		}
	}
}

func down(svc config.Service, msg string) State {
	return State{
		Unit:      svc.Unit,
		Archetype: svc.Archetype,
		URL:       svc.URL,
		StateName: "DOWN",
		Message:   msg,
		CheckedAt: time.Now().UnixMilli(),
	}
}

func initialUnknownStates(services []config.Service) []State {
	out := make([]State, len(services))
	now := time.Now().UnixMilli()
	for i, s := range services {
		out[i] = State{
			Unit:      s.Unit,
			Archetype: s.Archetype,
			URL:       s.URL,
			StateName: "UNKNOWN",
			CheckedAt: now,
		}
	}
	return out
}
