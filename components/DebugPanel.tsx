'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getEvents, clearEvents, subscribe, type DebugEvent } from '@/lib/debugCapture';

// Only mount in development
const IS_DEV = process.env.NODE_ENV === 'development';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function eventColor(type: DebugEvent['type']): string {
  switch (type) {
    case 'search':        return '#1bd96a';
    case 'search_error':  return '#ef4444';
    case 'zero_results':  return '#f59e0b';
    case 'filter_change': return '#60a5fa';
    case 'queue_add':     return '#a78bfa';
    case 'queue_download':return '#34d399';
    case 'load_more':     return '#94a3b8';
  }
}

function EventRow({ e }: { e: DebugEvent }) {
  const [open, setOpen] = useState(false);

  const summary = (() => {
    switch (e.type) {
      case 'search':
        return `"${e.query || '(browse)'}" → ${e.resultCount} hits · ${e.durationMs}ms${e.cacheHit ? ' [cache]' : ''}${e.fallbackStrategy !== 'none' ? ` [${e.fallbackStrategy}]` : ''}`;
      case 'search_error':
        return `"${e.query}" ERROR: ${e.message}`;
      case 'zero_results':
        return `"${e.query}" → 0 results · ${e.source}/${e.version}`;
      case 'filter_change':
        return `${e.field}: ${e.from} → ${e.to}`;
      case 'queue_add':
        return `+queue "${e.title}"`;
      case 'queue_download':
        return `download ${e.itemCount} files · ${e.format}`;
      case 'load_more':
        return `load more @${e.offset} → +${e.resultCount} · ${e.durationMs}ms`;
    }
  })();

  return (
    <div
      className="border-b border-[#1f2d3d] cursor-pointer hover:bg-[#111820] transition-colors"
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-start gap-2 px-3 py-1.5">
        <span
          className="text-[9px] font-mono uppercase shrink-0 mt-0.5 w-20 truncate"
          style={{ color: eventColor(e.type) }}
        >
          {e.type.replace('_', ' ')}
        </span>
        <span className="flex-1 text-[11px] text-[#7099bb] leading-snug min-w-0 break-words">
          {summary}
        </span>
        <span className="text-[9px] text-[#2d4a66] shrink-0 mt-0.5">{relTime(e.ts)}</span>
      </div>
      {open && (
        <pre className="px-3 pb-2 text-[10px] text-[#4a6a88] whitespace-pre-wrap leading-relaxed">
          {JSON.stringify(e, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function PanelInner() {
  const [events, setEvents] = useState<DebugEvent[]>(() => getEvents());
  const [collapsed, setCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(() => setEvents(getEvents())), []);

  // Ctrl+Shift+D toggles panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setCollapsed(c => !c);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const copyJSON = useCallback(async () => {
    const payload = {
      capturedAt: new Date().toISOString(),
      eventCount: events.length,
      events,
      summary: {
        searches: events.filter(e => e.type === 'search').length,
        zeroResults: events.filter(e => e.type === 'zero_results').length,
        errors: events.filter(e => e.type === 'search_error').length,
        cacheHits: events.filter(e => e.type === 'search' && (e as { cacheHit: boolean }).cacheHit).length,
        filterChanges: events.filter(e => e.type === 'filter_change').length,
        queueAdds: events.filter(e => e.type === 'queue_add').length,
      },
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [events]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#07090a]/90 border border-[#1f2d3d] text-[10px] font-mono text-[#4a6a88] hover:text-[#7099bb] hover:border-[#273848] transition-colors backdrop-blur-sm"
        title="Open debug panel (Ctrl+Shift+D)"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#1bd96a]" />
        dbg · {events.length}
      </button>
    );
  }

  return (
    <div className="flex flex-col w-80 max-h-[60vh] rounded-lg border border-[#1f2d3d] bg-[#07090a]/95 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2d3d] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1bd96a]" />
          <span className="text-[11px] font-mono text-[#7099bb]">debug · {events.length} events</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyJSON}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#1f2d3d] text-[#4a6a88] hover:text-[#7099bb] hover:border-[#273848] transition-colors"
          >
            {copied ? 'copied!' : 'copy JSON'}
          </button>
          <button
            onClick={() => { clearEvents(); }}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#1f2d3d] text-[#4a6a88] hover:text-[#ef4444] hover:border-[#ef4444]/40 transition-colors"
          >
            clear
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#1f2d3d] text-[#4a6a88] hover:text-[#7099bb] hover:border-[#273848] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Event list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[11px] text-[#2d4a66] font-mono">
            no events yet
          </div>
        ) : (
          events.map((e, i) => <EventRow key={i} e={e} />)
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-[#1f2d3d] shrink-0">
        <span className="text-[9px] font-mono text-[#2d4a66]">Ctrl+Shift+D · click row to expand · copy JSON to share</span>
      </div>
    </div>
  );
}

export function DebugPanel() {
  if (!IS_DEV) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <PanelInner />
    </div>
  );
}
