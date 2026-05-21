# Build and Test Summary

## Status: instructions complete; execution is operator-driven at MVP

CI/CD pipeline implementation is **descoped from MVP** per `tech-environment.md`. At MVP, CI per unit is limited to language-standard lint + unit tests + lockfile-strict install. The full build/deploy pipeline runs **push-based via CLI tooling** (`terraform apply`, `kubectl apply`, `helm upgrade`).

## Document index

| Document | Purpose |
| --- | --- |
| `build-instructions.md` | Per-tier build sequence (Tier-1 Terraform → Tier-2 Go → Tier-3 mixed → Tier-4 React bundle); Helm + Kustomize deploy commands; per-language lockfile policy |
| `unit-test-instructions.md` | Three-tier minimum gate (Local + LocalStack + Sandbox); per-language toolchains (Go/Python/TypeScript/C++); Allure reporting requirements; property-test surface per unit |
| `integration-test-instructions.md` | LocalStack setup; per-language integration runners; Textract/GuardDuty mock policy; sandbox-deployed integration with the 4 MVP journey suites |
| `performance-test-instructions.md` | Linear-scalability gate (binding pass/fail); per-pod RAM bound property invariants; reference-corpus regression |

## MVP definition-of-done (from `requirements.md` § 6)

- [ ] All 27 units built and deployed to the sandbox (Tier-1 + Tier-2 + Tier-3 + Tier-4 complete)
- [ ] Reference-corpus regression green across all 6 routes (`performance-test-instructions.md`)
- [ ] Linear horizontal scalability evidenced (`performance-test-instructions.md`)
- [ ] Per-tenant isolation evidenced (J1 + J3 journey tests; KMS-alias verification runbook)
- [ ] Audit-event delivery proven — DDB hot store + Glacier IR cold store both receive synthetic probes; zero DLQ accumulation (J4 journey + `audit-event-storage-lambda` Sandbox suite)
- [ ] `Document.statusChanged` subscription proven — every state transition delivered (J2 + J3)
- [ ] Token validation proven — `pre-token-generation-lambda` rejects 401/403 on missing/invalid claims
- [ ] Forced-slipsheet behaviour proven — CSV/ODS → `nativeTrigger=SLIPSHEET` (J3 + `classification-service` Sandbox)
- [ ] Two-Catch error pattern proven via synthetic injection (`DocumentProcessingError` → slipsheet; `States.ALL` → `HandleError → Failed`)
- [ ] Security review complete — no Sev-1 findings; SOC 2 / ISO 27001 mapping; OWASP Top 10 via `security-baseline` extension
- [ ] Allure reports generated across all 4 languages
- [ ] Three-tier test gate green for every unit
- [ ] KMS-alias rotation runbook validated end-to-end
- [ ] Product + Security + SRE + Legal sign-off recorded (binding cohort)

## Extension compliance summary

| Extension | Status | Evidence |
| --- | --- | --- |
| `security-baseline` (OWASP Top 10) | Enabled | Per-category controls in `requirements.md` § NFR-3 + `application-design.md` § Cross-Cutting; IAM least-privilege per workload; KMS isolation; never-log set enforced at WunderGraph audit-emission middleware |
| `property-based-testing` | Enabled | Property surface enumerated per unit in `unit-test-instructions.md` |

## Operations stage

Placeholder per `CLAUDE.md`. Production-readiness deployment (multi-region, WAF, project-owned scanning, SBOM, CVE-patch SLAs) is **post-MVP follow-on**.
