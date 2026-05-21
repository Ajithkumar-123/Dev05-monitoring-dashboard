// Notifications UI — three pieces:
//   - <Toasts/>     transient bottom-right stack (auto-dismiss 6 s)
//   - <BellButton/> top-bar icon with unread-count badge
//   - <Panel/>      dropdown opened from the bell — full history
import { useEffect, useRef, useState } from "react";
import {
  useNotifications, dismiss, markRead, markAllRead, clearAll,
  type Notification, type Severity,
} from "./store.js";

const TOAST_MS = 6_000;
const TOASTS_MAX = 4;

// --- Toasts (transient corner notifications) -------------------------------

export function Toasts() {
  const all = useNotifications();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Auto-dismiss after TOAST_MS for unread items
  useEffect(() => {
    const timers: number[] = [];
    for (const n of all) {
      if (n.read || hidden.has(n.id)) continue;
      const remaining = TOAST_MS - (Date.now() - n.ts);
      if (remaining <= 0) {
        setHidden((s) => new Set(s).add(n.id));
        continue;
      }
      timers.push(window.setTimeout(() => {
        setHidden((s) => new Set(s).add(n.id));
      }, remaining));
    }
    return () => { for (const id of timers) window.clearTimeout(id); };
  }, [all, hidden]);

  const visible = all.filter((n) => !n.read && !hidden.has(n.id)).slice(0, TOASTS_MAX);

  if (visible.length === 0) return null;

  return (
    <div className="docu-toasts" role="status" aria-live="polite">
      {visible.map((n) => (
        <div key={n.id} className={`docu-toast docu-toast--${n.severity}`}>
          <span className="docu-toast__icon">{severityIcon(n.severity)}</span>
          <div className="docu-toast__body">
            <div className="docu-toast__title">{n.title}</div>
            <div className="docu-toast__msg">{n.message}</div>
            {n.source && <div className="docu-toast__src">{n.source}</div>}
          </div>
          <button
            className="docu-toast__close"
            aria-label="Dismiss"
            onClick={() => setHidden((s) => new Set(s).add(n.id))}
          >×</button>
        </div>
      ))}
    </div>
  );
}

// --- Bell button + panel ---------------------------------------------------

export function BellButton({ onJump }: { onJump?: (link: NonNullable<Notification["link"]>) => void }) {
  const all = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = all.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="docu-bell-wrap" ref={rootRef}>
      <button
        className="docu-mainbar__btn docu-bell"
        title={unread > 0 ? `${unread} unread alert${unread === 1 ? "" : "s"}` : "No new alerts"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        🔔
        {unread > 0 && <span className="docu-bell__badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <Panel
          items={all}
          onJump={(link) => { setOpen(false); onJump?.(link); }}
        />
      )}
    </div>
  );
}

function Panel({ items, onJump }: { items: Notification[]; onJump: (link: NonNullable<Notification["link"]>) => void }) {
  return (
    <div className="docu-bell__panel" role="menu">
      <div className="docu-bell__panel-head">
        <span className="docu-bell__panel-title">Notifications</span>
        <div className="docu-bell__panel-actions">
          <button className="docu-link-btn" onClick={markAllRead}>Mark all read</button>
          <button className="docu-link-btn" onClick={clearAll}>Clear</button>
        </div>
      </div>
      {items.length === 0 && (
        <div className="docu-bell__empty">All clear — no alerts.</div>
      )}
      <div className="docu-bell__list">
        {items.slice(0, 30).map((n) => (
          <div
            key={n.id}
            className={`docu-bell__row docu-bell__row--${n.severity} ${n.read ? "docu-bell__row--read" : ""}`}
          >
            <span className="docu-bell__row-icon">{severityIcon(n.severity)}</span>
            <div className="docu-bell__row-body">
              <div className="docu-bell__row-title">{n.title}</div>
              <div className="docu-bell__row-msg">{n.message}</div>
              <div className="docu-bell__row-meta">
                <span>{relativeTime(n.ts)}</span>
                {n.source && <><span>·</span><span>{n.source}</span></>}
                {n.link && (
                  <>
                    <span>·</span>
                    <button className="docu-bell__row-jump" onClick={() => { markRead(n.id); onJump(n.link!); }}>
                      Open {viewLabel(n.link)} ↗
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              className="docu-bell__row-dismiss"
              aria-label="Dismiss"
              onClick={() => dismiss(n.id)}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function severityIcon(s: Severity): string {
  if (s === "error") return "🛑";
  if (s === "warn")  return "⚠️";
  return "ℹ️";
}

function viewLabel(v: NonNullable<Notification["link"]>): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
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
