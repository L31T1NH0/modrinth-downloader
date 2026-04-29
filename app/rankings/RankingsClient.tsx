'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQueue } from '@/hooks/useQueue';
import type { RankingEntry } from '@/app/api/rankings/route';
import type { Filters, ShaderLoader } from '@/lib/modrinth/types';
import { useLocale } from '@/lib/i18n';
import {
  CubeIcon,
  TrophyIcon,
  PlusIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CogIcon,
  ServerStackIcon,
  CircleStackIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CustomSelect } from '@/components/CustomSelect';
import { Wordmark } from '@/components/Wordmark';
import { PillToggle } from '@/components/PillToggle';
import { SHADER_LOADERS } from '@/lib/filterConfig';
import * as modrinthService from '@/lib/modrinth/service';
import { fmtCount } from '@/lib/format';

// ─── Constants ────────────────────────────────────────────────────────────────

// LOADERS and SHADER_LOADERS imported from @/lib/filterConfig

const RANKING_CONTENT_TYPES = [
  { id: 'mod',          icon: CogIcon         },
  { id: 'plugin',       icon: ServerStackIcon },
  { id: 'datapack',     icon: CircleStackIcon },
  { id: 'resourcepack', icon: PhotoIcon       },
  { id: 'shader',       icon: SparklesIcon    },
] as const;

type RankingContentType = typeof RANKING_CONTENT_TYPES[number]['id'];

const PODIUM: Record<number, { label: string; color: string; border: string; glow: string; badgeBg: string; badgeBorder: string }> = {
  1: { label: '#1', color: 'text-amber-400',  border: 'border-l-[2px] border-l-amber-400/70',  glow: 'bg-amber-400/[0.04]',  badgeBg: 'bg-amber-400/10',  badgeBorder: 'border-amber-400/40'  },
  2: { label: '#2', color: 'text-slate-300',  border: 'border-l-[2px] border-l-slate-400/60',  glow: 'bg-slate-400/[0.03]',  badgeBg: 'bg-slate-400/10',  badgeBorder: 'border-slate-400/40'  },
  3: { label: '#3', color: 'text-orange-400', border: 'border-l-[2px] border-l-orange-400/60', glow: 'bg-orange-400/[0.03]', badgeBg: 'bg-orange-400/10', badgeBorder: 'border-orange-400/40' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modPageUrl(entry: RankingEntry): string {
  if (entry.source === 'modrinth') return `https://modrinth.com/project/${entry.id}`;
  return `https://www.curseforge.com/minecraft/mc-mods/${entry.id}`;
}

function contentTypeLabel(
  id: RankingContentType,
  t: ReturnType<typeof useLocale>,
): string {
  return t.filters.contentTypes[id];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  rankings: RankingEntry[];
  total:    number;
}

export function RankingsClient({ rankings: initialRankings, total: initialTotal }: Props) {
  const queue = useQueue();
  const t = useLocale();

  // Filter state (mirrors main page sidebar)
  const [source,      setSource]      = useState<'modrinth' | 'curseforge'>('modrinth');
  const [contentType, setContentType] = useState<RankingContentType>('mod');
  const [version,     setVersion]     = useState('');
  const [shaderLoader, setShaderLoader] = useState<ShaderLoader | null>(null);
  const [versions,    setVersions]    = useState<string[]>([]);

  const [rankings,    setRankings]    = useState(initialRankings);
  const [total,       setTotal]       = useState(initialTotal);
  const [isFetching,  setIsFetching]  = useState(false);
  const [mounted,     setMounted]     = useState(false);
  const [liveStats,   setLiveStats]   = useState<{ usersOnline: number | null; totalDownloads: number | null }>({ usersOnline: null, totalDownloads: null });
  const sidRef = useRef<string | null>(null);
  const sourceOptions = [
    { value: 'modrinth', label: t.filters.sources.modrinth, icon: '/Modrinth_icon_light.webp' },
    { value: 'curseforge', label: t.filters.sources.curseforge, icon: '/curseforge.svg' },
  ] as const;
  const contentTypes = RANKING_CONTENT_TYPES.map(ct => ({ ...ct, label: contentTypeLabel(ct.id, t) }));

  // Presence heartbeat + global stats
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem('dynrinth:sid');
      sidRef.current = existing ?? (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem('dynrinth:sid', id);
        return id;
      })();
    } catch {
      sidRef.current = crypto.randomUUID();
    }

    async function tick() {
      const sid = sidRef.current!;
      const [, statsRes] = await Promise.allSettled([
        fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid }),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/stats').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;
      if (stats) setLiveStats({ usersOnline: stats.usersOnline, totalDownloads: stats.totalDownloads });
    }

    void tick();
    const timer = setInterval(() => void tick(), 30_000);
    return () => clearInterval(timer);
  }, []);

  // On mount: fetch version list
  useEffect(() => {
    setMounted(true);
    modrinthService.fetchGameVersions()
      .then(vs => {
        setVersions(vs);
        if (vs.length) setVersion(vs[0]);
      })
      .catch(() => {});
  }, []);

  // Re-fetch rankings whenever source / contentType / version changes
  useEffect(() => {
    if (!version) return;
    const params = new URLSearchParams({ contentType, version, source, limit: '20' });
    setIsFetching(true);
    fetch(`/api/rankings?${params}`)
      .then(r => r.json() as Promise<{ rankings: RankingEntry[]; total: number }>)
      .then(data => {
        setRankings(data.rankings ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  }, [source, contentType, version]);

  const queueCount     = queue.entries.length;
  const totalDownloads = rankings.reduce((s, e) => s + e.count, 0);

  const queueFilters = useCallback(
    (entry: RankingEntry): Filters => ({
      source:       entry.source as Filters['source'],
      contentType,
      version,
      loader:       'fabric',
      shaderLoader: contentType === 'shader' ? shaderLoader : null,
      pluginLoader: null,
      sortIndex:    'relevance',
      clientSide:   false,
      serverSide:   false,
    }),
    [contentType, version, shaderLoader],
  );

  const currentLabel = contentTypeLabel(contentType, t);

  return (
    <div className="flex bg-bg-base text-ink-primary overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── Sidebar (desktop only) ────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[196px] flex-shrink-0 flex-col bg-bg-base border-r border-line-subtle overflow-hidden">

        {/* Logo */}
        <Link href="/" className="flex items-center px-3.5 border-b border-line-subtle shrink-0 h-12">
          <Wordmark />
        </Link>

        {/* Filters */}
        <div className="py-2 shrink-0">
          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-1 pb-1.5">{t.filters.source}</p>
          <div className="px-3.5">
            <CustomSelect
              value={source}
              onChange={v => setSource(v as 'modrinth' | 'curseforge')}
              options={[...sourceOptions]}
              width="w-full"
            />
          </div>

          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.version}</p>
          <div className="px-3.5">
            <CustomSelect
              value={version}
              onChange={setVersion}
              options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
              width="w-full"
            />
          </div>

          {contentType === 'shader' && (
            <>
              <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.renderer}</p>
              <div className="px-3.5">
                <PillToggle<ShaderLoader>
                  options={SHADER_LOADERS}
                  active={shaderLoader}
                  onToggle={sl => setShaderLoader(prev => prev === sl ? null : sl)}
                />
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-line-subtle mx-3.5 my-1 shrink-0" />

        {/* Content type nav */}
        <div className="py-1 overflow-y-auto">
          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-1 pb-1.5">{t.filters.contentType}</p>
          {contentTypes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setContentType(id)}
              className={[
                'flex items-center gap-2 w-[calc(100%-12px)] mx-1.5 px-3 py-1.5 mb-px rounded text-[12.5px] font-medium transition-all duration-100 border',
                contentType === id
                  ? 'bg-brand-glow text-ink-primary border-brand/30'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-bg-hover border-transparent',
              ].join(' ')}
            >
              <Icon className="w-3 h-3 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats + queue pill */}
        {mounted && (
          <div className="border-t border-line-subtle shrink-0">
            {(total > 0 || totalDownloads > 0) && (
              <div className="px-3.5 pt-3 pb-2 flex flex-col gap-2">
                {total > 0 && (
                  <div>
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">{t.rankings.tracked}</p>
                    <p className="text-mono text-[11px] font-semibold text-ink-primary">{total.toLocaleString()}</p>
                  </div>
                )}
                {totalDownloads > 0 && (
                  <div>
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">{t.rankings.downloads}</p>
                    <p className="text-mono text-[11px] font-semibold text-brand">{fmtCount(totalDownloads)}</p>
                  </div>
                )}
                {liveStats.usersOnline !== null && (
                  <div>
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">LIVE</p>
                    <p className="text-mono text-[11px] font-semibold text-ink-primary flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse shrink-0" />
                      {t.rankings.onlineNow.replace('{n}', liveStats.usersOnline.toLocaleString())}
                    </p>
                  </div>
                )}
                {liveStats.totalDownloads !== null && (
                  <div>
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">{t.rankings.totalDownloads.toUpperCase()}</p>
                    <p className="text-mono text-[11px] font-semibold text-ink-primary">{fmtCount(liveStats.totalDownloads)}</p>
                  </div>
                )}
              </div>
            )}
            {queueCount > 0 && (
              <div className="px-3.5 pb-3">
                <Link
                  href="/"
                  className="flex items-center gap-2 h-7 px-3 rounded-md bg-bg-surface border border-line text-ink-secondary text-[11px] font-medium hover:text-ink-primary hover:bg-bg-hover transition-all duration-150 w-full justify-center"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5 shrink-0" />
                  {t.nav.queue}
                  <span className="min-w-[18px] h-[18px] px-1 bg-brand text-brand-dark text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
                    {queueCount}
                  </span>
                </Link>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Mobile header */}
        <header className="md:hidden border-b border-line-subtle shrink-0 bg-bg-base">
          {/* Row 1: logo + content type tabs + back */}
          <div className="flex items-center gap-5 px-5 py-2 overflow-x-auto scrollbar-none">
            <Link href="/" className="shrink-0">
              <Wordmark />
            </Link>
            {contentTypes.map(ct => (
              <button
                key={ct.id}
                onClick={() => setContentType(ct.id)}
                className={[
                  'py-2 text-xs font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap',
                  contentType === ct.id
                    ? 'border-brand text-ink-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary',
                ].join(' ')}
              >
                {ct.label}
              </button>
            ))}
            <Link
              href="/"
              className="ml-auto flex items-center gap-1 text-[11px] text-ink-secondary hover:text-ink-primary transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftIcon className="w-3 h-3 shrink-0" />
              {t.nav.search}
            </Link>
          </div>
          {/* Row 2: filters */}
          <div className="flex items-center gap-3 px-5 pb-2 flex-wrap">
            <CustomSelect
              value={source}
              onChange={v => setSource(v as 'modrinth' | 'curseforge')}
              options={[...sourceOptions]}
              width="w-32"
            />
            <CustomSelect
              value={version}
              onChange={setVersion}
              options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
              width="w-28"
            />
            {contentType === 'shader' && (
              <PillToggle<ShaderLoader>
                options={SHADER_LOADERS}
                active={shaderLoader}
                onToggle={sl => setShaderLoader(prev => prev === sl ? null : sl)}
              />
            )}
            {isFetching && (
              <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-line-strong border-t-brand animate-spin shrink-0" />
            )}
            {mounted && queueCount > 0 && (
              <Link
                href="/"
                className="ml-auto flex items-center gap-2 h-7 px-3 rounded-md bg-bg-surface border border-line text-ink-secondary text-[11px] font-medium hover:text-ink-primary transition-all shrink-0"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {queueCount}
              </Link>
            )}
          </div>
        </header>

        {/* Page title bar (desktop) */}
        <div className="hidden md:flex items-center gap-2 px-5 h-12 border-b border-line-subtle shrink-0 bg-bg-base">
          <TrophyIcon className="w-3.5 h-3.5 text-brand shrink-0" />
          <span className="text-[13px] font-semibold tracking-tight">{t.rankings.mostDownloaded}</span>
          <span className="text-mono text-[10px] text-ink-tertiary ml-1">
            · {currentLabel}{version ? ` · ${version}` : ''}
          </span>
          {isFetching && (
            <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-line-strong border-t-brand animate-spin shrink-0" />
          )}
          <Link
            href="/"
            className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded-md text-ink-secondary text-[11px] font-medium hover:text-ink-primary hover:bg-bg-hover border border-transparent hover:border-line-subtle transition-all duration-150"
          >
            <ArrowLeftIcon className="w-3 h-3 shrink-0" />
            {t.nav.search}
          </Link>
        </div>

        {/* Rankings list */}
        <div className="flex-1 overflow-y-auto">
          {rankings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-ink-tertiary">
              <TrophyIcon className="w-8 h-8 text-ink-secondary opacity-30" />
              <span className="text-xs text-center leading-relaxed">
                {isFetching
                  ? t.rankings.loading
                  : t.rankings.empty.replace('{type}', currentLabel.toLowerCase())
                }
                {!isFetching && <><br />{t.rankings.emptyHint}</>}
              </span>
            </div>
          ) : (
            <div>
              {rankings.map((entry, i) => {
                const podium   = PODIUM[entry.rank];
                const searchUrl = `/?q=${encodeURIComponent(entry.name ?? entry.id)}`;
                const inQueue  = queue.entries.some(e => e.id === entry.id);
                const isActive = queue.entries.find(e => e.id === entry.id)?.status === 'resolving';

                return (
                  <div key={entry.member}>
                    <div
                      className="flex items-start gap-3 px-4 py-3.5 border-b border-line hover:bg-bg-surface/60 transition-all duration-150 cursor-default animate-fadeIn"
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      {/* Icon — same as main page */}
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

                      {/* Body — mirrors main page structure exactly */}
                      <div className="flex-1 min-w-0">
                        {/* Title as link, same hover style as main page */}
                        <a
                          href={modPageUrl(entry)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-semibold leading-tight hover:underline hover:text-brand transition-colors truncate block"
                          onClick={e => e.stopPropagation()}
                        >
                          {entry.name ?? entry.id}
                        </a>
                        {/* Description-position line — source, same slot as main page description */}
                        <p className="text-xs text-ink-secondary mt-0.5 leading-snug capitalize">{entry.source}</p>
                        {/* Tags row — same structure as main page */}
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <span className={[
                            'text-[10px] px-1.5 py-0.5 rounded border font-mono',
                            podium
                              ? `font-semibold ${podium.color} ${podium.badgeBg} ${podium.badgeBorder}`
                              : 'bg-bg-surface text-ink-secondary border-line-subtle',
                          ].join(' ')}>
                            #{entry.rank}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-glow text-brand border border-brand/30 font-mono">
                            ⬇ {fmtCount(entry.count)}
                          </span>
                        </div>
                      </div>

                      {/* Single button — exact same classes as main page */}
                      {mounted && (
                        inQueue ? (
                          <div
                            className="no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center bg-brand-glow text-brand cursor-default"
                            title={t.rankings.alreadyInQueue}
                          >
                            {isActive
                              ? <span className="w-3 h-3 rounded-full border-[1.5px] border-brand/40 border-t-brand animate-spin" />
                              : <CheckIcon className="w-3 h-3" />
                            }
                          </div>
                        ) : version ? (
                          <button
                            onClick={() => queue.add(entry.id, entry.name ?? entry.id, entry.iconUrl, queueFilters(entry))}
                            className="no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center bg-bg-card text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95"
                            title={t.rankings.addToQueueTitle.replace('{version}', version).replace('{loader}', 'fabric')}
                          >
                            <PlusIcon className="w-3 h-3" />
                          </button>
                        ) : (
                          <div className="no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center bg-bg-card text-ink-tertiary cursor-default">
                            <PlusIcon className="w-3 h-3" />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}

              <p className="text-center text-mono text-[10px] text-ink-muted py-5">
                {t.rankings.tracking}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
