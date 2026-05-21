// Aspose render API. The render function takes an absolute path to the source
// office document and a page range; returns the rendered PDF bytes. The Aspose
// licence is loaded at process start from /opt/aspose/license.
#pragma once

#include <string>
#include <vector>
#include <cstddef>
#include <stdexcept>

namespace docuploader::aspose {

struct RenderRequest {
  std::string path;
  int page_start;
  int page_end;
};

struct ProbeResult {
  int pages;
};

ProbeResult probe(const std::string& path);
std::vector<std::byte> render(const RenderRequest& req);

class DocumentProcessingError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

}  // namespace docuploader::aspose
