# office-conversion-aspose-container — Code Summary

| File | Purpose |
| --- | --- |
| `CMakeLists.txt` | C++20; Boost + cpp-httplib + nlohmann_json via Conan; builds `aspose_render` binary |
| `conanfile.txt` | Conan manifest-mode deps |
| `include/render.h` | Public API: `probe()`, `render()`, `DocumentProcessingError` |
| `src/render.cpp` | Adapter facade — actual Aspose.Total-for-C++ bindings hooked at build time (licence-gated); inception-stage scaffold throws `DocumentProcessingError` so the orchestrator's Two-Catch path is exercised |
| `src/main.cpp` | cpp-httplib server: `GET /healthz`, `GET /pages?path=…`, `POST /render` (JSON body). Errors map to 422 with `DocumentProcessingError` code or 500 for unexpected |
| `tests/CMakeLists.txt` + `tests/render_test.cpp` | GoogleTest unit tests on input-validation invariants |
| `Dockerfile.test` + `Makefile` + `.dockerignore` | **Conan-in-Docker test harness**: `make test` builds the test image and runs `ctest` inside it; no local Conan / CMake / GoogleTest install required (only Docker). `make shell` drops into the image for ad-hoc debugging; `make test-clean` forces a `--no-cache` rebuild. The production runtime image is built separately and reuses the same Conan-install layer via cache mount |

**Wiring**: licence Secret `aspose-licence` mounted at `/opt/aspose/license`; runs as container #1 inside the `office-conversion-orchestrator-sidecar` Pod; exposes :8081 on localhost.

**Why a facade**: keeps the container build green and the rest of the pipeline testable even before the Aspose binding is wired in (licence procurement is operator-managed and out of engineering scope).
