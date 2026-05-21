// Polls each service's /healthz endpoint and aggregates results.
// Falls back to a mock generator when endpoints are unreachable so the
// SystemStatus dashboard demos cleanly without a live cluster.

export type ServiceHealth = {
  unit: string;
  archetype: "go-service" | "go-lambda" | "ts-service" | "ts-web" | "python-service" | "cpp-aspose";
  url: string | null;
  state: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";
  latencyMs: number | null;
  message?: string;
  checkedAt: number;
  // External links the operator might open from the UI.
  links: ServiceLinks;
};

export type ServiceLinks = {
  service: string | null;     // public URL of the service itself
  logs: string | null;        // CloudWatch / log viewer
  metrics: string | null;     // Grafana / Prometheus dashboard
  runbook: string | null;     // operations runbook anchor
  repository: string | null;  // source code repository
};

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export type LogEntry = {
  ts: number;
  unit: string;
  level: LogLevel;
  message: string;
  trace?: string;
};

export const DOCUPLOADER_UNITS: Array<Pick<ServiceHealth, "unit" | "archetype">> = [
  { unit: "workspace-resolver", archetype: "go-service" },
  { unit: "batch-resolver", archetype: "go-service" },
  { unit: "document-resolver", archetype: "go-service" },
  { unit: "wundergraph-router", archetype: "go-service" },
  { unit: "email-extraction-service", archetype: "go-service" },
  { unit: "pre-token-generation-lambda", archetype: "go-lambda" },
  { unit: "document-event-handler-lambda", archetype: "go-lambda" },
  { unit: "audit-event-storage-lambda", archetype: "go-lambda" },
  { unit: "update-document-state-lambda", archetype: "go-lambda" },
  { unit: "classification-service", archetype: "ts-service" },
  { unit: "ocr-service", archetype: "ts-service" },
  { unit: "zip-extraction-service", archetype: "ts-service" },
  { unit: "output-assembly-service", archetype: "ts-service" },
  { unit: "slipsheet-service", archetype: "ts-service" },
  { unit: "html-conversion-typescript-sidecar", archetype: "ts-service" },
  { unit: "tiff-cog-service", archetype: "ts-service" },
  { unit: "image-tiff-conversion-service", archetype: "ts-service" },
  { unit: "media-conversion-service", archetype: "ts-service" },
  { unit: "react-web-module", archetype: "ts-web" },
  { unit: "pdf-processing-service", archetype: "python-service" },
  { unit: "office-conversion-orchestrator-sidecar", archetype: "python-service" },
  { unit: "office-conversion-aspose-container", archetype: "cpp-aspose" },
];

export type HealthSource = {
  urlPattern: string | null;
  mock: boolean;
  timeoutMs?: number;
  // When set, the dashboard fetches from one aggregator endpoint instead of
  // polling each service directly. Takes precedence over `urlPattern` for
  // health data — but `urlPattern` is still used to compute the per-service
  // "Open service" link.
  // Example: "https://docuploader-monitor-aggregator.dev05.k8s.opus2dev.com"
  aggregatorUrl?: string | null;
  // Optional patterns for external links. {unit} is substituted.
  logsUrlPattern?: string | null;
  metricsUrlPattern?: string | null;
  runbookUrl?: string | null;
  repositoryUrlPattern?: string | null;
};

// Shape returned by monitor-aggregator-service /api/snapshot.
type AggregatorSnapshot = {
  generatedAt: number;
  pollEveryMs: number;
  services: Array<{
    unit: string;
    archetype: ServiceHealth["archetype"];
    url: string | null;
    state: ServiceHealth["state"];
    latencyMs?: number;
    message?: string;
    checkedAt: number;
  }>;
};

export async function pollAllServices(source: HealthSource): Promise<ServiceHealth[]> {
  if (!source.mock && source.aggregatorUrl) {
    return pollViaAggregator(source);
  }
  return Promise.all(DOCUPLOADER_UNITS.map((s) => pollOne(s, source)));
}

async function pollViaAggregator(source: HealthSource): Promise<ServiceHealth[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), source.timeoutMs ?? 5000);
  try {
    const res = await fetch(`${source.aggregatorUrl}/api/snapshot`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`aggregator returned HTTP ${res.status}`);
    }
    const snap = (await res.json()) as AggregatorSnapshot;
    return snap.services.map((s) => {
      const directUrl = source.urlPattern ? source.urlPattern.replace("{unit}", s.unit) : null;
      return {
        unit: s.unit,
        archetype: s.archetype,
        url: s.url || directUrl,
        state: s.state,
        latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
        message: s.message,
        checkedAt: s.checkedAt,
        links: buildLinks({ unit: s.unit }, source, directUrl),
      };
    });
  } catch (err) {
    // Aggregator unreachable — surface every tile as DOWN with the reason so
    // the operator sees the aggregator outage rather than a frozen page.
    const reason = err instanceof Error ? err.message : "aggregator fetch failed";
    const now = Date.now();
    return DOCUPLOADER_UNITS.map((spec) => ({
      ...spec,
      url: source.urlPattern ? source.urlPattern.replace("{unit}", spec.unit) : null,
      state: "DOWN" as const,
      latencyMs: null,
      message: `aggregator: ${reason}`,
      checkedAt: now,
      links: buildLinks(spec, source, source.urlPattern ? source.urlPattern.replace("{unit}", spec.unit) : null),
    }));
  } finally {
    clearTimeout(t);
  }
}

function buildLinks(spec: Pick<ServiceHealth, "unit">, source: HealthSource, serviceUrl: string | null): ServiceLinks {
  const sub = (pat: string | null | undefined) => pat ? pat.replace("{unit}", spec.unit) : null;
  return {
    service:    serviceUrl,
    logs:       sub(source.logsUrlPattern),
    metrics:    sub(source.metricsUrlPattern),
    runbook:    source.runbookUrl ?? null,
    repository: sub(source.repositoryUrlPattern),
  };
}

async function pollOne(
  spec: Pick<ServiceHealth, "unit" | "archetype">,
  source: HealthSource,
): Promise<ServiceHealth> {
  const checkedAt = Date.now();
  const serviceUrl = source.urlPattern ? source.urlPattern.replace("{unit}", spec.unit) : null;
  const links = buildLinks(spec, source, serviceUrl);

  if (source.mock || !source.urlPattern) {
    return synthetic(spec, checkedAt, links);
  }
  const url = serviceUrl! + "/healthz";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), source.timeoutMs ?? 2000);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Math.round(performance.now() - t0);
    return {
      ...spec,
      url,
      state: res.ok ? "OK" : "DEGRADED",
      latencyMs,
      message: res.ok ? undefined : `HTTP ${res.status}`,
      checkedAt,
      links,
    };
  } catch (err) {
    return {
      ...spec,
      url,
      state: "DOWN",
      latencyMs: null,
      message: err instanceof Error ? err.message : "fetch failed",
      checkedAt,
      links,
    };
  } finally {
    clearTimeout(t);
  }
}

function synthetic(
  spec: Pick<ServiceHealth, "unit" | "archetype">,
  checkedAt: number,
  links: ServiceLinks,
): ServiceHealth {
  if (spec.unit === "office-conversion-aspose-container") {
    return { ...spec, url: null, state: "DOWN", latencyMs: null, message: "image not built (vendor SDK)", checkedAt, links };
  }
  const r = hashSeed(spec.unit, checkedAt) % 100;
  if (r < 92) return { ...spec, url: null, state: "OK", latencyMs: 18 + (r % 40), checkedAt, links };
  if (r < 97) return { ...spec, url: null, state: "DEGRADED", latencyMs: 120 + (r % 80), message: "p99 elevated", checkedAt, links };
  return { ...spec, url: null, state: "DOWN", latencyMs: null, message: "no probe response", checkedAt, links };
}

function hashSeed(unit: string, t: number): number {
  let h = Math.floor(t / 60000);
  for (let i = 0; i < unit.length; i++) h = (h * 31 + unit.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// --- log generation (mock) ---

const MOCK_LOG_TEMPLATES: Record<LogLevel, string[]> = {
  INFO: [
    "request received {method} /{path} (rid={rid})",
    "processed batch in {ms} ms ({count} items)",
    "successfully wrote {count} records to {table}",
    "warmup probe ok, cache hit ratio {pct}%",
    "scheduled task {task} completed",
  ],
  WARN: [
    "retrying upstream {dep} (attempt {n}/3)",
    "p99 latency above SLO: {ms} ms",
    "DLQ backlog growing: {count} pending",
    "throttled by {dep}, backoff {ms} ms",
  ],
  ERROR: [
    "fetch failed: {dep} returned 5xx after {ms} ms",
    "AccessDenied calling {dep}, IAM role={role}",
    "panic recovered in worker pool (rid={rid})",
    "unhandled exception in {fn}: {msg}",
  ],
  DEBUG: [
    "trace span emitted (trace_id={trace})",
    "cache miss on {key}, refetching",
    "circuit-breaker state={state} for {dep}",
  ],
};

const MOCK_DEPS = ["dynamodb", "s3", "secretsmanager", "sqs", "eventbridge", "kms", "graphql-router"];
const MOCK_FNS = ["handler", "consume", "publish", "extract", "convert", "render", "persist", "scan"];

export function generateLogsFromPoll(services: ServiceHealth[], maxPerPoll = 8): LogEntry[] {
  const out: LogEntry[] = [];
  const seed = Date.now();
  // Always include 1-3 INFO from random services, plus messages tied to their state.
  const samples = pickN(services, Math.min(maxPerPoll, 5), seed);
  for (const svc of samples) {
    let level: LogLevel = "INFO";
    if (svc.state === "DOWN") level = "ERROR";
    else if (svc.state === "DEGRADED") level = "WARN";
    else if ((seed + svc.unit.length) % 13 === 0) level = "DEBUG";

    const template = pick(MOCK_LOG_TEMPLATES[level], seed + svc.unit.charCodeAt(0));
    const message = fillTemplate(template, seed, svc);
    out.push({ ts: Date.now() - Math.floor(Math.random() * 2000), unit: svc.unit, level, message });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

// Seed older history so time-range filters have something to show.
// Generates `count` synthetic log entries with timestamps spread back over `spanMs`.
export function backfillLogHistory(spanMs: number = 24 * 60 * 60 * 1000, count: number = 400): LogEntry[] {
  const out: LogEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const seed = i * 7919 + Math.floor(now / 1000);
    const ts = now - Math.floor((i / count) * spanMs) - Math.floor(rand(seed) * 60_000);
    const unit = DOCUPLOADER_UNITS[seed % DOCUPLOADER_UNITS.length];
    const r = rand(seed + 1);
    const level: LogLevel = r < 0.7 ? "INFO" : r < 0.85 ? "DEBUG" : r < 0.95 ? "WARN" : "ERROR";
    const template = pick(MOCK_LOG_TEMPLATES[level], seed + unit.unit.charCodeAt(0));
    const fakeHealth: ServiceHealth = {
      ...unit, url: null, state: level === "ERROR" ? "DOWN" : level === "WARN" ? "DEGRADED" : "OK",
      latencyMs: 20 + Math.floor(rand(seed + 3) * 200),
      checkedAt: ts,
      links: { service: null, logs: null, metrics: null, runbook: null, repository: null },
    };
    const message = fillTemplate(template, seed, fakeHealth);
    out.push({ ts, unit: unit.unit, level, message });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}
function pickN<T>(arr: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  let i = 0;
  while (out.length < n && i < n * 5) {
    const idx = Math.abs(seed + i * 17) % arr.length;
    if (!used.has(idx)) {
      used.add(idx);
      out.push(arr[idx]);
    }
    i++;
  }
  return out;
}
// ---------- Domain-specific docuploader metrics (mock) ----------

export type PipelineStage =
  | "received"
  | "classification"
  | "extraction"
  | "conversion"
  | "ocr"
  | "assembly"
  | "completed"
  | "failed";

export type FileType = "pdf" | "docx" | "xlsx" | "pptx" | "eml/msg" | "zip" | "image" | "audio/video" | "other";

export type PipelineSnapshot = {
  at: number;
  // doc counts currently in each stage
  stageCounts: Record<PipelineStage, number>;
  // throughput
  docsPerMin: number;
  batchesPerHour: number;
  bytesPerSecMB: number;
  errorRatePct: number;
  // per-tenant + batch activity
  activeWorkspaces: number;
  activeBatches: number;
  // distribution of new docs in the last poll
  newDocsByType: Record<FileType, number>;
};

export type BatchEntry = {
  id: string;
  workspace: string;
  fileCount: number;
  bytes: number;
  state: "RUNNING" | "QUEUED" | "COMPLETED" | "FAILED";
  startedAt: number;
  progress: number; // 0..1
};

const STAGES: PipelineStage[] = ["received", "classification", "extraction", "conversion", "ocr", "assembly", "completed", "failed"];
const FILE_TYPES: FileType[] = ["pdf", "docx", "xlsx", "pptx", "eml/msg", "zip", "image", "audio/video", "other"];
const WORKSPACES = ["acme-legal", "globex-discovery", "initech-audit", "stark-litigation", "umbrella-compliance", "wayne-records"];

export function generatePipelineSnapshot(prior?: PipelineSnapshot): PipelineSnapshot {
  const now = Date.now();
  const seed = Math.floor(now / 1000);
  const wobble = (n: number) => Math.max(0, Math.round(n + (rand(seed + n) - 0.5) * n * 0.25));
  const base: Record<PipelineStage, number> = {
    received:        wobble(38),
    classification:  wobble(22),
    extraction:      wobble(31),
    conversion:      wobble(45),
    ocr:             wobble(18),
    assembly:        wobble(12),
    completed:       wobble(1200),
    failed:          wobble(34),
  };
  return {
    at: now,
    stageCounts: base,
    docsPerMin:     wobble(prior ? prior.docsPerMin : 28),
    batchesPerHour: wobble(prior ? prior.batchesPerHour : 11),
    bytesPerSecMB:  Math.max(0.4, Number((4 + rand(seed) * 6).toFixed(1))),
    errorRatePct:   Number((1.1 + rand(seed + 7) * 1.8).toFixed(1)),
    activeWorkspaces: 3 + Math.floor(rand(seed + 1) * 4),
    activeBatches:    8 + Math.floor(rand(seed + 2) * 12),
    newDocsByType: {
      pdf:         3 + Math.floor(rand(seed + 10) * 6),
      docx:        2 + Math.floor(rand(seed + 11) * 5),
      xlsx:        1 + Math.floor(rand(seed + 12) * 4),
      pptx:        Math.floor(rand(seed + 13) * 3),
      "eml/msg":   2 + Math.floor(rand(seed + 14) * 5),
      zip:         Math.floor(rand(seed + 15) * 2),
      image:       1 + Math.floor(rand(seed + 16) * 4),
      "audio/video": Math.floor(rand(seed + 17) * 2),
      other:       Math.floor(rand(seed + 18) * 2),
    },
  };
}

export function generateBatchList(n = 8): BatchEntry[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const seed = Math.floor(now / 60000) + i * 13;
    const r = rand(seed);
    const state: BatchEntry["state"] = r < 0.55 ? "RUNNING" : r < 0.75 ? "QUEUED" : r < 0.95 ? "COMPLETED" : "FAILED";
    const fileCount = 5 + Math.floor(rand(seed + 1) * 145);
    return {
      id: `batch-${(seed >>> 0).toString(16).padStart(6, "0")}`,
      workspace: WORKSPACES[seed % WORKSPACES.length],
      fileCount,
      bytes: fileCount * (1.5 + rand(seed + 2) * 3.5) * 1024 * 1024,
      state,
      startedAt: now - (1 + i * 4 + Math.floor(rand(seed + 3) * 30)) * 60 * 1000,
      progress: state === "COMPLETED" ? 1
              : state === "FAILED"    ? 0.3 + rand(seed + 4) * 0.5
              : state === "QUEUED"    ? 0
              : 0.1 + rand(seed + 5) * 0.85,
    };
  });
}

function rand(seed: number): number {
  // mulberry32 — deterministic per seed, gives the dashboard stable-ish values per minute
  let t = seed >>> 0;
  t = (t + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const _PIPELINE_INTERNALS = { STAGES, FILE_TYPES };

// ---------- per-tenant breakdown (mock) ----------

export type TenantStat = {
  workspace: string;
  displayName: string;
  industry: "legal" | "compliance" | "discovery" | "audit" | "records";
  plan: "free" | "standard" | "enterprise";
  docsToday: number;
  docsTotal30d: number;
  storageMB: number;
  successPct: number;     // 0..100
  errorRate: number;      // 0..100
  avgLatencySec: number;
  lastActiveMs: number;   // ms-since-epoch
  successHistory: number[]; // last 14 days, percent success
  topFileTypes: Array<{ kind: FileType; count: number }>;
};

const WORKSPACE_PROFILES: Array<{
  workspace: string;
  displayName: string;
  industry: TenantStat["industry"];
  plan: TenantStat["plan"];
}> = [
  { workspace: "acme-legal",          displayName: "Acme Legal Group",         industry: "legal",      plan: "enterprise" },
  { workspace: "globex-discovery",    displayName: "Globex Discovery Co",      industry: "discovery",  plan: "enterprise" },
  { workspace: "initech-audit",       displayName: "Initech Audit Services",   industry: "audit",      plan: "standard" },
  { workspace: "stark-litigation",    displayName: "Stark Litigation LLP",     industry: "legal",      plan: "enterprise" },
  { workspace: "umbrella-compliance", displayName: "Umbrella Compliance Inc",  industry: "compliance", plan: "standard" },
  { workspace: "wayne-records",       displayName: "Wayne Records Mgmt",       industry: "records",    plan: "free" },
];

export function generateTenantBreakdown(): TenantStat[] {
  const now = Date.now();
  return WORKSPACE_PROFILES.map((p, idx) => {
    const seed = hashString(p.workspace) + Math.floor(now / 60_000);
    const planMultiplier = p.plan === "enterprise" ? 3 : p.plan === "standard" ? 1.4 : 1;
    const baseDocs = Math.floor((40 + rand(seed) * 220) * planMultiplier);
    const errorRate = Number((0.4 + rand(seed + 3) * 4.6).toFixed(2));
    const successPct = Number((100 - errorRate).toFixed(2));
    const history: number[] = Array.from({ length: 14 }, (_, i) =>
      Number((successPct - 1.5 + rand(seed + 100 + i) * 3).toFixed(1)),
    );
    return {
      workspace: p.workspace,
      displayName: p.displayName,
      industry: p.industry,
      plan: p.plan,
      docsToday: baseDocs,
      docsTotal30d: baseDocs * (15 + Math.floor(rand(seed + 1) * 12)),
      storageMB: Math.round(baseDocs * (8 + rand(seed + 2) * 20)),
      successPct,
      errorRate,
      avgLatencySec: Number((12 + rand(seed + 4) * 38).toFixed(1)),
      lastActiveMs: now - Math.floor(rand(seed + 5) * 30 * 60_000) - idx * 2_000,
      successHistory: history,
      topFileTypes: pickTopTypes(seed + 50),
    };
  });
}

function pickTopTypes(seed: number): Array<{ kind: FileType; count: number }> {
  const types: FileType[] = ["pdf", "docx", "eml/msg", "xlsx", "image", "pptx"];
  return types.slice(0, 4).map((kind, i) => ({
    kind,
    count: 50 + Math.floor(rand(seed + i) * 350),
  })).sort((a, b) => b.count - a.count);
}

// ---------- per-batch document detail (mock) ----------

export type DocStageStatus = "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";

export type DocOutput = {
  kind: "pdf" | "ocr-text" | "thumbnail" | "tiff-cog" | "metadata";
  bytes: number;
  s3Uri: string;
};

export type BatchDocument = {
  docId: string;
  filename: string;
  fileType: FileType;
  bytes: number;
  currentStage: PipelineStage;
  stageStatus: Record<PipelineStage, DocStageStatus>;
  outputs: DocOutput[];
  errorMessage?: string;
  startedAt: number;
  durationMs: number | null;
};

const SAMPLE_FILENAMES: Record<FileType, string[]> = {
  pdf:           ["contract_v3.pdf", "deposition_2024-03-14.pdf", "exhibit_A.pdf", "merger_terms.pdf"],
  docx:          ["motion_to_dismiss.docx", "discovery_request.docx", "settlement_draft.docx"],
  xlsx:          ["expense_report.xlsx", "evidence_log.xlsx", "witness_schedule.xlsx"],
  pptx:          ["client_briefing.pptx", "trial_strategy.pptx"],
  "eml/msg":     ["RE_settlement_negotiation.msg", "FW_discovery_response.eml", "INTERNAL_strategy.msg"],
  zip:           ["case_files_2024Q1.zip", "evidence_bundle.zip"],
  image:         ["scene_photo_001.jpg", "scan_signature.png", "damage_evidence.heic"],
  "audio/video": ["deposition_clip.mp4", "phone_call_recording.m4a"],
  other:         ["raw_data.dat", "legacy_format.wpd"],
};

export function generateDocumentsForBatch(batch: BatchEntry, fileTypeMix: FileType[] = FILE_TYPES): BatchDocument[] {
  const docs: BatchDocument[] = [];
  for (let i = 0; i < batch.fileCount; i++) {
    const seed = hashString(batch.id) + i * 31;
    const ft = fileTypeMix[seed % fileTypeMix.length];
    const fnameList = SAMPLE_FILENAMES[ft];
    const filename = `${fnameList[seed % fnameList.length].replace(/(\.[^.]+)$/, `_${i + 1}$1`)}`;
    const bytes = Math.max(50 * 1024, Math.floor(batch.bytes / batch.fileCount + (rand(seed + 7) - 0.5) * 1024 * 1024));

    // Pick current stage based on batch progress + per-doc jitter
    const targetIdx = Math.min(STAGES.length - 2, Math.floor(batch.progress * (STAGES.length - 2) + rand(seed + 1) * 2));
    const failed = batch.state === "FAILED" && rand(seed + 2) < 0.4;
    const currentStage = failed ? "failed" : (batch.state === "COMPLETED" ? "completed" : STAGES[targetIdx]);

    const stageStatus: Record<PipelineStage, DocStageStatus> = {} as Record<PipelineStage, DocStageStatus>;
    STAGES.forEach((s, idx) => {
      const here = STAGES.indexOf(currentStage as PipelineStage);
      if (s === "completed")     stageStatus[s] = currentStage === "completed" ? "DONE" : "PENDING";
      else if (s === "failed")   stageStatus[s] = failed ? "FAILED" : "SKIPPED";
      else if (idx < here)       stageStatus[s] = stageNeedsRun(s, ft) ? "DONE" : "SKIPPED";
      else if (idx === here)     stageStatus[s] = currentStage === "failed" ? "FAILED" : "RUNNING";
      else                       stageStatus[s] = "PENDING";
    });

    const outputs: DocOutput[] = [];
    if (stageStatus.conversion === "DONE") outputs.push({ kind: "pdf",       bytes: Math.floor(bytes * 0.6), s3Uri: `s3://dev05-output/${batch.id}/${filename.replace(/\.[^.]+$/, ".pdf")}` });
    if (stageStatus.ocr === "DONE")        outputs.push({ kind: "ocr-text",  bytes: Math.floor(bytes * 0.02), s3Uri: `s3://dev05-output/${batch.id}/${filename.replace(/\.[^.]+$/, ".ocr.txt")}` });
    if (stageStatus.classification === "DONE") outputs.push({ kind: "metadata", bytes: 1024, s3Uri: `s3://dev05-output/${batch.id}/${filename}.metadata.json` });

    const startedAt = batch.startedAt + Math.floor(rand(seed + 3) * 60_000);
    const durationMs = stageStatus.completed === "DONE" || stageStatus.failed === "FAILED"
      ? 8000 + Math.floor(rand(seed + 4) * 60_000)
      : null;

    docs.push({
      docId: `doc-${(seed >>> 0).toString(16).padStart(8, "0")}`,
      filename,
      fileType: ft,
      bytes,
      currentStage,
      stageStatus,
      outputs,
      errorMessage: failed ? pick(["Aspose pool exhausted, retried 3x", "Malformed PDF header", "OCR confidence < 0.4", "Source archive corrupt"], seed) : undefined,
      startedAt,
      durationMs,
    });
  }
  return docs.slice(0, 50); // cap for UI sanity
}

function stageNeedsRun(stage: PipelineStage, ft: FileType): boolean {
  if (stage === "ocr") return ft === "pdf" || ft === "image" || ft === "eml/msg";
  if (stage === "conversion") return ft !== "pdf" && ft !== "image" && ft !== "audio/video";
  if (stage === "extraction") return ft === "zip" || ft === "eml/msg";
  return true;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ---------- /Domain-specific ----------

function fillTemplate(t: string, seed: number, svc: ServiceHealth): string {
  return t
    .replace("{ms}", String(svc.latencyMs ?? 1000 + (seed % 800)))
    .replace("{method}", pick(["GET", "POST", "PUT"], seed))
    .replace("{path}", pick(["resolve", "ingest", "convert", "status", "events"], seed >> 2))
    .replace("{rid}", `r-${(seed % 99999).toString(16)}`)
    .replace("{count}", String(1 + (seed % 250)))
    .replace("{table}", pick(["workspaces", "batches", "documents", "audit-events"], seed >> 3))
    .replace("{pct}", String(50 + (seed % 50)))
    .replace("{task}", pick(["rotate-keys", "compact-events", "warm-cache"], seed))
    .replace("{dep}", pick(MOCK_DEPS, seed))
    .replace("{n}", String(1 + (seed % 3)))
    .replace("{role}", `arn:aws:iam::*:role/${svc.unit}-role`)
    .replace("{fn}", pick(MOCK_FNS, seed >> 1))
    .replace("{msg}", "unexpected nil")
    .replace("{trace}", `${seed.toString(16)}`)
    .replace("{key}", `cache:${svc.unit}:${(seed % 999).toString(36)}`)
    .replace("{state}", pick(["closed", "open", "half-open"], seed));
}
