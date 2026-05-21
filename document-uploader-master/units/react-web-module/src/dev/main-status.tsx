import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MonitorDashboard } from "../components/MonitorDashboard.js";

// The dashboard supports three data modes, picked by env at build time:
//
//   1. MOCK MODE (default — VITE_HEALTH_MODE unset or != "live")
//      Synthetic data generated client-side. Useful for demos, offline.
//
//   2. DIRECT MODE (VITE_HEALTH_MODE=live + VITE_HEALTH_URL_PATTERN set,
//      VITE_HEALTH_AGGREGATOR_URL NOT set)
//      Browser fetches each service's /healthz directly. Needs every service
//      to allow CORS for the dashboard's origin. Simpler to set up but 22
//      cross-origin requests per tick.
//
//   3. AGGREGATOR MODE (VITE_HEALTH_MODE=live + VITE_HEALTH_AGGREGATOR_URL set)
//      Browser fetches one /api/snapshot from monitor-aggregator-service.
//      Aggregator does the 22 cluster-internal probes server-side. CORS
//      preflight only happens against the aggregator. Preferred for prod.
const urlPattern    = import.meta.env.VITE_HEALTH_URL_PATTERN ?? null;
const aggregatorUrl = import.meta.env.VITE_HEALTH_AGGREGATOR_URL ?? null;
const mock = import.meta.env.VITE_HEALTH_MODE !== "live";

// Default link patterns for external consoles. Override via env to point at
// real CloudWatch / Grafana / GitHub for your environment.
const logsUrlPattern = import.meta.env.VITE_LOGS_URL_PATTERN
  ?? "https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#logsV2:log-groups/log-group/$252Faws$252Feks$252Fdocuploader-dev05$252F{unit}";

const metricsUrlPattern = import.meta.env.VITE_METRICS_URL_PATTERN
  ?? "https://eu-west-1.console.aws.amazon.com/ecr/repositories/private/537462380503/docuploader/{unit}?region=eu-west-1";

const runbookUrl = import.meta.env.VITE_RUNBOOK_URL
  ?? "https://github.com/opus2-platform/document-uploader/blob/main/aidlc-docs/operations/dev05-runbook.md";

const repositoryUrlPattern = import.meta.env.VITE_REPO_URL_PATTERN
  ?? "https://github.com/opus2-platform/document-uploader/tree/main/units/{unit}";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MonitorDashboard
      source={{
        urlPattern,
        aggregatorUrl,
        mock,
        timeoutMs: 5000,
        logsUrlPattern,
        metricsUrlPattern,
        runbookUrl,
        repositoryUrlPattern,
      }}
      refreshMs={Number(import.meta.env.VITE_REFRESH_MS ?? 10000)}
    />
  </StrictMode>,
);
