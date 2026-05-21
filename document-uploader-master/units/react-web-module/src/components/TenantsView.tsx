// Tenant breakdown view — per-workspace activity (docs, storage, success%,
// last-active), top-N pie + top errors leaderboard, click any row to open a
// drawer with sparkline + file-type breakdown + file list (view attempts are
// blocked with an access-denied modal — tenant file contents are isolated).
import { useEffect, useMemo, useState } from "react";
import {
  generateTenantBreakdown,
  generateBatchList,
  type TenantStat,
  type BatchEntry,
} from "../api/health.js";

type TenantFile = {
  fileId: string;
  filename: string;
  bytes: number;
  uploadedAtMs: number;
  fileType: "pdf" | "docx" | "xlsx" | "eml" | "image" | "zip";
};

const FILE_NAMES_BY_INDUSTRY: Record<string, string[]> = {
  legal:       ["motion_to_dismiss.docx", "deposition_2024-03-14.pdf", "exhibit_A.pdf", "settlement_terms.docx", "contract_v3.pdf", "discovery_response.pdf"],
  discovery:   ["case_files_2024Q1.zip", "evidence_log.xlsx", "witness_schedule.xlsx", "scene_photo_001.jpg", "deposition_clip.mp4", "RE_inquiry.eml"],
  audit:       ["q1_audit_workpapers.xlsx", "internal_controls.pdf", "audit_finding_2024.docx", "expense_report_review.xlsx", "compliance_letter.eml"],
  compliance:  ["GDPR_DPIA.pdf", "vendor_review_2024.xlsx", "incident_report_INC-1042.pdf", "soc2_evidence.zip", "policy_v4.docx"],
  records:     ["legacy_format.wpd", "scan_signature_batch3.pdf", "archive_index.xlsx", "tape_inventory.xlsx", "retention_schedule.pdf"],
};

function generateFilesForTenant(t: TenantStat, n = 8): TenantFile[] {
  const base = FILE_NAMES_BY_INDUSTRY[t.industry] ?? FILE_NAMES_BY_INDUSTRY.legal;
  const out: TenantFile[] = [];
  for (let i = 0; i < n; i++) {
    const seed = i * 7919 + hashStr(t.workspace);
    const name = base[i % base.length];
    const variant = name.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
    const ext = (variant.split(".").pop() ?? "").toLowerCase();
    const fileType: TenantFile["fileType"] =
      ext === "pdf" ? "pdf"
      : ext === "docx" ? "docx"
      : ext === "xlsx" ? "xlsx"
      : ext === "eml" || ext === "msg" ? "eml"
      : ext === "zip" ? "zip"
      : ["jpg", "jpeg", "png", "heic", "tiff"].includes(ext) ? "image"
      : "pdf";
    out.push({
      fileId: `doc-${(seed >>> 0).toString(16).padStart(8, "0")}`,
      filename: variant,
      bytes: 30_000 + Math.floor(rand01(seed + 1) * 14_000_000),
      uploadedAtMs: Date.now() - Math.floor(rand01(seed + 2) * 14 * 24 * 3600 * 1000),
      fileType,
    });
  }
  return out;
}

function rand01(s: number): number {
  let t = s >>> 0;
  t = (t + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  refreshMs?: number;
}

type SortKey = "displayName" | "docsToday" | "storageMB" | "successPct" | "lastActiveMs";

export function TenantsView({ refreshMs = 10_000 }: Props) {
  const [tenants, setTenants] = useState<TenantStat[]>(() => generateTenantBreakdown());
  const [recentBatches] = useState<BatchEntry[]>(() => generateBatchList(20));
  const [sortKey, setSortKey] = useState<SortKey>("docsToday");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<TenantStat | null>(null);
  const [deniedFile, setDeniedFile] = useState<{ tenant: TenantStat; file: TenantFile } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTenants(generateTenantBreakdown()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  const totals = useMemo(() => {
    return tenants.reduce(
      (acc, t) => ({
        docsToday: acc.docsToday + t.docsToday,
        docsTotal30d: acc.docsTotal30d + t.docsTotal30d,
        storageMB: acc.storageMB + t.storageMB,
      }),
      { docsToday: 0, docsTotal30d: 0, storageMB: 0 },
    );
  }, [tenants]);

  const sorted = useMemo(() => {
    const out = [...tenants];
    out.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") {
        return sortDesc ? vb - va : va - vb;
      }
      return sortDesc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return out;
  }, [tenants, sortKey, sortDesc]);

  const top5ByVolume = [...tenants].sort((a, b) => b.docsToday - a.docsToday).slice(0, 5);
  const top5ByErrors = [...tenants].sort((a, b) => b.errorRate - a.errorRate).slice(0, 5);

  return (
    <div className="docu-tenants">
      <section className="docu-pipeline__kpis">
        <KpiTile label="ACTIVE TENANTS" value={String(tenants.length)} tone="ok" sub="all workspaces today" />
        <KpiTile label="DOCS / DAY" value={totals.docsToday.toLocaleString()} tone="ok" sub="aggregated" />
        <KpiTile label="DOCS / 30 DAYS" value={totals.docsTotal30d.toLocaleString()} tone="ok" sub="rolling window" />
        <KpiTile label="STORAGE" value={prettyMB(totals.storageMB)} tone="ok" sub="all tenants" />
        <KpiTile label="WORST ERROR RATE" value={`${top5ByErrors[0]?.errorRate.toFixed(1) ?? "—"} %`} tone={top5ByErrors[0] && top5ByErrors[0].errorRate > 3 ? "warn" : "ok"} sub={top5ByErrors[0]?.workspace} />
      </section>

      <section className="docu-pipeline__grid">
        <div className="docu-card">
          <div className="docu-card__header">
            <h3 className="docu-card__title">Top 5 by volume</h3>
            <span className="docu-card__sub">docs uploaded today</span>
          </div>
          <DonutTenants tenants={top5ByVolume} />
        </div>

        <div className="docu-card">
          <div className="docu-card__header">
            <h3 className="docu-card__title">Top 5 by error rate</h3>
            <span className="docu-card__sub">where to look first</span>
          </div>
          <div className="docu-tenants__leader">
            {top5ByErrors.map((t) => (
              <div key={t.workspace} className="docu-tenants__leader-row" onClick={() => setSelected(t)}>
                <span className="docu-tenants__leader-name">{t.displayName}</span>
                <span className="docu-tenants__leader-bar-wrap">
                  <span
                    className="docu-tenants__leader-bar"
                    style={{ width: `${Math.min(100, t.errorRate * 18)}%` }}
                  />
                </span>
                <span className={`docu-tenants__leader-value ${t.errorRate > 3 ? "docu-tenants__leader-value--warn" : ""}`}>
                  {t.errorRate.toFixed(1)} %
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="docu-card docu-card--span2">
          <div className="docu-card__header">
            <h3 className="docu-card__title">All tenants <span className="docu-monitor__group-count">{tenants.length}</span></h3>
            <span className="docu-card__sub">click any row for a deep-dive</span>
          </div>
          <table className="docu-table docu-tenants__table">
            <thead>
              <tr>
                <SortHeader col="displayName"  sortKey={sortKey} sortDesc={sortDesc} setSortKey={setSortKey} setSortDesc={setSortDesc}>Tenant</SortHeader>
                <th>Plan</th>
                <SortHeader col="docsToday"    sortKey={sortKey} sortDesc={sortDesc} setSortKey={setSortKey} setSortDesc={setSortDesc} className="docu-table__num">Docs today</SortHeader>
                <SortHeader col="storageMB"   sortKey={sortKey} sortDesc={sortDesc} setSortKey={setSortKey} setSortDesc={setSortDesc} className="docu-table__num">Storage</SortHeader>
                <SortHeader col="successPct"  sortKey={sortKey} sortDesc={sortDesc} setSortKey={setSortKey} setSortDesc={setSortDesc} className="docu-table__num">Success %</SortHeader>
                <th>Trend (14d)</th>
                <SortHeader col="lastActiveMs" sortKey={sortKey} sortDesc={sortDesc} setSortKey={setSortKey} setSortDesc={setSortDesc}>Last active</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.workspace}
                  className="docu-table__row docu-table__row--clickable"
                  onClick={() => setSelected(t)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(t); }}
                >
                  <td>
                    <div className="docu-tenants__name">{t.displayName}</div>
                    <div className="docu-tenants__slug">{t.workspace} · <span className="docu-tenants__industry">{t.industry}</span></div>
                  </td>
                  <td><span className={`docu-pill docu-tenants__plan docu-tenants__plan--${t.plan}`}>{t.plan}</span></td>
                  <td className="docu-table__num">{t.docsToday.toLocaleString()}</td>
                  <td className="docu-table__num">{prettyMB(t.storageMB)}</td>
                  <td className={`docu-table__num ${t.successPct < 96 ? "docu-tenants__success--warn" : ""}`}>{t.successPct.toFixed(1)} %</td>
                  <td><Sparkline values={t.successHistory} /></td>
                  <td className="docu-table__dim">{relativeTime(t.lastActiveMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <TenantDrawer
          tenant={selected}
          batches={recentBatches.filter((b) => b.workspace === selected.workspace)}
          onClose={() => setSelected(null)}
          onTryViewFile={(file) => setDeniedFile({ tenant: selected, file })}
        />
      )}

      {deniedFile && (
        <AccessDeniedModal
          tenant={deniedFile.tenant}
          file={deniedFile.file}
          onClose={() => setDeniedFile(null)}
        />
      )}
    </div>
  );
}

function AccessDeniedModal({ tenant, file, onClose }: { tenant: TenantStat; file: TenantFile; onClose: () => void }) {
  return (
    <div className="docu-denied" role="dialog" aria-modal="true" aria-labelledby="denied-title">
      <div className="docu-denied__backdrop" onClick={onClose} />
      <div className="docu-denied__panel">
        <div className="docu-denied__icon">🔒</div>
        <h3 id="denied-title" className="docu-denied__title">Access denied</h3>
        <p className="docu-denied__msg">
          You don't have permission to open this file.
        </p>
        <div className="docu-denied__detail">
          <div className="docu-denied__row"><span>File</span><code>{file.filename}</code></div>
          <div className="docu-denied__row"><span>File ID</span><code>{file.fileId}</code></div>
          <div className="docu-denied__row"><span>Owner</span><code>{tenant.workspace}</code></div>
          <div className="docu-denied__row"><span>Reason</span><span className="docu-denied__reason">tenant data isolation — only workspace members can view file contents</span></div>
        </div>
        <div className="docu-denied__actions">
          <button className="docu-link-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({ col, sortKey, sortDesc, setSortKey, setSortDesc, children, className }: {
  col: SortKey;
  sortKey: SortKey; sortDesc: boolean;
  setSortKey: (k: SortKey) => void; setSortDesc: (d: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`${className ?? ""} docu-tenants__sort ${active ? "docu-tenants__sort--active" : ""}`}
      onClick={() => {
        if (active) setSortDesc(!sortDesc);
        else { setSortKey(col); setSortDesc(true); }
      }}
      role="button"
      tabIndex={0}
    >
      {children}{active && <span className="docu-tenants__sort-arrow">{sortDesc ? " ▼" : " ▲"}</span>}
    </th>
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

function DonutTenants({ tenants }: { tenants: TenantStat[] }) {
  const total = tenants.reduce((a, t) => a + t.docsToday, 0) || 1;
  const r = 60, cx = 80, cy = 80;
  let cum = 0;
  return (
    <div className="docu-tenants__donut-wrap">
      <svg viewBox="0 0 160 160" className="docu-donut">
        {tenants.map((t, i) => {
          const frac = t.docsToday / total;
          if (frac <= 0) return null;
          const a0 = cum * Math.PI * 2 - Math.PI / 2;
          const a1 = (cum + frac) * Math.PI * 2 - Math.PI / 2;
          cum += frac;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const large = frac > 0.5 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
          return <path key={t.workspace} d={d} fill={paletteColor(i)} stroke="var(--bg-elev)" strokeWidth={1.5} />;
        })}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--bg-elev)" />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="10" letterSpacing="0.1em">DOCS/DAY</text>
      </svg>
      <div className="docu-legend">
        {tenants.map((t, i) => (
          <div key={t.workspace} className="docu-legend__item">
            <span className="docu-legend__swatch" style={{ background: paletteColor(i) }} />
            <span className="docu-legend__label">{t.workspace}</span>
            <span className="docu-legend__value">{t.docsToday}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 100, height = 24;
  if (values.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, height - ((v - min) / span) * (height - 4) - 2] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="docu-spark">
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}

function TenantDrawer({
  tenant, batches, onClose, onTryViewFile,
}: {
  tenant: TenantStat;
  batches: BatchEntry[];
  onClose: () => void;
  onTryViewFile: (file: TenantFile) => void;
}) {
  const files = useMemo(() => generateFilesForTenant(tenant, 10), [tenant]);
  return (
    <div className="docu-drawer" role="dialog" aria-label={`${tenant.workspace} details`}>
      <div className="docu-drawer__backdrop" onClick={onClose} />
      <div className="docu-drawer__panel docu-drawer__panel--wide">
        <header className="docu-drawer__header">
          <div>
            <div className="docu-drawer__title">{tenant.displayName}</div>
            <div className="docu-drawer__archetype">{tenant.workspace} · {tenant.industry}</div>
          </div>
          <button className="docu-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className={`docu-drawer__badge docu-tenants__plan docu-tenants__plan--${tenant.plan}`}>
          {tenant.plan.toUpperCase()} plan
        </div>

        <dl className="docu-drawer__props">
          <dt>Docs today</dt>
          <dd>{tenant.docsToday.toLocaleString()}</dd>
          <dt>Docs (30 days)</dt>
          <dd>{tenant.docsTotal30d.toLocaleString()}</dd>
          <dt>Storage</dt>
          <dd>{prettyMB(tenant.storageMB)}</dd>
          <dt>Success rate</dt>
          <dd className={tenant.successPct < 96 ? "docu-tenants__success--warn" : ""}>{tenant.successPct.toFixed(2)} %</dd>
          <dt>Error rate</dt>
          <dd className={tenant.errorRate > 3 ? "docu-tenants__success--warn" : ""}>{tenant.errorRate.toFixed(2)} %</dd>
          <dt>Avg pipeline latency</dt>
          <dd>{tenant.avgLatencySec.toFixed(1)} s</dd>
          <dt>Last active</dt>
          <dd>{relativeTime(tenant.lastActiveMs)}</dd>
        </dl>

        <h4 className="docu-drawer__section-title">Success rate · last 14 days</h4>
        <div className="docu-drawer__chart-wrap">
          <Sparkline values={tenant.successHistory} />
          <div className="docu-bigchart__legend">
            <span>min {Math.min(...tenant.successHistory).toFixed(1)} %</span>
            <span>max {Math.max(...tenant.successHistory).toFixed(1)} %</span>
            <span>now {tenant.successHistory[tenant.successHistory.length - 1].toFixed(1)} %</span>
          </div>
        </div>

        <h4 className="docu-drawer__section-title">Top file types</h4>
        <div className="docu-tenants__filetypes">
          {tenant.topFileTypes.map((ft) => (
            <div key={ft.kind} className="docu-tenants__filetype-row">
              <span className="docu-tenants__filetype-name">{ft.kind}</span>
              <span className="docu-tenants__filetype-bar-wrap">
                <span
                  className="docu-tenants__filetype-bar"
                  style={{ width: `${Math.min(100, (ft.count / tenant.topFileTypes[0].count) * 100)}%` }}
                />
              </span>
              <span className="docu-tenants__filetype-count">{ft.count.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <h4 className="docu-drawer__section-title">
          Files <span className="docu-monitor__group-count">{files.length}</span>
          <span className="docu-tenants__files-note">read-only · contents restricted</span>
        </h4>
        <div className="docu-tenants__files">
          {files.map((f) => (
            <div key={f.fileId} className="docu-tenants__file-row">
              <span className={`docu-doc__type docu-doc__type--${f.fileType}`}>{f.fileType}</span>
              <div className="docu-tenants__file-info">
                <div className="docu-tenants__file-name">{f.filename}</div>
                <div className="docu-tenants__file-sub">
                  {prettyBytes(f.bytes)} · uploaded {relativeTime(f.uploadedAtMs)} · <code>{f.fileId}</code>
                </div>
              </div>
              <button
                className="docu-tenants__file-view"
                title="Attempt to view file contents"
                onClick={() => onTryViewFile(f)}
              >👁  View</button>
            </div>
          ))}
        </div>

        <h4 className="docu-drawer__section-title">Recent batches ({batches.length})</h4>
        {batches.length === 0 && <div className="docu-doc__empty">No recent batches in the current sample.</div>}
        {batches.map((b) => (
          <div key={b.id} className="docu-tenants__batch">
            <code>{b.id}</code>
            <span className="docu-tenants__batch-files">{b.fileCount} files · {prettyMB(Math.round(b.bytes / 1024 / 1024))}</span>
            <span className={`docu-pill docu-pill--${b.state.toLowerCase()}`}>{b.state}</span>
            <span className="docu-table__dim">{relativeTime(b.startedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function prettyMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toLocaleString()} MB`;
}

function prettyBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function relativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function paletteColor(i: number): string {
  const colors = ["#60a5fa", "#34d4c5", "#4ade80", "#fbbf24", "#f87171", "#c084fc", "#fb923c", "#22d3ee"];
  return colors[i % colors.length];
}
