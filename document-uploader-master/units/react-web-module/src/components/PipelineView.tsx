import { useEffect, useMemo, useRef, useState } from "react";
import {
  generatePipelineSnapshot,
  generateBatchList,
  generateDocumentsForBatch,
  _PIPELINE_INTERNALS,
  type PipelineSnapshot,
  type BatchEntry,
  type BatchDocument,
  type PipelineStage,
  type DocStageStatus,
  type DocOutput,
  type FileType,
} from "../api/health.js";

const HISTORY_LIMIT = 60;

interface Props {
  refreshMs?: number;
}

export function PipelineView({ refreshMs = 10_000 }: Props) {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [batches, setBatches] = useState<BatchEntry[]>([]);
  const [throughputHistory, setThroughputHistory] = useState<number[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchEntry | null>(null);
  const lastRef = useRef<PipelineSnapshot | null>(null);

  const selectedDocs: BatchDocument[] = useMemo(
    () => selectedBatch ? generateDocumentsForBatch(selectedBatch) : [],
    [selectedBatch],
  );

  useEffect(() => {
    const tick = () => {
      const next = generatePipelineSnapshot(lastRef.current ?? undefined);
      lastRef.current = next;
      setSnapshot(next);
      setBatches(generateBatchList(10));
      setThroughputHistory((cur) => [...cur, next.docsPerMin].slice(-HISTORY_LIMIT));
    };
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  if (!snapshot) {
    return <div className="docu-monitor__loading">loading pipeline metrics…</div>;
  }

  const stages = _PIPELINE_INTERNALS.STAGES;
  const fileTypes = _PIPELINE_INTERNALS.FILE_TYPES;
  const maxStage = Math.max(...stages.map((s) => snapshot.stageCounts[s]));
  const newDocsTotal = Object.values(snapshot.newDocsByType).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="docu-pipeline">
      {/* KPI row */}
      <section className="docu-pipeline__kpis">
        <KpiTile label="DOCS / MIN" value={String(snapshot.docsPerMin)} tone="ok" sub="ingest throughput" />
        <KpiTile label="BATCHES / HR" value={String(snapshot.batchesPerHour)} tone="ok" sub="active rate" />
        <KpiTile label="MB / SEC" value={`${snapshot.bytesPerSecMB}`} tone="ok" sub="uplink bandwidth" />
        <KpiTile label="ERROR RATE" value={`${snapshot.errorRatePct} %`} tone={snapshot.errorRatePct > 2 ? "warn" : "ok"} sub="last 5 min" />
        <KpiTile label="ACTIVE WORKSPACES" value={String(snapshot.activeWorkspaces)} tone="ok" sub={`${snapshot.activeBatches} active batches`} />
      </section>

      <section className="docu-pipeline__grid">
        {/* Pipeline funnel */}
        <div className="docu-card">
          <div className="docu-card__header">
            <h3 className="docu-card__title">Pipeline funnel</h3>
            <span className="docu-card__sub">documents currently in each stage</span>
          </div>
          <div className="docu-funnel">
            {stages.map((stage) => (
              <div key={stage} className={`docu-funnel__row docu-funnel__row--${stage}`}>
                <span className="docu-funnel__label">{stage}</span>
                <div className="docu-funnel__bar-wrap">
                  <div
                    className={`docu-funnel__bar docu-funnel__bar--${stage}`}
                    style={{ width: `${(snapshot.stageCounts[stage] / maxStage) * 100}%` }}
                  />
                </div>
                <span className="docu-funnel__value">{snapshot.stageCounts[stage]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* File-type mix */}
        <div className="docu-card">
          <div className="docu-card__header">
            <h3 className="docu-card__title">New docs by file type</h3>
            <span className="docu-card__sub">last poll · {newDocsTotal} docs</span>
          </div>
          <DonutChart values={snapshot.newDocsByType} order={fileTypes} />
          <div className="docu-legend">
            {fileTypes.map((ft, i) => (
              <div key={ft} className="docu-legend__item">
                <span className="docu-legend__swatch" style={{ background: paletteColor(i) }} />
                <span className="docu-legend__label">{ft}</span>
                <span className="docu-legend__value">{snapshot.newDocsByType[ft]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Throughput sparkline */}
        <div className="docu-card docu-card--span2">
          <div className="docu-card__header">
            <h3 className="docu-card__title">Ingest throughput</h3>
            <span className="docu-card__sub">docs/min · last {throughputHistory.length} polls</span>
          </div>
          <SimpleSpark values={throughputHistory} height={120} stroke="var(--accent)" fill="rgba(96, 165, 250, 0.2)" />
        </div>

        {/* Active batches table */}
        <div className="docu-card docu-card--span2">
          <div className="docu-card__header">
            <h3 className="docu-card__title">Recent batches</h3>
            <span className="docu-card__sub">{batches.filter((b) => b.state === "RUNNING").length} running · {batches.filter((b) => b.state === "QUEUED").length} queued</span>
          </div>
          <table className="docu-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Workspace</th>
                <th className="docu-table__num">Files</th>
                <th className="docu-table__num">Size</th>
                <th>State</th>
                <th>Started</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr
                  key={b.id}
                  className={`docu-table__row docu-table__row--clickable ${selectedBatch?.id === b.id ? "docu-table__row--selected" : ""}`}
                  onClick={() => setSelectedBatch(b)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedBatch(b); }}
                >
                  <td><code>{b.id}</code></td>
                  <td>{b.workspace}</td>
                  <td className="docu-table__num">{b.fileCount}</td>
                  <td className="docu-table__num">{prettyBytes(b.bytes)}</td>
                  <td><span className={`docu-pill docu-pill--${b.state.toLowerCase()}`}>{b.state}</span></td>
                  <td className="docu-table__dim">{relativeTime(b.startedAt)}</td>
                  <td>
                    <div className="docu-progress">
                      <div className={`docu-progress__bar docu-progress__bar--${b.state.toLowerCase()}`}
                           style={{ width: `${Math.round(b.progress * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBatch && (
        <BatchDrawer
          batch={selectedBatch}
          docs={selectedDocs}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </div>
  );
}

function BatchDrawer({ batch, docs, onClose }: { batch: BatchEntry; docs: BatchDocument[]; onClose: () => void }) {
  const stages = _PIPELINE_INTERNALS.STAGES;
  const stats = useMemo(() => {
    const completed = docs.filter((d) => d.stageStatus.completed === "DONE").length;
    const failed = docs.filter((d) => d.currentStage === "failed").length;
    const running = docs.filter((d) => d.currentStage !== "completed" && d.currentStage !== "failed").length;
    return { completed, failed, running };
  }, [docs]);

  return (
    <div className="docu-drawer" role="dialog" aria-label={`${batch.id} details`}>
      <div className="docu-drawer__backdrop" onClick={onClose} />
      <div className="docu-drawer__panel docu-drawer__panel--wide">
        <header className="docu-drawer__header">
          <div>
            <div className="docu-drawer__title">{batch.id}</div>
            <div className="docu-drawer__archetype">{batch.workspace}</div>
          </div>
          <button className="docu-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className={`docu-drawer__badge docu-drawer__badge--${batch.state.toLowerCase()}`}>{batch.state}</div>

        <dl className="docu-drawer__props">
          <dt>Files</dt>
          <dd>{batch.fileCount}</dd>
          <dt>Total size</dt>
          <dd>{prettyBytes(batch.bytes)}</dd>
          <dt>Started</dt>
          <dd>{new Date(batch.startedAt).toLocaleString()}</dd>
          <dt>Progress</dt>
          <dd>{Math.round(batch.progress * 100)} %</dd>
          <dt>Per-doc breakdown</dt>
          <dd>
            <span className="docu-pill docu-pill--completed">{stats.completed} done</span>{" "}
            <span className="docu-pill docu-pill--running">{stats.running} running</span>{" "}
            <span className="docu-pill docu-pill--failed">{stats.failed} failed</span>
          </dd>
        </dl>

        <div className="docu-drawer__section-bar">
          <h4 className="docu-drawer__section-title docu-drawer__section-title--inline">Documents ({docs.length})</h4>
          <div className="docu-drawer__section-actions">
            <button className="docu-link-btn" onClick={() => downloadBatchCsv(batch, docs)}>
              ⬇ Export CSV
            </button>
            <button className="docu-link-btn" onClick={() => downloadBatchManifest(batch, docs)}>
              ⬇ Manifest JSON
            </button>
          </div>
        </div>
        <div className="docu-doclist">
          {docs.map((d) => <DocRow key={d.docId} doc={d} stages={stages} />)}
        </div>
      </div>
    </div>
  );
}

// --- download helpers ---

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBatchCsv(batch: BatchEntry, docs: BatchDocument[]) {
  const header = ["doc_id", "filename", "file_type", "bytes", "current_stage", "duration_ms", "outputs_count", "error"];
  const rows = docs.map((d) => [
    d.docId,
    d.filename,
    d.fileType,
    String(d.bytes),
    d.currentStage,
    d.durationMs !== null ? String(d.durationMs) : "",
    String(d.outputs.length),
    d.errorMessage ?? "",
  ]);
  const csv = [header, ...rows].map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  ).join("\n");
  downloadFile(`${batch.id}_documents.csv`, csv, "text/csv");
}

function downloadBatchManifest(batch: BatchEntry, docs: BatchDocument[]) {
  const manifest = {
    batchId: batch.id,
    workspace: batch.workspace,
    state: batch.state,
    fileCount: batch.fileCount,
    totalBytes: batch.bytes,
    startedAt: new Date(batch.startedAt).toISOString(),
    progressPct: Math.round(batch.progress * 100),
    documents: docs.map((d) => ({
      docId: d.docId,
      filename: d.filename,
      fileType: d.fileType,
      bytes: d.bytes,
      currentStage: d.currentStage,
      stageStatus: d.stageStatus,
      durationMs: d.durationMs,
      outputs: d.outputs,
      errorMessage: d.errorMessage ?? null,
    })),
  };
  downloadFile(`${batch.id}_manifest.json`, JSON.stringify(manifest, null, 2), "application/json");
}

function downloadDocManifest(doc: BatchDocument) {
  downloadFile(`${doc.docId}_${doc.filename}.manifest.json`, JSON.stringify(doc, null, 2), "application/json");
}

function downloadOutput(output: DocOutput, docFilename: string) {
  // Real systems would issue a pre-signed S3 GET URL here. For the demo we
  // produce a stub payload so the browser still saves a file the user can open.
  const ext = output.kind === "pdf" ? "pdf" : output.kind === "ocr-text" ? "txt" : output.kind === "metadata" ? "json" : "bin";
  const filename = output.kind === "pdf"
    ? docFilename.replace(/\.[^.]+$/, ".pdf")
    : `${docFilename}.${output.kind}.${ext}`;
  const placeholder = [
    `# Mock ${output.kind} output for ${docFilename}`,
    `# In a real deployment this would be fetched from: ${output.s3Uri}`,
    `# Reported size: ${output.bytes} bytes`,
    ``,
    `Demo placeholder — the actual artifact lives in the S3 bucket referenced above.`,
  ].join("\n");
  const mime = output.kind === "pdf" ? "application/pdf"
             : output.kind === "ocr-text" ? "text/plain"
             : output.kind === "metadata" ? "application/json"
             : "application/octet-stream";
  downloadFile(filename, placeholder, mime);
}

function DocRow({ doc, stages }: { doc: BatchDocument; stages: PipelineStage[] }) {
  const [open, setOpen] = useState(false);
  const visibleStages = stages.filter((s) => s !== "failed");
  return (
    <div className={`docu-doc ${doc.currentStage === "failed" ? "docu-doc--failed" : ""}`}>
      <div className="docu-doc__head-wrap">
        <button className="docu-doc__head" onClick={() => setOpen((o) => !o)}>
          <div className="docu-doc__head-left">
            <span className={`docu-doc__type docu-doc__type--${doc.fileType.replace(/[^a-z]/g, "")}`}>{doc.fileType}</span>
            <span className="docu-doc__name">{doc.filename}</span>
          </div>
          <div className="docu-doc__head-right">
            <span className="docu-doc__size">{prettyBytes(doc.bytes)}</span>
            <span className="docu-doc__duration">{doc.durationMs ? `${(doc.durationMs / 1000).toFixed(1)} s` : "—"}</span>
            <span className="docu-doc__chevron">{open ? "▾" : "▸"}</span>
          </div>
        </button>
        <button
          className="docu-doc__download"
          title="Download document manifest (JSON)"
          aria-label="Download document manifest"
          onClick={(e) => { e.stopPropagation(); downloadDocManifest(doc); }}
        >⬇</button>
      </div>
      <div className="docu-doc__stages">
        {visibleStages.map((s) => (
          <span key={s} className={`docu-stage docu-stage--${(doc.stageStatus[s] ?? "PENDING").toLowerCase()}`} title={`${s}: ${doc.stageStatus[s] ?? "PENDING"}`} />
        ))}
      </div>
      {open && (
        <div className="docu-doc__detail">
          {doc.errorMessage && (
            <div className="docu-doc__error">⚠ {doc.errorMessage}</div>
          )}
          <div className="docu-doc__detail-section">
            <div className="docu-doc__detail-label">Stage status</div>
            <div className="docu-doc__stage-list">
              {visibleStages.map((s) => (
                <div key={s} className="docu-doc__stage-row">
                  <span className="docu-doc__stage-name">{s}</span>
                  <span className={`docu-stage-pill docu-stage-pill--${(doc.stageStatus[s] ?? "PENDING").toLowerCase()}`}>
                    {doc.stageStatus[s] ?? "PENDING"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="docu-doc__detail-section">
            <div className="docu-doc__detail-label">Outputs ({doc.outputs.length})</div>
            {doc.outputs.length === 0 && <div className="docu-doc__empty">No outputs yet.</div>}
            {doc.outputs.map((o) => <OutputRow key={o.s3Uri} output={o} docFilename={doc.filename} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRow({ output, docFilename }: { output: DocOutput; docFilename: string }) {
  return (
    <div className="docu-output">
      <span className={`docu-output__kind docu-output__kind--${output.kind.replace(/[^a-z]/g, "")}`}>{output.kind}</span>
      <code className="docu-output__uri">{output.s3Uri}</code>
      <span className="docu-output__size">{prettyBytes(output.bytes)}</span>
      <button
        className="docu-output__download"
        title={`Download ${output.kind}`}
        aria-label={`Download ${output.kind}`}
        onClick={() => downloadOutput(output, docFilename)}
      >⬇</button>
    </div>
  );
}

function KpiTile({ label, value, tone, sub }: { label: string; value: string; tone: "ok" | "warn" | "bad"; sub?: string }) {
  return (
    <div className={`docu-tile docu-tile--stat docu-tile--${tone}`}>
      <div className="docu-tile__label">{label}</div>
      <div className="docu-tile__value">{value}</div>
      {sub && <div className="docu-tile__sub">{sub}</div>}
    </div>
  );
}

function DonutChart({ values, order }: { values: Record<string, number>; order: string[] }) {
  const total = order.reduce((a, k) => a + (values[k] ?? 0), 0) || 1;
  const r = 60;
  const cx = 80;
  const cy = 80;
  let cumulative = 0;
  return (
    <svg viewBox="0 0 160 160" className="docu-donut">
      {order.map((k, i) => {
        const v = values[k] ?? 0;
        const frac = v / total;
        if (frac <= 0) return null;
        const a0 = cumulative * Math.PI * 2 - Math.PI / 2;
        const a1 = (cumulative + frac) * Math.PI * 2 - Math.PI / 2;
        cumulative += frac;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = frac > 0.5 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
        return <path key={k} d={d} fill={paletteColor(i)} stroke="var(--bg-elev)" strokeWidth={1.5} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--bg-elev)" />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="10" letterSpacing="0.1em">DOCS</text>
    </svg>
  );
}

function SimpleSpark({ values, height, stroke, fill }: { values: number[]; height: number; stroke: string; fill: string }) {
  const width = 800;
  if (values.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} className="docu-areachart"><text x={width/2} y={height/2} textAnchor="middle" fill="var(--text-dim)" fontSize="14">collecting samples…</text></svg>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="docu-areachart" preserveAspectRatio="none">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}

function paletteColor(i: number): string {
  // Distinct hues, tuned for dark backgrounds
  const colors = ["#60a5fa", "#34d4c5", "#4ade80", "#fbbf24", "#f87171", "#c084fc", "#fb923c", "#22d3ee", "#a3a3a3"];
  return colors[i % colors.length];
}

function prettyBytes(n: number): string {
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n > 1024 * 1024)        return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024)               return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function relativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
