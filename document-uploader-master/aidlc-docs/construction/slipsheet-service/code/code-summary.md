# slipsheet-service — Code Summary

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker loop on `slipsheet` queue; renders a deterministic 1-page slipsheet PDF with the original filename, MIME, and reason; hands off to `output-assembly` with `nativeTrigger=SLIPSHEET` |

The slipsheet branch is the binding fallback (per `application-design.md` Two-Catch) — no document is silently dropped.
