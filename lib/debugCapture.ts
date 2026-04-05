/**
 * Lightweight in-app telemetry for development.
 * Captures real-world usage events so they can be copied and analyzed.
 * Tree-shaken in production (all exports are no-ops when NODE_ENV !== 'development').
 */

export type DebugEvent =
  | {
      type: 'search';
      ts: number;
      query: string;
      source: string;
      version: string;
      contentType: string;
      loader: string | null;
      durationMs: number;
      resultCount: number;
      totalHits: number;
      cacheHit: boolean;
      fallbackStrategy: 'none' | 'term-simplification' | 'version-fallback';
      fallbackVersion: string | null;
      append: boolean;
    }
  | {
      type: 'search_error';
      ts: number;
      query: string;
      source: string;
      version: string;
      contentType: string;
      message: string;
    }
  | {
      type: 'filter_change';
      ts: number;
      field: string;
      from: string;
      to: string;
    }
  | {
      type: 'queue_add';
      ts: number;
      id: string;
      title: string;
      source: string;
      contentType: string;
    }
  | {
      type: 'queue_download';
      ts: number;
      itemCount: number;
      format: string;
    }
  | {
      type: 'load_more';
      ts: number;
      offset: number;
      resultCount: number;
      durationMs: number;
    }
  | {
      type: 'zero_results';
      ts: number;
      query: string;
      source: string;
      version: string;
      contentType: string;
      fallbacksTried: string[];
    };

const IS_DEV = process.env.NODE_ENV === 'development';
const MAX_EVENTS = 150;

let _events: DebugEvent[] = [];
const _listeners = new Set<() => void>();

export function captureEvent(e: DebugEvent): void {
  if (!IS_DEV) return;
  _events = [e, ..._events].slice(0, MAX_EVENTS);
  _listeners.forEach(l => l());
}

export function getEvents(): DebugEvent[] {
  return _events;
}

export function clearEvents(): void {
  _events = [];
  _listeners.forEach(l => l());
}

export function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
