// Home / landing view — overview of the docuploader monitoring dashboard.
// Welcomes the user, summarizes recent activity, and offers quick links into
// the other views. Doesn't pull any backend data of its own — reads from the
// existing mock generators + the notifications store.
import { useMemo } from "react";
import {
  generateTenantBreakdown,
  generatePipelineSnapshot,
} from "../api/health.js";
import { useNotifications } from "../notifications/store.js";

type Link = "upload" | "pipeline" | "tenants" | "operations" | "runbook" | "help";

interface Props {
  onJump: (view: Link) => void;
}

export function HomeView({ onJump }: Props) {
  const notifications = useNotifications();
  const tenants  = useMemo(() => generateTenantBreakdown(), []);
  const snapshot = useMemo(() => generatePipelineSnapshot(), []);

  const totals = useMemo(() => {
    const docsToday = tenants.reduce((a, t) => a + t.docsToday, 0);
    const storageMB = tenants.reduce((a, t) => a + t.storageMB, 0);
    return { docsToday, storageMB, tenantCount: tenants.length };
  }, [tenants]);

  const unread = notifications.filter((n) => !n.read).length;
  const recentErrors = notifications.filter((n) => n.severity === "error").slice(0, 4);

  return (
    <div className="docu-home">
      {/* Hero */}
      <section className="docu-home__hero">
        <div className="docu-home__hero-left">
          <span className="docu-home__hero-eyebrow">DOCUPLOADER MONITOR</span>
          <h1 className="docu-home__hero-title">
            Welcome back
          </h1>
          <p className="docu-home__hero-subtitle">
            Multi-tenant document ingestion + conversion across 22 services.
            Drop files, watch the pipeline, drill into tenant activity.
          </p>
          <div className="docu-home__hero-actions">
            <button className="docu-home__cta docu-home__cta--primary" onClick={() => onJump("upload")}>
              📤  Upload a document
            </button>
            <button className="docu-home__cta" onClick={() => onJump("pipeline")}>
              🌊  See pipeline
            </button>
            <button className="docu-home__cta" onClick={() => onJump("help")}>
              ❓  Help
            </button>
          </div>
        </div>
        <div className="docu-home__hero-stats">
          <div className="docu-home__hero-stat">
            <span className="docu-home__hero-stat-value">{totals.docsToday.toLocaleString()}</span>
            <span className="docu-home__hero-stat-label">docs / day</span>
          </div>
          <div className="docu-home__hero-stat">
            <span className="docu-home__hero-stat-value">{snapshot.batchesPerHour}</span>
            <span className="docu-home__hero-stat-label">batches / hour</span>
          </div>
          <div className="docu-home__hero-stat">
            <span className="docu-home__hero-stat-value">{totals.tenantCount}</span>
            <span className="docu-home__hero-stat-label">active tenants</span>
          </div>
          <div className="docu-home__hero-stat">
            <span className={`docu-home__hero-stat-value ${unread > 0 ? "docu-home__hero-stat-value--warn" : ""}`}>
              {unread}
            </span>
            <span className="docu-home__hero-stat-label">unread alerts</span>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="docu-home__section">
        <h2 className="docu-home__section-title">Quick actions</h2>
        <div className="docu-home__cards">
          <QuickCard
            icon="📤"
            title="Upload a document"
            desc="Drop a file, watch it flow through classification → conversion → OCR → assembly."
            cta="Start uploading"
            onClick={() => onJump("upload")}
          />
          <QuickCard
            icon="🌊"
            title="Pipeline overview"
            desc="Throughput, funnel, file-type mix, recent batches. Click any batch for per-doc detail."
            cta="View pipeline"
            onClick={() => onJump("pipeline")}
          />
          <QuickCard
            icon="👥"
            title="Tenant breakdown"
            desc="Per-workspace activity, storage, success rate, error leaderboard."
            cta="View tenants"
            onClick={() => onJump("tenants")}
          />
          <QuickCard
            icon="⚙️"
            title="System operations"
            desc="22 service health tiles, system metrics, live event feed and searchable logs."
            cta="View operations"
            onClick={() => onJump("operations")}
          />
          <QuickCard
            icon="📖"
            title="dev05 Runbook"
            desc="The deployment runbook for Phase A → C → smoke-test, with troubleshooting."
            cta="Open runbook"
            onClick={() => onJump("runbook")}
          />
          <QuickCard
            icon="❓"
            title="Help & glossary"
            desc="How each view works, file-type meanings, pipeline stages, keyboard shortcuts."
            cta="Open help"
            onClick={() => onJump("help")}
          />
        </div>
      </section>

      {/* Two-column lower */}
      <section className="docu-home__lower">
        <div className="docu-home__lower-left">
          <h2 className="docu-home__section-title">Recent alerts</h2>
          {recentErrors.length === 0 && (
            <div className="docu-home__empty">
              No errors recorded recently. The system looks healthy.
            </div>
          )}
          {recentErrors.length > 0 && (
            <div className="docu-home__alerts">
              {recentErrors.map((n) => (
                <div key={n.id} className={`docu-home__alert docu-home__alert--${n.severity}`}>
                  <div className="docu-home__alert-icon">🛑</div>
                  <div className="docu-home__alert-body">
                    <div className="docu-home__alert-title">{n.title}</div>
                    <div className="docu-home__alert-msg">{n.message}</div>
                    <div className="docu-home__alert-meta">{relTime(n.ts)} · {n.source ?? "system"}</div>
                  </div>
                  {n.link && (
                    <button className="docu-link-btn" onClick={() => onJump(n.link as Link)}>
                      Open ↗
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="docu-home__lower-right">
          <h2 className="docu-home__section-title">Deployment status</h2>
          <div className="docu-home__phases">
            <PhaseRow label="Phase A — AWS substrate"        status="not-deployed" />
            <PhaseRow label="Phase B — Container images"     status="local-only" />
            <PhaseRow label="Phase C — GitOps wiring"        status="not-deployed" />
            <PhaseRow label="Phase E — ArgoCD sync"          status="not-deployed" />
            <PhaseRow label="Phase F — Smoke test (J1-J4)"   status="not-deployed" />
          </div>
          <button
            className="docu-link-btn docu-home__phases-cta"
            onClick={() => onJump("runbook")}
          >
            Open runbook for next steps ↗
          </button>
        </div>
      </section>
    </div>
  );
}

function QuickCard({
  icon, title, desc, cta, onClick,
}: { icon: string; title: string; desc: string; cta: string; onClick: () => void }) {
  return (
    <button className="docu-home__card" onClick={onClick}>
      <span className="docu-home__card-icon">{icon}</span>
      <div className="docu-home__card-body">
        <div className="docu-home__card-title">{title}</div>
        <div className="docu-home__card-desc">{desc}</div>
      </div>
      <span className="docu-home__card-cta">{cta} →</span>
    </button>
  );
}

function PhaseRow({ label, status }: {
  label: string;
  status: "done" | "local-only" | "blocked" | "not-deployed";
}) {
  const cls = "docu-home__phase docu-home__phase--" + status;
  const badge = status === "done" ? "✓ deployed"
              : status === "local-only" ? "local only"
              : status === "blocked" ? "blocked"
              : "not deployed";
  return (
    <div className={cls}>
      <span className="docu-home__phase-label">{label}</span>
      <span className="docu-home__phase-badge">{badge}</span>
    </div>
  );
}

function relTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
