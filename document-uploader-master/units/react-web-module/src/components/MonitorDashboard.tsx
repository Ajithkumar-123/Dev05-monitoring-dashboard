import { useEffect, useState } from "react";
import { SystemStatus } from "./SystemStatus.js";
import { PipelineView } from "./PipelineView.js";
import { RunbookView } from "./RunbookView.js";
import { UploadView } from "./UploadView.js";
import { TenantsView } from "./TenantsView.js";
import { HomeView } from "./HomeView.js";
import { HelpView } from "./HelpView.js";
import { BellButton, Toasts } from "../notifications/Notifications.js";
import type { HealthSource } from "../api/health.js";

interface Props {
  source: HealthSource;
  refreshMs?: number;
}

type View = "home" | "upload" | "pipeline" | "tenants" | "operations" | "runbook" | "help";

const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: "home",       label: "Home",       icon: "🏠" },
  { id: "upload",     label: "Upload",     icon: "📤" },
  { id: "pipeline",   label: "Pipeline",   icon: "🌊" },
  { id: "tenants",    label: "Tenants",    icon: "👥" },
  { id: "operations", label: "Operations", icon: "⚙️" },
  { id: "runbook",    label: "Runbook",    icon: "📖" },
  { id: "help",       label: "Help",       icon: "❓" },
];

const ALL_VIEWS: View[] = NAV_ITEMS.map((n) => n.id);

// Read the initial view from the URL hash (e.g. /#tenants). Fall back to a
// localStorage-cached choice, then to "pipeline" if nothing is remembered.
function readInitialView(): View {
  if (typeof window === "undefined") return "pipeline";
  const fromHash = window.location.hash.replace(/^#/, "") as View;
  if (ALL_VIEWS.includes(fromHash)) return fromHash;
  try {
    const stored = window.localStorage.getItem("docu-monitor-view") as View | null;
    if (stored && ALL_VIEWS.includes(stored)) return stored;
  } catch { /* ignore — private mode etc. */ }
  return "home";
}

export function MonitorDashboard({ source, refreshMs = 10_000 }: Props) {
  const [view, setViewRaw] = useState<View>(readInitialView);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());

  // Persist view selection so refresh keeps you where you were.
  const setView = (next: View) => {
    setViewRaw(next);
    if (typeof window !== "undefined") {
      // Update hash without triggering a hashchange listener (replaceState).
      try {
        const url = new URL(window.location.href);
        url.hash = next;
        window.history.replaceState(null, "", url.toString());
      } catch { /* ignore */ }
      try { window.localStorage.setItem("docu-monitor-view", next); } catch { /* ignore */ }
    }
  };

  // Browser back/forward: respect hash changes triggered externally.
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#/, "") as View;
      if (ALL_VIEWS.includes(next) && next !== view) setViewRaw(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [view]);

  // Drive the global auto-refresh tick — every view subscribes to refreshMs
  // independently, but this single top-of-page indicator keeps them visually
  // in sync with a shared countdown.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRefreshTick((n) => n + 1);
      setLastRefresh(Date.now());
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  const titles: Record<View, { crumbs: string; title: string }> = {
    home:       { crumbs: "Overview",             title: "Home" },
    upload:     { crumbs: "Ingest / Upload",      title: "Upload a document" },
    pipeline:   { crumbs: "Monitor / Pipeline",   title: "Document pipeline" },
    tenants:    { crumbs: "Monitor / Tenants",    title: "Tenant breakdown" },
    operations: { crumbs: "Monitor / Operations", title: "System operations" },
    runbook:    { crumbs: "Docs / Runbook",       title: "dev05 Deployment Runbook" },
    help:       { crumbs: "Docs / Help",          title: "Help & guide" },
  };

  const refreshSec = Math.round(refreshMs / 1000);

  // Which data-source mode is active — derived from the source config so the
  // indicator always reflects reality, not user intent.
  const mode: "MOCK" | "AGGREGATOR" | "DIRECT" =
    source.mock ? "MOCK"
    : source.aggregatorUrl ? "AGGREGATOR"
    : "DIRECT";
  const modeDescription: Record<typeof mode, string> = {
    MOCK:       "client-side synthetic data — no network calls",
    AGGREGATOR: `via ${source.aggregatorUrl}`,
    DIRECT:     `each service polled directly (${source.urlPattern ?? "no URL pattern set"})`,
  };

  return (
    <div className="docu-shell">
      {/* Sticky top auto-refresh indicator — `key` resets the CSS animation
          each time the interval fires, so the bar visibly drains 0→100% */}
      <div className="docu-autorefresh" role="status" aria-live="polite">
        <span className="docu-autorefresh__dot" />
        <span className="docu-autorefresh__text">
          Auto-refresh · every {refreshSec}s · last update {new Date(lastRefresh).toLocaleTimeString()}
        </span>
        <span
          className={`docu-autorefresh__mode docu-autorefresh__mode--${mode.toLowerCase()}`}
          title={modeDescription[mode]}
        >
          {mode}
        </span>
        <div
          key={refreshTick}
          className="docu-autorefresh__bar"
          style={{ animationDuration: `${refreshMs}ms` }}
        />
      </div>

      <aside className="docu-sidebar">
        <div className="docu-sidebar__brand">
          <span className="docu-sidebar__logo">📄</span>
          <div>
            <div className="docu-sidebar__title">Docuploader</div>
            <div className="docu-sidebar__subtitle">multi-tenant ingest</div>
          </div>
        </div>

        <nav className="docu-sidebar__nav">
          <div className="docu-sidebar__nav-label">Monitor</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`docu-sidebar__item ${view === item.id ? "docu-sidebar__item--active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="docu-sidebar__item-icon">{item.icon}</span>
              <span className="docu-sidebar__item-label">{item.label}</span>
            </button>
          ))}

          <div className="docu-sidebar__nav-label">External</div>
          <a
            href="https://opus2jira.atlassian.net/wiki/spaces/~712020891eb6b6e1064d25b2f30e7d04f62c27/pages/1115783172/Document+Uploader+Units+of+Work+Epics"
            target="_blank" rel="noreferrer"
            className="docu-sidebar__item"
          >
            <span className="docu-sidebar__item-icon"><JiraLogo /></span>
            <span className="docu-sidebar__item-label">Jira · Epics ↗</span>
          </a>
          <a href="https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1" target="_blank" rel="noreferrer" className="docu-sidebar__item">
            <span className="docu-sidebar__item-icon">📊</span>
            <span className="docu-sidebar__item-label">CloudWatch ↗</span>
          </a>
          <a href="https://eu-west-1.console.aws.amazon.com/ecr/private-registry/repositories?region=eu-west-1" target="_blank" rel="noreferrer" className="docu-sidebar__item">
            <span className="docu-sidebar__item-icon">📦</span>
            <span className="docu-sidebar__item-label">ECR ↗</span>
          </a>
          <a
            href="https://eu-west-1.console.aws.amazon.com/eks/clusters?region=eu-west-1"
            target="_blank" rel="noreferrer"
            className="docu-sidebar__item"
            title="DEV05-EKS-CLUSTER (account 537462380503)"
          >
            <span className="docu-sidebar__item-icon"><KubernetesLogo /></span>
            <span className="docu-sidebar__item-label">EKS · DEV05 ↗</span>
          </a>
          <a
            href="https://github.com/opus2-platform/document-uploader"
            target="_blank" rel="noreferrer"
            className="docu-sidebar__item"
          >
            <span className="docu-sidebar__item-icon"><GitHubLogo /></span>
            <span className="docu-sidebar__item-label">GitHub repo ↗</span>
          </a>
        </nav>

        <div className="docu-sidebar__footer">
          <div className="docu-sidebar__env">
            <span className="docu-sidebar__env-dot" />
            <span>dev05 · eu-west-1</span>
          </div>
        </div>
      </aside>

      <main className="docu-main">
        <header className="docu-mainbar">
          <div>
            <div className="docu-mainbar__crumbs">{titles[view].crumbs}</div>
            <h1 className="docu-mainbar__title">{titles[view].title}</h1>
          </div>
          <div className="docu-mainbar__actions">
            <input className="docu-mainbar__search" type="text" placeholder="Search batches, services…" />
            <BellButton onJump={(link) => setView(link)} />
            <div className="docu-mainbar__avatar">A</div>
          </div>
        </header>

        <div className="docu-main__content">
          {view === "home"       && <HomeView onJump={(v) => setView(v as View)} />}
          {view === "upload"     && <UploadView />}
          {view === "pipeline"   && <PipelineView refreshMs={refreshMs} />}
          {view === "tenants"    && <TenantsView refreshMs={refreshMs} />}
          {view === "operations" && <SystemStatus source={source} refreshMs={refreshMs} embedded />}
          {view === "runbook"    && <RunbookView />}
          {view === "help"       && <HelpView />}

          <Toasts />
        </div>
      </main>
    </div>
  );
}

// Kubernetes / EKS mark — hexagon with helm-wheel hub + spokes, K8s blue.
function KubernetesLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="EKS cluster"
      style={{ display: "block" }}
    >
      <polygon points="12,1.5 22,7 22,17 12,22.5 2,17 2,7" fill="#326CE5" />
      <circle cx="12" cy="12" r="2.3" fill="#ffffff" />
      <g stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round">
        <line x1="12" y1="12" x2="12" y2="6.5" />
        <line x1="12" y1="12" x2="16.8" y2="9" />
        <line x1="12" y1="12" x2="16.8" y2="15" />
        <line x1="12" y1="12" x2="12" y2="17.5" />
        <line x1="12" y1="12" x2="7.2" y2="15" />
        <line x1="12" y1="12" x2="7.2" y2="9" />
      </g>
    </svg>
  );
}

// GitHub octocat mark (simple-icons SVG path, monochrome).
function GitHubLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="GitHub"
      style={{ display: "block" }}
      fill="#181717"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

// Atlassian Jira mark (simple-icons SVG path, Jira brand blue).
function JiraLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Jira"
      style={{ display: "block" }}
    >
      <path
        fill="#2684FF"
        d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005z"
      />
      <path
        fill="#2684FF"
        opacity=".75"
        d="M17.34 5.736H5.769a5.215 5.215 0 0 0 5.215 5.215h2.129v2.058a5.218 5.218 0 0 0 5.214 5.214V6.741a1.005 1.005 0 0 0-1.005-1.005z"
      />
      <path
        fill="#2684FF"
        opacity=".5"
        d="M23.108 0H11.534a5.215 5.215 0 0 0 5.215 5.215h2.129v2.058A5.215 5.215 0 0 0 24.092 12.49V1.005A1.005 1.005 0 0 0 23.108 0z"
      />
    </svg>
  );
}
