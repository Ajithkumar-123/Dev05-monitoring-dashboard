// HTTP server fronting the Aspose render API.
//
// Endpoints (consumed by office-conversion-orchestrator-sidecar over
// localhost):
//   GET  /pages  ?path=<absolute path>
//   POST /render {"path": "...", "pageStart": int, "pageEnd": int}
//
// The licence file is expected at /opt/aspose/license/Aspose.Total.Cpp.lic
// (mounted from the aspose-licence Kubernetes Secret).
#include <cstdlib>
#include <iostream>
#include <string>

#include <httplib.h>
#include <nlohmann/json.hpp>

#include "render.h"

using json = nlohmann::json;
using namespace docuploader::aspose;

static int env_port_or(int def) {
  const char* p = std::getenv("PORT");
  if (!p) return def;
  return std::atoi(p);
}

int main() {
  httplib::Server svr;

  svr.Get("/healthz", [](const httplib::Request&, httplib::Response& res) {
    res.set_content("ok", "text/plain");
  });

  svr.Get("/pages", [](const httplib::Request& req, httplib::Response& res) {
    try {
      auto path = req.get_param_value("path");
      auto result = probe(path);
      res.set_content(json{{"pages", result.pages}}.dump(), "application/json");
    } catch (const DocumentProcessingError& err) {
      res.status = 422;
      res.set_content(json{{"code", "DocumentProcessingError"}, {"message", err.what()}}.dump(),
                      "application/json");
    } catch (const std::exception& err) {
      res.status = 500;
      res.set_content(json{{"code", "Internal"}, {"message", err.what()}}.dump(), "application/json");
    }
  });

  svr.Post("/render", [](const httplib::Request& req, httplib::Response& res) {
    try {
      auto body = json::parse(req.body);
      RenderRequest r{
          body.at("path").get<std::string>(),
          body.at("pageStart").get<int>(),
          body.at("pageEnd").get<int>(),
      };
      auto bytes = render(r);
      res.set_content(std::string(reinterpret_cast<const char*>(bytes.data()), bytes.size()),
                      "application/pdf");
    } catch (const DocumentProcessingError& err) {
      res.status = 422;
      res.set_content(json{{"code", "DocumentProcessingError"}, {"message", err.what()}}.dump(),
                      "application/json");
    } catch (const std::exception& err) {
      res.status = 500;
      res.set_content(json{{"code", "Internal"}, {"message", err.what()}}.dump(), "application/json");
    }
  });

  const int port = env_port_or(8081);
  std::cerr << "aspose_render listening on :" << port << '\n';
  svr.listen("0.0.0.0", port);
  return 0;
}
