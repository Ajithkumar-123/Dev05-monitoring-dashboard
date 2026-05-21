// Aspose render adapter.
//
// The actual Aspose.Total-for-C++ API is licensed and vendored; we model it
// behind a thin facade so the surrounding container plumbing (HTTP handler,
// licence load, error mapping) can be exercised independently in tests.
//
// On a real build the Aspose-provided header would be included here and the
// document objects opened via Aspose::Words / Aspose::Cells / Aspose::Slides
// per format.
#include "render.h"

#include <stdexcept>
#include <vector>

namespace docuploader::aspose {

ProbeResult probe(const std::string& path) {
  if (path.empty()) {
    throw DocumentProcessingError("probe: empty path");
  }
  // Placeholder: defer the real implementation to the Aspose-bound build.
  // Per design, the orchestrator probes before chunking, so this throws
  // explicitly until the Aspose API is wired in.
  throw DocumentProcessingError("probe: not implemented in inception-stage scaffold");
}

std::vector<std::byte> render(const RenderRequest& req) {
  if (req.page_start <= 0 || req.page_end < req.page_start) {
    throw DocumentProcessingError("render: invalid page range");
  }
  throw DocumentProcessingError("render: not implemented in inception-stage scaffold");
}

}  // namespace docuploader::aspose
