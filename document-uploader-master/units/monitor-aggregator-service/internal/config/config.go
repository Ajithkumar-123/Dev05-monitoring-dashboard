// Package config loads the aggregator's YAML configuration. The shape is
// intentionally small so the dashboard can also read the same file in dev
// (one source of truth for "what services do we monitor").
package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Service describes a single backend whose /healthz the aggregator polls.
type Service struct {
	Unit      string `yaml:"unit"`
	Archetype string `yaml:"archetype"`
	URL       string `yaml:"url"`
}

// Config is the root document.
type Config struct {
	// How often the poller wakes up. Defaults to 10s if not set.
	PollInterval time.Duration `yaml:"poll_interval"`
	// Per-probe timeout. Defaults to 2s if not set.
	ProbeTimeout time.Duration `yaml:"probe_timeout"`
	// Services to poll.
	Services []Service `yaml:"services"`
}

// Load reads + parses the YAML config file at path. Missing optional fields
// fall back to sensible defaults; missing required fields produce errors.
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", path, err)
	}
	var c Config
	if err := yaml.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("parse %q: %w", path, err)
	}
	if c.PollInterval == 0 {
		c.PollInterval = 10 * time.Second
	}
	if c.ProbeTimeout == 0 {
		c.ProbeTimeout = 2 * time.Second
	}
	if len(c.Services) == 0 {
		return nil, fmt.Errorf("config %q: no services defined", path)
	}
	for i, s := range c.Services {
		if s.Unit == "" {
			return nil, fmt.Errorf("service[%d]: unit name is required", i)
		}
		if s.URL == "" {
			return nil, fmt.Errorf("service[%d:%s]: url is required", i, s.Unit)
		}
	}
	return &c, nil
}
