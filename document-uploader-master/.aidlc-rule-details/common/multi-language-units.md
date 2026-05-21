# Multi-Language Units

Standing rule for units that ship deliverables in more than one programming language.

Status: **bootstrap-authoritative**. Engineers wanting a new language file a phase to extend the slug matrix below; ad-hoc edits in consumer repos are overwritten on next bootstrap upgrade.

---

## 1. Definition

A **multi-language unit** is a single unit-of-work whose tier-1 deliverables include source code (or build artefacts) in two or more programming languages. The canonical example in this project is `platform-data`: Terraform for AWS resources **plus** a tri-language data-access library at `libs/data-access/{go,python,typescript}/`.

A unit is **not** multi-language merely because its build tooling spans languages (e.g., a Python service whose Helm chart uses YAML). The slug matters: if the unit's **runtime deliverable** is Python-only, the unit is `py` even if it ships YAML.

---

## 2. Project structure rule

**Split-by-language-first**, then idiomatic per-language layout. For multi-language units:

```text
units/<unit-id>/
├── <slug-a>/                # e.g. terraform/, go/, py/, ts/, cpp/
│   └── <idiomatic per-language tree>
└── <slug-b>/
    └── <idiomatic per-language tree>
```

For shared libraries that span multiple languages (rare; see § 7 below):

```text
libs/<library-name>/
├── go/                      # Go module
├── python/                  # uv-managed package
├── typescript/              # pnpm-managed package
└── cpp/                     # CMake + Conan project (when applicable)
```

**Root-level shared modules are prohibited** outside this `libs/<library-name>/` convention. All cross-unit sharing goes through versioned package managers, never path imports that bypass the unit boundary.

---

## 3. Slug matrix

Per-slug build and dependency conventions. Each slug entry is the **single source of truth** for how that language's source code is laid out, built, tested, and consumed as a sibling dependency.

### ts

- **slug:** `ts`
- **canonical-manifest:** `package.json`
- **bt-toolchain:** `pnpm install --frozen-lockfile && pnpm test` (default; `tool: npm|yarn` opt-in is reserved for forward-compat consumers)
- **vendor-stanza:** `"<sibling>": "workspace:*"` in `dependencies` of `package.json` (for in-workspace siblings); `"<sibling>": "file:./_vendor/<sibling>"` for out-of-workspace vendored siblings
- **vendor-target-dir:** `<unit>/ts/_vendor/<sibling>/` (when the consumer is not part of a pnpm workspace)
- **idiomatic layout:** `src/` + `tests/` + `package.json` + `pnpm-lock.yaml` + `tsconfig.json`
- **notes:** Covers TS-only and TS+JS-mixed via `tsconfig.allowJs`. Pure-JS-only is a future `js/` slug when a real consumer needs it. `_vendor/` is preferred over `vendor/` for parity with the `go` slug (so the directory name signals "build-tool ignores").

### go

- **slug:** `go`
- **canonical-manifest:** `go.mod`
- **bt-toolchain:** `go mod tidy && go build ./... && go test ./...`
- **vendor-stanza:** `replace <sibling-module-path> => ./_vendor/<sibling>` in `go.mod` (paired with a corresponding `require <sibling-module-path> v0.0.0-00010101000000-000000000000` line — Go pseudo-version for local replaces)
- **vendor-target-dir:** `<unit>/go/_vendor/<sibling>/` — after extraction, the sibling's canonical `<canonical-manifest>` (`go.mod`) sits at the root of this directory (slug-slice extraction; non-slug files are not shipped)
- **idiomatic layout:** `cmd/<binary>/main.go` + `internal/` + `pkg/` (only when exposing a library) + `go.mod` + `go.sum`
- **notes:** Use `_vendor/` **not** `vendor/`. The Go toolchain auto-activates vendor mode when a `vendor/` directory exists at the module root, which would silently change build semantics. Underscore-prefixed and dot-prefixed directories are explicitly ignored by Go tooling. The `replace` directive requires a `go.mod` at the target path; vendor-extraction (point above) preserves this.

### py

- **slug:** `py`
- **canonical-manifest:** `pyproject.toml`
- **bt-toolchain:** `uv sync --locked && uv run pytest` (default; `tool: pip|poetry` opt-in is reserved for forward-compat consumers)
- **vendor-stanza:** `<sibling> = { path = "./_vendor/<sibling>", editable = false }` under `[tool.uv.sources]` in `pyproject.toml`. The sibling must also appear in `[project] dependencies = ["<sibling>", ...]`
- **vendor-target-dir:** `<unit>/py/_vendor/<sibling>/` — after extraction, the sibling's canonical `pyproject.toml` sits at the root of this directory (slug-slice extraction)
- **idiomatic layout:** `src/<package_name>/` + `tests/` + `pyproject.toml` + `uv.lock` + `.python-version`
- **notes:** uv-flavored only. `editable = false` is the binding default — engineers editing a vendored sibling must re-vendor to see changes; this trades dev ergonomics for reproducibility. pip / poetry overrides are forward-compat (frontmatter `tool: pip|poetry`) and explicitly out of v1 scope.

### cpp

- **slug:** `cpp`
- **canonical-manifest:** `CMakeLists.txt`
- **bt-toolchain:** `conan install . --output-folder=build --build=missing && cmake -S . -B build/build --preset conan-release && cmake --build build/build && ctest --test-dir build/build --output-on-failure`. **A Conan-in-Docker harness (`Dockerfile.test` + `Makefile`) is the canonical entrypoint** — `make test` runs the same toolchain inside a controlled image so consumers need only Docker on their workstation.
- **vendor-stanza:** `conan-package` reference in `conanfile.txt` `[requires]` for siblings published as Conan packages. For path-based local siblings, use a Conan editable + `editable add ./_vendor/<sibling>` outside of v1 (path-based C++ sibling deps are deferred until a real consumer emerges).
- **vendor-target-dir:** `<unit>/cpp/_vendor/<sibling>/`
- **idiomatic layout:** `src/` + `include/` + `tests/` + `CMakeLists.txt` + `conanfile.txt`
- **notes:** Conan manifest mode only. Licensed binary dependencies (e.g. Aspose.Total for C++) are mounted at runtime via Kubernetes Secret, not vendored.

---

## 4. Vendor-target-dir extraction contract

For all slugs:

- The bootstrap upgrade tool extracts the **slug-slice** of the sibling, not the full multi-language tree. So when a Go consumer vendors `libs/data-access`, only `libs/data-access/go/` is materialised at `<unit>/go/_vendor/<sibling>/`.
- The sibling's `<canonical-manifest>` lands at the root of the target directory. The `vendor-stanza` paths in § 3 assume this layout.
- Non-slug files are not shipped: a Go consumer never receives the sibling's `python/` or `typescript/` trees.

---

## 5. Diamond dependencies

**Engineers must add a vendor-stanza line for every transitive sibling**, including those introduced by a directly-vendored sibling. Vendor-stanza propagation is **not transitive** in any slug:

- **Go**: `replace lib-A => …` in lib-A's `go.mod` is ignored by the consumer; the consumer must add its own `replace lib-A => …` line.
- **TS**: `workspace:*` deps propagate inside a pnpm workspace, but `file:./_vendor/<sibling>` deps do not.
- **Python**: `[tool.uv.sources]` is project-local. Consumers must restate every vendored sibling.

This is intentional — it keeps vendor lockfiles deterministic and prevents silent transitive drift. The bootstrap upgrade tool surfaces missing transitive entries as a blocking finding before regenerating the consumer.

---

## 6. Cross-language parity

Multi-language libraries that expose the same conceptual API across slugs (e.g. `libs/data-access/{go,python,typescript}/`) MUST:

1. **Expose the same surface** — one client per logical resource (e.g. `workspaces.Client`, `batches.Client`, …) with idiomatic per-language API shapes.
2. **Carry no business logic** — pure data-access primitives only. Business logic lives in the consumer units.
3. **Be bit-identical** on any cross-language algorithm (hash derivation, key generation, TTL computation). Cross-language parity tests are **required**: a shared golden input must produce a bit-identical hex/byte output in each language.
4. **Use length-prefix encoding for any composite serialisation that feeds a hash** — delimiter joining is collision-vulnerable. See § 8 (lessons learned).

### Required cross-language test surface

| Property | Test pattern |
| --- | --- |
| Algorithm parity | Same golden inputs → same hex digest in each language's test suite |
| Idempotency-key determinism | Same components → same key on every call |
| Distinct on any component change | Changing any one input changes the output |
| Delimiter / encoding safety | Adversarial inputs (e.g. containing the delimiter byte) MUST NOT collide |

---

## 7. When to build a multi-language library vs. duplicate

Default: **don't build a multi-language library**. Each unit's needs are usually unit-local.

Build one only when **all three** hold:

1. Three or more consumers across two or more languages need the same primitives.
2. Bit-identical behaviour matters for correctness (e.g. hash derivation, idempotency keys).
3. The primitives are pure data — no business logic, no policy decisions, no external service calls.

The canonical fit in this project is `libs/data-access/`: shared typed clients + entity types for the 7 DynamoDB tables, consumed by 8 Go callers, 2 Python callers, and 9 TypeScript callers. Without parity, the cross-language idempotency-key collision would have shipped to production.

---

## 8. Lessons learned (audit-derived)

These are project-specific corrections logged in `audit.md` and pinned here for future units.

1. **Delimiter-injection in cross-language hash derivation.** Joining components with a delimiter byte (e.g. `\x1f`) before hashing is collision-vulnerable under adversarial inputs. **Use length-prefix encoding** (4-byte big-endian length, then UTF-8 bytes) across all language implementations. Verified by a `test_delimiter_safety` case that must fail-then-pass on the corrected implementation.

2. **Go `internal/` blocks cross-module imports.** When a multi-language library exposes a Go sub-package, that sub-package MUST NOT live under `internal/` if consumers import it from a different Go module. Go's visibility rule rejects `use of internal package ... not allowed` at compile time. Place shared Go helpers at the library's top level (e.g. `libs/data-access/go/dynamoclient/`).

3. **Lockfiles are CI-generated, not pre-committed.** Committing pre-CI lockfiles is stale-on-arrival; each slug's lockfile (`go.sum`, `uv.lock`, `pnpm-lock.yaml`) is regenerated on the first `<bt-toolchain>` run. CI uses `--frozen-lockfile` / `--locked` modes.

4. **C++ tests via Conan-in-Docker.** Local Conan/CMake/GoogleTest installs vary widely across workstations and CI runners. Ship a `Dockerfile.test` + `Makefile` per C++ unit so `make test` is the single canonical invocation; CI uses the same image as the contract.

---

## 9. Canonical example

`libs/data-access/` in this repo is the reference for everything above:

- Split-by-language-first: `libs/data-access/{go,python,typescript}/`
- Per-slug idiomatic layout under each language root
- Same conceptual surface (`workspaces`, `batches`, `documents`, `auditevents`, `contenthashes`, `pipelinefiles`, `tasktokens` clients) in all three
- Bit-identical `deriveUpdateStatusKey` across Go / Python / TypeScript, verified by per-language tests on shared golden inputs
- Length-prefix encoding (lesson learned § 8.1)
- `dynamoclient` placed at top level, not under `internal/` (lesson learned § 8.2)
- Lockfiles deferred to CI first-install (lesson learned § 8.3)

---

## 10. How this rule is used

| AI-DLC stage | Use |
| --- | --- |
| **Units Generation** | Identify multi-language units and apply § 2 project structure; flag candidates for § 7 multi-language library promotion |
| **Application Design** | Place cross-cutting libraries at `libs/<name>/` per § 2; ensure consumers' tier-1 deliverables align with one slug |
| **Code Generation** | Author per-language source under the slug-specific idiomatic layout; populate the canonical manifest from § 3 |
| **Build and Test** | Wire per-language `bt-toolchain` per § 3; author cross-language parity tests per § 6 for any multi-language library |
| **Review / audit** | Cross-reference § 8 lessons learned before accepting a new multi-language unit |
