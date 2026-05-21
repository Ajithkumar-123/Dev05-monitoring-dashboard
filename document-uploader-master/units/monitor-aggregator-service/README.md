# monitor-aggregator-service

Small Go HTTP service that polls each docuploader service's `/healthz` on a fixed interval, caches the latest result in memory, and exposes:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/snapshot` | JSON of the latest cached state for all configured services |
| `GET /api/stream`   | Server-Sent Events — pushes the snapshot on every poll |
| `GET /healthz`      | Its own liveness probe (always 200 OK) |

The React dashboard consumes `/api/stream` so tiles update in real time without the browser having to poll each service directly (which would require 22× CORS allowances).

## Run it locally

```bash
cd units/monitor-aggregator-service
cp monitor.config.example.yaml monitor.config.yaml
# edit monitor.config.yaml — replace cluster.local URLs with whatever you can reach
go run ./cmd/server --config ./monitor.config.yaml --listen :8080

# in another terminal:
curl http://localhost:8080/api/snapshot | jq
curl -N http://localhost:8080/api/stream
```

## Config format

```yaml
poll_interval: 10s
probe_timeout: 2s
services:
  - unit: workspace-resolver
    archetype: go-service
    url: http://workspace-resolver.docuploader.svc.cluster.local:50051
  - unit: classification-service
    archetype: ts-service
    url: http://classification-service.docuploader.svc.cluster.local:8080
  # ... up to 22 entries
```

`url` should NOT include `/healthz` — the poller appends it. See [monitor.config.example.yaml](./monitor.config.example.yaml) for the full 22-unit catalog.

## Snapshot shape

```json
{
  "generatedAt": 1716203400123,
  "pollEveryMs": 10000,
  "services": [
    {
      "unit": "workspace-resolver",
      "archetype": "go-service",
      "url": "http://workspace-resolver.docuploader.svc.cluster.local:50051",
      "state": "OK",
      "latencyMs": 24,
      "checkedAt": 1716203400118
    },
    {
      "unit": "office-conversion-aspose-container",
      "archetype": "cpp-aspose",
      "url": "http://office-conversion-aspose-container.docuploader.svc.cluster.local:8080",
      "state": "DOWN",
      "message": "dial tcp: i/o timeout",
      "checkedAt": 1716203400119
    }
  ]
}
```

State values: `OK` (2xx), `DEGRADED` (non-2xx response), `DOWN` (timeout / connection refused / DNS), `UNKNOWN` (before first poll).

## Deploy (manual — don't run from here)

The chart matches the pattern in [units/react-web-module/helm/](../react-web-module/helm/). It:
- Mounts the YAML config from a `ConfigMap` at `/etc/monitor/monitor.config.yaml`
- Uses plain ServiceAccount (no IRSA)
- Service-side ClusterIP on port 8080
- Probes its own `/healthz`

```bash
cd units/monitor-aggregator-service/helm
helm dep build
helm upgrade --install docuploader-monitor-aggregator . \
  --namespace docuploader-dev05 --create-namespace \
  --set image.repository=537462380503.dkr.ecr.eu-west-1.amazonaws.com/docuploader/monitor-aggregator-service \
  --set image.tag=dev05 \
  --set-file 'config.servicesYaml=../monitor.config.dev05.yaml'
```

## Wiring the dashboard to the aggregator

In the React `react-web-module` unit, set:

```
VITE_HEALTH_MODE=live
VITE_HEALTH_AGGREGATOR_URL=https://docuploader-monitor-aggregator.dev05.k8s.opus2dev.com
```

(That env var doesn't exist yet — Track 3 of the plan will add aggregator support to the dashboard's `health.ts`.)

## What this service is NOT

- It does not store metrics history (use Prometheus / CloudWatch for that)
- It does not run Synthetic checks or run any code on the target services
- It does not authenticate — anyone with network access to the aggregator can read snapshots
- It does not aggregate logs — just probe results

For long-term metric retention or alerting, you still want a real observability stack. This service exists to give the dashboard a single endpoint to consume without each browser doing 22 cross-origin fetches.

## Files

```
monitor-aggregator-service/
├── go.mod
├── cmd/server/main.go              HTTP + SSE handlers, signal handling
├── internal/config/config.go       YAML loader with defaults
├── internal/poller/poller.go       Polls, caches, fans out via SSE
├── monitor.config.example.yaml     22-unit catalog
├── helm/
│   ├── Chart.yaml                  depends on docuploader-chassis 0.1.0
│   ├── values.yaml                 small resources, ConfigMap mount, ALB-free
│   └── templates/manifests.yaml    SA + chassis Deployment + Service + ConfigMap
└── README.md                       this file
```
