import { useEffect, useMemo, useRef, useState } from "react";
import {
  pollAllServices,
  generateLogsFromPoll,
  backfillLogHistory,
  type HealthSource,
  type ServiceHealth,
  type LogEntry,
  type LogLevel,
} from "../api/health.js";
import { pushNotification } from "../notifications/store.js";

interface Props {
  source: HealthSource;
  refreshMs?: number;
  embedded?: boolean;
}

const HISTORY_LIMIT = 60;
const EVENT_LIMIT = 60;
const LOG_LIMIT = 800;
const SPARKLINE_SAMPLES = 10;

type TimeRangePreset = "5m" | "15m" | "1h" | "6h" | "24h" | "ALL" | "CUSTOM";
const PRESET_MS: Record<Exclude<TimeRangePreset, "CUSTOM" | "ALL">, number> = {
  "5m":  5 * 60_000,
  "15m": 15 * 60_000,
  "1h":  60 * 60_000,
  "6h":  6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};
const PRESET_LABEL: Record<TimeRangePreset, string> = {
  "5m": "5m", "15m": "15m", "1h": "1h", "6h": "6h", "24h": "24h",
  "ALL": "All", "CUSTOM": "Custom",
};

type ChartMetric = "latency" | "success" | "up";

type Event = {
  at: number;
  unit: string;
  from: ServiceHealth["state"];
  to: ServiceHealth["state"];
};

type Series = {
  latency: number[];     // avg latency ms per tick
  successPct: number[];  // % services OK per tick
  upCount: number[];     // count of OK services per tick
};

export function SystemStatus({ source, refreshMs = 10_000, embedded = false }: Props) {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [series, setSeries] = useState<Series>({ latency: [], successPct: [], upCount: [] });
  const [chartMetric, setChartMetric] = useState<ChartMetric>("latency");
  const [logs, setLogs] = useState<LogEntry[]>(() => backfillLogHistory());
  const [logFilter, setLogFilter] = useState<LogLevel | "ALL">("ALL");
  const [logQuery, setLogQuery] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("1h");
  const [customFrom, setCustomFrom] = useState<string>(() => isoLocal(new Date(Date.now() - 60 * 60_000)));
  const [customTo, setCustomTo]     = useState<string>(() => isoLocal(new Date()));
  const historyRef = useRef<Map<string, ServiceHealth[]>>(new Map());
  const lastStateRef = useRef<Map<string, ServiceHealth["state"]>>(new Map());

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const next = await pollAllServices(source);
      if (stopped) return;

      const newEvents: Event[] = [];
      for (const svc of next) {
        const prior = historyRef.current.get(svc.unit) ?? [];
        historyRef.current.set(svc.unit, [...prior, svc].slice(-HISTORY_LIMIT));
        const lastState = lastStateRef.current.get(svc.unit);
        if (lastState && lastState !== svc.state) {
          newEvents.push({ at: svc.checkedAt, unit: svc.unit, from: lastState, to: svc.state });
          // Surface real failures as notifications (DOWN = error, DEGRADED = warn).
          // The store dedupes (source, title) within 30 s so flapping doesn't spam.
          if (svc.state === "DOWN") {
            pushNotification({
              severity: "error",
              title: `${svc.unit} is DOWN`,
              message: svc.message ?? "No probe response",
              source: svc.unit,
              link: "operations",
            });
          } else if (svc.state === "DEGRADED") {
            pushNotification({
              severity: "warn",
              title: `${svc.unit} degraded`,
              message: svc.message ?? "Health probe returned a non-2xx response",
              source: svc.unit,
              link: "operations",
            });
          }
        }
        lastStateRef.current.set(svc.unit, svc.state);
      }

      const lats = next.map((s) => s.latencyMs).filter((v): v is number => v !== null);
      const avgLatency = lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
      const okCount = next.filter((s) => s.state === "OK").length;
      const successPct = next.length > 0 ? Math.round((okCount / next.length) * 100) : 0;

      const newLogs = generateLogsFromPoll(next);

      setSeries((cur) => ({
        latency: [...cur.latency, avgLatency].slice(-HISTORY_LIMIT),
        successPct: [...cur.successPct, successPct].slice(-HISTORY_LIMIT),
        upCount: [...cur.upCount, okCount].slice(-HISTORY_LIMIT),
      }));
      if (newEvents.length > 0) {
        setEvents((cur) => [...newEvents, ...cur].slice(0, EVENT_LIMIT));
      }
      setLogs((cur) => [...newLogs, ...cur].slice(0, LOG_LIMIT));
      setServices(next);
      setLastUpdated(Date.now());
    };
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => { stopped = true; window.clearInterval(id); };
  }, [source, refreshMs]);

  const summary = useMemo(() => {
    const counts = { OK: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 };
    services.forEach((s) => { counts[s.state]++; });
    return counts;
  }, [services]);

  const grouped = useMemo(() => groupByArchetype(services), [services]);
  const overall = services.length === 0
    ? "UNKNOWN"
    : summary.DOWN > 0 ? "DEGRADED" : summary.DEGRADED > 0 ? "WARN" : "OK";

  const selectedSvc = services.find((s) => s.unit === selected) ?? null;
  const selectedHistory = selected ? historyRef.current.get(selected) ?? [] : [];

  const [rangeFrom, rangeTo] = useMemo(() => resolveTimeRange(timeRange, customFrom, customTo), [timeRange, customFrom, customTo]);

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (logFilter !== "ALL" && l.level !== logFilter) return false;
      if (rangeFrom !== null && l.ts < rangeFrom) return false;
      if (rangeTo   !== null && l.ts > rangeTo)   return false;
      if (q && !(l.message.toLowerCase().includes(q) || l.unit.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, logFilter, logQuery, rangeFrom, rangeTo]);

  // When wrapped by MonitorDashboard the outer .docu-monitor is already in
  // place — use a plain "status-view" class to avoid doubling padding/max-width.
  const wrapperClass = embedded ? "docu-status-view" : "docu-monitor";

  return (
    <div className={wrapperClass}>
      {!embedded && (
        <header className="docu-monitor__header">
          <div>
            <span className="docu-monitor__brand">📄 Docuploader</span>
            <span className="docu-monitor__crumbs">
              Monitor › System status · {services.length || "…"} units across {Object.keys(grouped).length || "…"} archetypes
            </span>
          </div>
          <div className={`docu-monitor__live docu-monitor__live--${overall.toLowerCase()}`}>● {overall === "OK" ? "LIVE" : overall}</div>
        </header>
      )}
      {embedded && (
        <div className="docu-monitor__sub">
          <span className="docu-monitor__crumbs">{services.length || "…"} units across {Object.keys(grouped).length || "…"} archetypes</span>
          <div className={`docu-monitor__live docu-monitor__live--${overall.toLowerCase()}`}>● {overall === "OK" ? "LIVE" : overall}</div>
        </div>
      )}

      <section className="docu-monitor__stats">
        <StatTile label="SERVICES UP" value={`${summary.OK} / ${services.length}`} tone={summary.DOWN === 0 ? "ok" : "warn"} />
        <StatTile label="DEGRADED" value={`${summary.DEGRADED}`} tone={summary.DEGRADED ? "warn" : "ok"} />
        <StatTile label="DOWN" value={`${summary.DOWN}`} tone={summary.DOWN ? "bad" : "ok"} />
        <StatTile label="ARCHETYPES" value={`${Object.keys(grouped).length || 0}`} tone="ok" sub="go · ts · py · cpp" />
      </section>

      <section className="docu-chart-card">
        <div className="docu-chart-card__header">
          <h3 className="docu-chart-card__title">System Metrics</h3>
          <div className="docu-tabs" role="tablist">
            <Tab active={chartMetric === "latency"} onClick={() => setChartMetric("latency")}>Latency</Tab>
            <Tab active={chartMetric === "success"} onClick={() => setChartMetric("success")}>Success %</Tab>
            <Tab active={chartMetric === "up"}      onClick={() => setChartMetric("up")}>Services up</Tab>
          </div>
        </div>
        <BigChart
          metric={chartMetric}
          values={series[chartMetric === "latency" ? "latency" : chartMetric === "success" ? "successPct" : "upCount"]}
        />
      </section>

      <section className="docu-monitor__main">
        <div className="docu-monitor__services">
          {services.length === 0 && (
            <div className="docu-monitor__loading">polling 22 services…</div>
          )}
          {Object.entries(grouped).map(([archetype, items]) => (
            <section key={archetype} className="docu-monitor__group">
              <h3 className="docu-monitor__group-title">
                {archetype} <span className="docu-monitor__group-count">{items.length}</span>
              </h3>
              <div className="docu-monitor__grid">
                {items.map((svc) => (
                  <ServiceTile
                    key={svc.unit}
                    svc={svc}
                    history={(historyRef.current.get(svc.unit) ?? []).slice(-SPARKLINE_SAMPLES)}
                    selected={svc.unit === selected}
                    onClick={() => setSelected((cur) => cur === svc.unit ? null : svc.unit)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="docu-monitor__events">
          <h3 className="docu-monitor__group-title">events <span className="docu-monitor__group-count">{events.length}</span></h3>
          {events.length === 0 && <div className="docu-monitor__empty">No state changes yet.</div>}
          <div className="docu-events">
            {events.map((e, i) => (
              <div key={i} className={`docu-event docu-event--${e.to.toLowerCase()}`}>
                <span className="docu-event__time">{new Date(e.at).toLocaleTimeString()}</span>
                <span className="docu-event__unit">{e.unit}</span>
                <span className="docu-event__transition">
                  <span className={`docu-event__pill docu-event__pill--${e.from.toLowerCase()}`}>{e.from}</span>
                  <span className="docu-event__arrow">→</span>
                  <span className={`docu-event__pill docu-event__pill--${e.to.toLowerCase()}`}>{e.to}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="docu-logs-card">
        <div className="docu-logs-card__header">
          <h3 className="docu-chart-card__title">
            Logs <span className="docu-monitor__group-count">{filteredLogs.length} / {logs.length}</span>
            {rangeFrom !== null && rangeTo !== null && (
              <span className="docu-logs__range-summary">
                {new Date(rangeFrom).toLocaleString()} → {new Date(rangeTo).toLocaleString()}
              </span>
            )}
          </h3>
          <div className="docu-logs-card__controls">
            <input
              type="text"
              className="docu-logs__search"
              placeholder="search unit or message…"
              value={logQuery}
              onChange={(e) => setLogQuery(e.target.value)}
            />
            <div className="docu-tabs" role="tablist">
              {(["ALL", "INFO", "WARN", "ERROR", "DEBUG"] as const).map((lvl) => (
                <Tab key={lvl} active={logFilter === lvl} onClick={() => setLogFilter(lvl)}>{lvl}</Tab>
              ))}
            </div>
          </div>
        </div>
        <div className="docu-logs-card__time-row">
          <span className="docu-logs__range-label">Time range</span>
          <div className="docu-tabs" role="tablist">
            {(["5m", "15m", "1h", "6h", "24h", "ALL", "CUSTOM"] as const).map((p) => (
              <Tab key={p} active={timeRange === p} onClick={() => setTimeRange(p)}>{PRESET_LABEL[p]}</Tab>
            ))}
          </div>
          {timeRange === "CUSTOM" && (
            <div className="docu-logs__custom">
              <label>
                <span>From</span>
                <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}
        </div>
        <div className="docu-logs">
          {filteredLogs.length === 0 && <div className="docu-monitor__empty">No log entries match the filter.</div>}
          {filteredLogs.map((l, i) => (
            <div key={i} className={`docu-log docu-log--${l.level.toLowerCase()}`}>
              <span className="docu-log__time">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className={`docu-log__level docu-log__level--${l.level.toLowerCase()}`}>{l.level}</span>
              <span className="docu-log__unit">{l.unit}</span>
              <span className="docu-log__msg">{l.message}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="docu-monitor__footer">
        {lastUpdated ? `last updated ${new Date(lastUpdated).toLocaleTimeString()}` : "polling…"}
        {source.mock && <span className="docu-monitor__mock-badge">MOCK DATA</span>}
      </footer>

      {selectedSvc && (
        <DetailDrawer
          svc={selectedSvc}
          history={selectedHistory}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// --- subcomponents ---

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`docu-tab ${active ? "docu-tab--active" : ""}`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, tone, sub }: { label: string; value: string; tone: "ok" | "warn" | "bad"; sub?: string }) {
  return (
    <div className={`docu-tile docu-tile--stat docu-tile--${tone}`}>
      <div className="docu-tile__label">{label}</div>
      <div className="docu-tile__value">{value}</div>
      {sub && <div className="docu-tile__sub">{sub}</div>}
    </div>
  );
}

function BigChart({ metric, values }: { metric: ChartMetric; values: number[] }) {
  const unit = metric === "latency" ? "ms" : metric === "success" ? "%" : "up";
  const max = Math.max(...values, metric === "success" ? 100 : 1);
  const min = metric === "success" ? 0 : Math.min(...values, 0);
  return (
    <div className="docu-bigchart-wrap">
      <AreaChart
        values={values}
        height={140}
        stroke="var(--accent)"
        fill="rgba(25, 118, 210, 0.2)"
        showGrid
        min={min}
        max={max}
        unit={unit}
      />
      <div className="docu-bigchart__legend">
        <span>{values.length} samples</span>
        <span>min {min} {unit}</span>
        <span>max {max} {unit}</span>
        <span>now {values[values.length - 1] ?? "—"} {unit}</span>
      </div>
    </div>
  );
}

function AreaChart({
  values, height, stroke, fill, showGrid = false, min: minIn, max: maxIn, unit = "",
}: {
  values: number[]; height: number; stroke: string; fill: string;
  showGrid?: boolean; min?: number; max?: number; unit?: string;
}) {
  const width = 800; // scales via viewBox; SVG is preserveAspectRatio=none so it stretches
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="docu-areachart docu-areachart--empty">
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-dim)" fontSize="14">collecting samples…</text>
      </svg>
    );
  }
  const max = maxIn ?? Math.max(...values);
  const min = minIn ?? Math.min(...values);
  const span = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fillPath = `${path} L${width},${height} L0,${height} Z`;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(relX / stepX)));
    setHoverIdx(idx);
  }

  const hoverPt = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverVal = hoverIdx !== null ? values[hoverIdx] : null;
  // Tooltip x — clamp so it doesn't overflow either edge
  const tipX = hoverPt ? Math.max(40, Math.min(width - 40, hoverPt[0])) : 0;
  const tipY = hoverPt ? Math.max(18, hoverPt[1] - 14) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="docu-areachart"
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {showGrid && (
        <g className="docu-areachart__grid">
          {[0.25, 0.5, 0.75].map((p) => (
            <line key={p} x1={0} y1={height * p} x2={width} y2={height * p}
              stroke="var(--border)" strokeDasharray="3 4" />
          ))}
        </g>
      )}
      <path d={fillPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} />

      {/* invisible wide hit-area so mouse-over works everywhere */}
      <rect x={0} y={0} width={width} height={height} fill="transparent" />

      {hoverPt && (
        <g className="docu-areachart__hover">
          {/* vertical guideline */}
          <line x1={hoverPt[0]} y1={0} x2={hoverPt[0]} y2={height}
            stroke={stroke} strokeOpacity="0.4" strokeDasharray="2 3" />
          {/* point marker */}
          <circle cx={hoverPt[0]} cy={hoverPt[1]} r={5}
            fill="var(--bg-elev)" stroke={stroke} strokeWidth={2} />
          {/* tooltip */}
          <g transform={`translate(${tipX}, ${tipY})`}>
            <rect x={-36} y={-26} width={72} height={22} rx={4}
              fill="var(--bg-elev)" stroke={stroke} strokeOpacity="0.6" />
            <text x={0} y={-11} textAnchor="middle" dominantBaseline="middle"
              fill="var(--text)" fontSize="12" fontWeight="600">
              {hoverVal} {unit}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

function ServiceTile({
  svc, history, selected, onClick,
}: {
  svc: ServiceHealth;
  history: ServiceHealth[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`docu-tile docu-tile--svc docu-tile--${svc.state.toLowerCase()} ${selected ? "docu-tile--selected" : ""}`}
      aria-pressed={selected}
    >
      <div className="docu-tile__top">
        <div className="docu-tile__label">{svc.unit}</div>
        {svc.links.service && (
          <a
            className="docu-tile__link"
            href={svc.links.service}
            target="_blank"
            rel="noreferrer"
            title="Open service"
            onClick={(e) => e.stopPropagation()}
          >↗</a>
        )}
      </div>
      <div className="docu-tile__value">{svc.state}</div>
      <div className="docu-tile__sub">
        {svc.latencyMs !== null ? `${svc.latencyMs} ms` : svc.message ?? "no probe"}
      </div>
      <StateBar samples={history} />
    </button>
  );
}

function StateBar({ samples }: { samples: ServiceHealth[] }) {
  const slots = Array.from({ length: SPARKLINE_SAMPLES }, (_, i) => samples[samples.length - SPARKLINE_SAMPLES + i] ?? null);
  return (
    <div className="docu-statebar" aria-label="recent probes">
      {slots.map((s, i) => (
        <span
          key={i}
          className={`docu-statebar__slot docu-statebar__slot--${s ? s.state.toLowerCase() : "empty"}`}
          title={s ? `${new Date(s.checkedAt).toLocaleTimeString()} · ${s.state}` : "no sample"}
        />
      ))}
    </div>
  );
}

function DetailDrawer({ svc, history, onClose }: { svc: ServiceHealth; history: ServiceHealth[]; onClose: () => void }) {
  const okCount = history.filter((h) => h.state === "OK").length;
  const successPct = history.length > 0 ? Math.round((okCount / history.length) * 100) : 0;
  const latencies = history.map((h) => h.latencyMs).filter((v): v is number => v !== null);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  const linkRows: Array<[string, string | null]> = [
    ["Open service", svc.links.service],
    ["View logs", svc.links.logs],
    ["View metrics", svc.links.metrics],
    ["Runbook", svc.links.runbook],
    ["Repository", svc.links.repository],
  ];

  return (
    <div className="docu-drawer" role="dialog" aria-label={`${svc.unit} details`}>
      <div className="docu-drawer__backdrop" onClick={onClose} />
      <div className="docu-drawer__panel">
        <header className="docu-drawer__header">
          <div>
            <div className="docu-drawer__title">{svc.unit}</div>
            <div className="docu-drawer__archetype">{svc.archetype}</div>
          </div>
          <button className="docu-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className={`docu-drawer__badge docu-drawer__badge--${svc.state.toLowerCase()}`}>
          {svc.state}
        </div>

        <div className="docu-drawer__quick-links">
          {linkRows.map(([label, href]) => href ? (
            <a key={label} className="docu-link-btn" href={href} target="_blank" rel="noreferrer">
              {label} <span className="docu-link-btn__arrow">↗</span>
            </a>
          ) : (
            <span key={label} className="docu-link-btn docu-link-btn--disabled" title="No URL configured">
              {label}
            </span>
          ))}
        </div>

        <div className="docu-drawer__chart-wrap">
          <div className="docu-drawer__chart-label">LATENCY · last {latencies.length}</div>
          <AreaChart values={latencies} height={90} stroke="var(--accent)" fill="rgba(25, 118, 210, 0.18)" unit="ms" />
        </div>

        <dl className="docu-drawer__props">
          <dt>Endpoint</dt>
          <dd>{svc.url ?? <em>mock — no URL</em>}</dd>
          <dt>Latency</dt>
          <dd>{svc.latencyMs !== null ? `${svc.latencyMs} ms` : "—"}</dd>
          <dt>Message</dt>
          <dd>{svc.message ?? "—"}</dd>
          <dt>Last checked</dt>
          <dd>{new Date(svc.checkedAt).toLocaleTimeString()}</dd>
          <dt>Success rate ({history.length} samples)</dt>
          <dd>{history.length > 0 ? `${successPct} %` : "—"}</dd>
          <dt>Average latency</dt>
          <dd>{avgLatency !== null ? `${avgLatency} ms` : "—"}</dd>
        </dl>

        <h4 className="docu-drawer__section-title">Probe history</h4>
        <div className="docu-drawer__history">
          {history.length === 0 && <div className="docu-drawer__empty">No samples yet — wait for next poll.</div>}
          {history.slice().reverse().map((h, i) => (
            <div key={i} className={`docu-drawer__sample docu-drawer__sample--${h.state.toLowerCase()}`}>
              <span className="docu-drawer__sample-time">{new Date(h.checkedAt).toLocaleTimeString()}</span>
              <span className="docu-drawer__sample-state">{h.state}</span>
              <span className="docu-drawer__sample-latency">{h.latencyMs !== null ? `${h.latencyMs} ms` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupByArchetype(services: ServiceHealth[]): Record<string, ServiceHealth[]> {
  const out: Record<string, ServiceHealth[]> = {};
  for (const s of services) {
    (out[s.archetype] ??= []).push(s);
  }
  return out;
}

// Format a Date as the "YYYY-MM-DDTHH:mm" string that <input type="datetime-local"> expects.
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert the current preset + custom inputs into a [from, to] epoch-ms tuple.
// `null` on either side means "unbounded".
function resolveTimeRange(
  preset: TimeRangePreset,
  customFrom: string,
  customTo: string,
): [number | null, number | null] {
  if (preset === "ALL") return [null, null];
  if (preset === "CUSTOM") {
    const from = customFrom ? new Date(customFrom).getTime() : null;
    const to   = customTo   ? new Date(customTo).getTime()   : null;
    return [from, to];
  }
  const now = Date.now();
  return [now - PRESET_MS[preset], now];
}
