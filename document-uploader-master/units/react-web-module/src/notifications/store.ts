// Tiny in-memory notification store with a pub/sub interface. No context
// provider needed — components subscribe via the `useNotifications` hook.
// Dedupes repeated (source,title) within 30 s so a flapping service doesn't
// spam the user.
import { useEffect, useState } from "react";

export type Severity = "error" | "warn" | "info";

export type Notification = {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  /** Where it came from — e.g. "ocr-service" or "upload" */
  source?: string;
  /** Tab to open when the user clicks. Maps to MonitorDashboard view IDs. */
  link?: "upload" | "pipeline" | "tenants" | "operations" | "runbook";
  ts: number;
  read: boolean;
};

const STORAGE_KEY = "docu-notifications";
const MAX_KEPT = 50;
const DEDUP_WINDOW_MS = 30_000;

type Listener = (items: Notification[]) => void;
const listeners = new Set<Listener>();

let items: Notification[] = loadFromStorage();

function loadFromStorage(): Notification[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Notification[];
    // Only keep entries from the last 24 h so refreshes don't dredge up old noise.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed.filter((n) => n.ts >= cutoff);
  } catch {
    return [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore — private mode etc. */ }
}

function emit() {
  for (const l of listeners) l(items);
}

/** Push a new notification. Returns the id, or null if deduped. */
export function pushNotification(input: Omit<Notification, "id" | "ts" | "read">): string | null {
  const now = Date.now();
  const dup = items.find(
    (n) => n.source === input.source && n.title === input.title && now - n.ts < DEDUP_WINDOW_MS,
  );
  if (dup) return null;
  const next: Notification = {
    ...input,
    id: `n-${now}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now,
    read: false,
  };
  items = [next, ...items].slice(0, MAX_KEPT);
  persist();
  emit();
  return next.id;
}

export function markRead(id: string) {
  items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
  persist();
  emit();
}

export function markAllRead() {
  items = items.map((n) => ({ ...n, read: true }));
  persist();
  emit();
}

export function dismiss(id: string) {
  items = items.filter((n) => n.id !== id);
  persist();
  emit();
}

export function clearAll() {
  items = [];
  persist();
  emit();
}

export function getSnapshot(): Notification[] {
  return items;
}

/** React hook — returns the current list and re-renders when it changes. */
export function useNotifications(): Notification[] {
  const [snap, setSnap] = useState<Notification[]>(items);
  useEffect(() => {
    listeners.add(setSnap);
    setSnap(items);
    return () => { listeners.delete(setSnap); };
  }, []);
  return snap;
}
