# office-conversion-aspose-container

**Tier**: Pipeline (sidecar-pattern Pod, container #1 of 2)
**Language**: C++ (C++20)
**Compute**: EKS Deployment (co-deployed with `office-conversion-orchestrator-sidecar`)

## Purpose
Aspose.Total-for-C++ converter. Renders Office formats (DOCX, DOC, RTF, XLSX, PPTX, etc.) to PDF chunk-by-chunk under bounded RAM. Aspose commercial licence is mounted from a Kubernetes Secret in the `aspose-converter` namespace at `/opt/aspose/license/Aspose.Total.Cpp.lic`.

## Responsibilities
- Accept REST + JSON requests on `localhost` from the orchestrator sidecar
- Render one chunk per request; return PDF bytes (or error envelope)
- Bounded peak RAM per chunk irrespective of total input file size
- Stateless — no inter-request shared state in the container

## Inputs (consumed)
- REST + JSON from `office-conversion-orchestrator-sidecar` (`localhost`)
- Aspose licence secret (mounted file)

## Outputs (produced)
- Per-chunk PDF bytes returned over `localhost` REST

## Dependencies
- `platform-iam-and-security` (Secrets Manager → Aspose licence Kubernetes Secret), `platform-network-and-compute` (namespace + ServiceAccount), CMake + Conan toolchain (build-time)

## Test gate
Three-tier — Local: GoogleTest unit + property tests on per-chunk RAM bound + valid-PDF output invariant; LocalStack: N/A (no AWS dependencies inside container); Sandbox: end-to-end via orchestrator sidecar against the reference corpus.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/office-conversion-aspose-container/`
- Source: `units/office-conversion-aspose-container/`
