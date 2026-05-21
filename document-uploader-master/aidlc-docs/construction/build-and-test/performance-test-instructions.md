# Performance Test Instructions

## MVP posture: baseline establishing — no numeric SLO thresholds

Per `requirements.md` NFR-1.3, numeric SLO thresholds (p50/p95/p99, throughput floors, availability, MTTR) are **deferred to post-MVP**. The MVP performance gate is **functional-pass/fail**, focused on:

1. Linear horizontal scalability per route (hard pass/fail gate)
2. Bounded per-pod RAM as input size varies (property invariant)

## Linear-scalability gate (binding pass/fail)

Per `requirements.md` NFR-1.1 + MVP success criterion #2:

```bash
# For each of the 6 routes, run steady-load injection at varying replica counts.
for route in ocr-direct convert/office convert/html convert/image convert/tiff email archive media; do
  for replicas in 1 2 4 8; do
    kubectl scale deployment <route-worker> -n docuploader --replicas=$replicas
    # Wait for KEDA to stabilise
    sleep 60
    # Inject steady load: 5 minutes at <route>-specific corpus size
    docuploader-load-injector --route=$route --duration=5m --rate-per-replica=10
    # Record throughput curve into Grafana (manual export)
    docuploader-load-injector --collect=$route-$replicas-replicas.csv
  done
done
```

**Pass criterion**: throughput per route scales approximately linearly with replica count up to sandbox capacity. The "approximately" is operator-judged from the curve shape — sub-linear behaviour after a knee is acceptable if attributed to sandbox capacity (document the cut-off).

## Per-pod RAM bound (property invariant)

Per `requirements.md` NFR-1.2: peak RAM must not grow with input file size.

Property-based tests in each conversion worker (binding via `property-based-testing` extension):

| Worker | Property |
| --- | --- |
| `office-conversion-orchestrator-sidecar` | Peak RSS bounded by `CHUNK_PAGES` setting independent of total page count |
| `pdf-processing-service` | Peak RSS bounded by single-page extract size |
| `image-tiff-conversion-service` | Peak RSS bounded by ranged tile size |
| `zip-extraction-service` | Peak RSS bounded by per-entry chunk size |
| `media-conversion-service` | Peak RSS bounded by FFmpeg streaming buffer |

Hypothesis / fast-check / hand-rolled property runners inject inputs across the design's expected size range and assert peak RSS stays below the per-pod budget.

## Reference-corpus regression (binding)

Per MVP success criterion #1: a curated mixed-format corpus processes end-to-end across all 6 routes producing expected outputs or expected slipsheets.

```bash
docuploader-corpus-runner --corpus=opus2-reference-corpus-v1 --emit=allure-results/
```

Corpus is operator-supplied (sourced outside the project per Q26 ratification).
