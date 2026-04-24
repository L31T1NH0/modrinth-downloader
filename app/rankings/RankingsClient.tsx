'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQueue } from '@/hooks/useQueue';
import type { RankingEntry } from '@/app/api/rankings/route';
import type { Filters } from '@/lib/modrinth/types';
import { CloudArrowDownIcon } from '@heroicons/react/24/solid';
import {
  CubeIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
  CheckIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RANK_COLORS: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-400',
  3: 'text-orange-400',
};

const FALLBACK_FILTERS: Filters = {
  source:       'modrinth',
  version:      '',
  contentType:  'mod',
  loader:       'fabric',
  shaderLoader: null,
  pluginLoader: null,
};

function modPageUrl(entry: RankingEntry): string {
  if (entry.source === 'modrinth') return `https://modrinth.com/project/${entry.id}`;
  return `https://www.curseforge.com/minecraft/mc-mods/${entry.id}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  rankings: RankingEntry[];
  total:    number;
}

export function RankingsClient({ rankings, total }: Props) {
  const queue = useQueue();
  const [savedFilters, setSavedFilters] = useState<Filters>(FALLBACK_FILTERS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem('modrinth-dl:filters');
      if (raw) setSavedFilters(JSON.parse(raw) as Filters);
    } catch { /* ignore */ }
  }, []);

  const hasVersion  = !!savedFilters.version;
  const totalDownloads = rankings.reduce((s, e) => s + e.count, 0);
  const queueCount  = queue.entries.length;

  function filtersFor(entry: RankingEntry): Filters {
    return { ...savedFilters, source: entry.source as Filters['source'], contentType: 'mod' };
  }

  return (
    <div className="flex flex-col bg-bg-base text-ink-primary font-sans" style={{ minHeight: '100dvh' }}>

      {/* Header */}
      <header className="border-b border-line-subtle shrink-0">
        <div className="flex items-center gap-6 px-5 py-2.5">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center shrink-0">
              <CloudArrowDownIcon className="w-3.5 h-3.5 text-brand-dark" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight group-hover:text-brand transition-colors">
              dynrinth
            </span>
          </Link>
          <span className="text-ink-muted text-xs select-none">/</span>
          <span className="text-xs font-medium text-ink-secondary">Rankings</span>

          {/* Queue pill — visible once hydrated */}
          {mounted && queueCount > 0 && (
            <Link
              href="/"
              className="ml-auto flex items-center gap-2 h-7 px-3 rounded-md bg-bg-surface border border-line text-ink-secondary text-[11px] font-medium hover:text-ink-primary hover:bg-bg-hover transition-all duration-150 shrink-0"
              title="Go to main page to download"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              Queue
              <span className="min-w-[18px] h-[18px] px-1 bg-brand text-brand-dark text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
                {queueCount}
              </span>
            </Link>
          )}
        </div>

        {/* Version context bar */}
        {mounted && (
          <div className="flex items-center gap-2 px-5 py-1.5 border-t border-line-subtle bg-bg-surface/40">
            {hasVersion ? (
              <>
                <span className="text-[10px] text-ink-tertiary">Adding to queue for</span>
                <span className="text-[10px] font-mono font-semibold text-ink-primary">{savedFilters.version}</span>
                <span className="text-[10px] text-ink-muted">·</span>
                <span className="text-[10px] text-ink-tertiary capitalize">{savedFilters.loader}</span>
                <span className="text-[10px] text-ink-muted">·</span>
                <span className="text-[10px] text-ink-tertiary capitalize">{savedFilters.source}</span>
                <Link href="/" className="ml-auto text-[10px] text-ink-tertiary hover:text-brand transition-colors">
                  change →
                </Link>
              </>
            ) : (
              <>
                <span className="text-[10px] text-ink-tertiary">
                  No MC version set —
                </span>
                <Link href="/" className="text-[10px] text-brand hover:underline">
                  open Dynrinth first
                </Link>
                <span className="text-[10px] text-ink-tertiary">to enable queue</span>
              </>
            )}
          </div>
        )}
      </header>

      {/* Stats bar */}
      <main className="flex-1 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <ChartBarIcon className="w-3.5 h-3.5 text-ink-tertiary" />
            {total > 0
              ? <span><span className="text-ink-primary font-medium">{total.toLocaleString()}</span> mod{total === 1 ? '' : 's'} tracked</span>
              : <span>No data yet</span>
            }
          </div>
          {totalDownloads > 0 && (
            <span className="text-[10px] font-mono text-ink-tertiary">
              {fmtCount(totalDownloads)} total downloads
            </span>
          )}
        </div>

        {/* List */}
        {rankings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-ink-tertiary">
            <ChartBarIcon className="w-8 h-8 text-ink-secondary opacity-40" />
            <span className="text-xs text-center leading-relaxed">
              No data yet — download some mods<br />to get the rankings started!
            </span>
          </div>
        ) : (
          <ol>
            {rankings.map((entry, i) => {
              const rankColor  = RANK_COLORS[entry.rank] ?? 'text-ink-muted';
              const searchUrl  = `/?q=${encodeURIComponent(entry.name ?? entry.id)}`;
              const inQueue    = queue.entries.some(e => e.id === entry.id);
              const isActive   = queue.entries.find(e => e.id === entry.id)?.status === 'resolving';

              return (
                <li key={entry.member}>
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 border-b border-line hover:bg-bg-surface/60 transition-all duration-150 animate-fadeIn"
                    style={{ animationDelay: `${i * 20}ms` }}
                  >
                    {/* Rank */}
                    <span className={`w-6 text-right text-[11px] font-mono font-semibold shrink-0 ${rankColor}`}>
                      {entry.rank <= 3 ? ['①', '②', '③'][entry.rank - 1] : `#${entry.rank}`}
                    </span>

                    {/* Icon */}
                    {entry.iconUrl ? (
                      <Image
                        src={entry.iconUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-lg border border-line-subtle object-cover shrink-0 bg-bg-surface"
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-bg-surface border border-line-subtle flex items-center justify-center shrink-0">
                        <CubeIcon className="w-5 h-5 text-ink-tertiary" />
                      </div>
                    )}

                    {/* Name + badges */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold leading-tight truncate">
                        {entry.name ?? entry.id}
                      </p>
                      <div className="flex gap-1.5 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-glow text-brand border border-brand/30 font-mono">
                          ⬇ {fmtCount(entry.count)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-surface text-ink-secondary border border-line-subtle capitalize">
                          {entry.source}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">

                      {/* Add to queue */}
                      {mounted && (
                        inQueue ? (
                          <div
                            className="w-8 h-8 rounded-lg bg-brand-glow text-brand flex items-center justify-center cursor-default"
                            title="Already in queue"
                          >
                            {isActive
                              ? <span className="w-3 h-3 rounded-full border-[1.5px] border-brand/40 border-t-brand animate-spin" />
                              : <CheckIcon className="w-3.5 h-3.5" />
                            }
                          </div>
                        ) : hasVersion ? (
                          <button
                            onClick={() => queue.add(entry.id, entry.name ?? entry.id, entry.iconUrl, filtersFor(entry))}
                            className="no-ring w-8 h-8 rounded-lg bg-bg-card text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95 flex items-center justify-center transition-all duration-150"
                            title={`Add to queue · ${savedFilters.version} · ${savedFilters.loader}`}
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <a
                            href={searchUrl}
                            className="no-ring w-8 h-8 rounded-lg bg-bg-card text-ink-muted flex items-center justify-center transition-all duration-150"
                            title="Open Dynrinth to set a Minecraft version first"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </a>
                        )
                      )}

                      {/* Search on Dynrinth */}
                      <a
                        href={searchUrl}
                        className="w-8 h-8 rounded-lg bg-bg-card text-ink-secondary hover:text-ink-primary hover:bg-bg-hover flex items-center justify-center transition-all duration-150"
                        title={`Search "${entry.name ?? entry.id}" on Dynrinth`}
                      >
                        <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                      </a>

                      {/* External link */}
                      <a
                        href={modPageUrl(entry)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-bg-card text-ink-secondary hover:text-ink-primary hover:bg-bg-hover flex items-center justify-center transition-all duration-150"
                        title="View on platform"
                      >
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {rankings.length > 0 && (
          <p className="text-center text-[10px] text-ink-muted py-4">
            Updates every 60 s · Tracking downloads through Dynrinth
          </p>
        )}
      </main>
    </div>
  );
}
