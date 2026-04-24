'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQueue } from '@/hooks/useQueue';
import type { RankingEntry } from '@/app/api/rankings/route';
import type { Filters, Loader, ShaderLoader } from '@/lib/modrinth/types';
import { CloudArrowDownIcon } from '@heroicons/react/24/solid';
import {
  CubeIcon,
  TrophyIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
  ServerStackIcon,
  CircleStackIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CustomSelect } from '@/components/CustomSelect';
import * as modrinthService from '@/lib/modrinth/service';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANKING_CONTENT_TYPES = [
  { id: 'mod',          label: 'Mods',          icon: ArchiveBoxIcon   },
  { id: 'plugin',       label: 'Plugins',       icon: ServerStackIcon  },
  { id: 'datapack',     label: 'Datapacks',     icon: CircleStackIcon  },
  { id: 'resourcepack', label: 'Resourcepacks', icon: PhotoIcon        },
  { id: 'shader',       label: 'Shaders',       icon: SparklesIcon     },
] as const;

type RankingContentType = typeof RANKING_CONTENT_TYPES[number]['id'];

const LOADERS: { id: Loader; label: string }[] = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge',  label: 'Forge'  },
];

const SHADER_LOADERS: { id: ShaderLoader; label: string }[] = [
  { id: 'iris',     label: 'Iris'     },
  { id: 'optifine', label: 'OptiFine' },
];

const PODIUM: Record<number, { label: string; color: string; border: string; glow: string }> = {
  1: { label: '#1', color: 'text-amber-400',  border: 'border-l-[2px] border-l-amber-400/70',  glow: 'bg-amber-400/[0.04]'  },
  2: { label: '#2', color: 'text-slate-300',  border: 'border-l-[2px] border-l-slate-400/60',  glow: 'bg-slate-400/[0.03]'  },
  3: { label: '#3', color: 'text-orange-400', border: 'border-l-[2px] border-l-orange-400/60', glow: 'bg-orange-400/[0.03]' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modPageUrl(entry: RankingEntry): string {
  if (entry.source === 'modrinth') return `https://modrinth.com/project/${entry.id}`;
  return `https://www.curseforge.com/minecraft/mc-mods/${entry.id}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Pill toggle (mirrors main page) ─────────────────────────────────────────

function PillToggle<T extends string>({
  options,
  active,
  onToggle,
}: {
  options:  { id: T; label: string }[];
  active:   T | null;
  onToggle: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onToggle(o.id)}
          className={[
            'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
            active === o.id
              ? 'bg-brand-glow border border-brand text-brand'
              : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  rankings: RankingEntry[];
  total:    number;
}

export function RankingsClient({ rankings: initialRankings, total: initialTotal }: Props) {
  const queue = useQueue();

  // Filter state (mirrors main page sidebar)
  const [source,      setSource]      = useState<'modrinth' | 'curseforge'>('modrinth');
  const [contentType, setContentType] = useState<RankingContentType>('mod');
  const [version,     setVersion]     = useState('');
  const [loader,      setLoader]      = useState<Loader>('fabric');
  const [shaderLoader, setShaderLoader] = useState<ShaderLoader | null>(null);
  const [versions,    setVersions]    = useState<string[]>([]);

  const [rankings,    setRankings]    = useState(initialRankings);
  const [total,       setTotal]       = useState(initialTotal);
  const [isFetching,  setIsFetching]  = useState(false);
  const [mounted,     setMounted]     = useState(false);

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
      loader,
      shaderLoader: contentType === 'shader' ? shaderLoader : null,
      pluginLoader: null,
    }),
    [contentType, version, loader, shaderLoader],
  );

  const currentLabel = RANKING_CONTENT_TYPES.find(ct => ct.id === contentType)?.label ?? '';

  return (
    <div className="flex bg-bg-base text-ink-primary font-sans overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── Sidebar (desktop only) ────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[196px] flex-shrink-0 flex-col bg-bg-base border-r border-line-subtle overflow-hidden">

        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 px-3.5 border-b border-line-subtle shrink-0 h-12 group"
        >
          <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center shrink-0">
            <CloudArrowDownIcon className="w-3.5 h-3.5 text-brand-dark" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight group-hover:text-brand transition-colors">
            dynrinth
          </span>
        </Link>

        {/* Filters */}
        <div className="py-2 shrink-0">
          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-1 pb-1.5">Source</p>
          <div className="px-3.5">
            <CustomSelect
              value={source}
              onChange={v => setSource(v as 'modrinth' | 'curseforge')}
              options={[
                { value: 'modrinth',   label: 'Modrinth'   },
                { value: 'curseforge', label: 'CurseForge' },
              ]}
              width="w-full"
            />
          </div>

          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">Version</p>
          <div className="px-3.5">
            <CustomSelect
              value={version}
              onChange={setVersion}
              options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
              width="w-full"
            />
          </div>

          {contentType === 'mod' && (
            <>
              <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">Loader</p>
              <div className="px-3.5">
                <PillToggle<Loader> options={LOADERS} active={loader} onToggle={setLoader} />
              </div>
            </>
          )}
          {contentType === 'shader' && (
            <>
              <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">Renderer</p>
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
          <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-1 pb-1.5">Content type</p>
          {RANKING_CONTENT_TYPES.map(({ id, label, icon: Icon }) => (
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
          <div className="flex items-center gap-2 w-[calc(100%-12px)] mx-1.5 px-3 py-1.5 mb-px rounded text-[12.5px] font-medium border bg-brand-glow text-ink-primary border-brand/30 cursor-default">
            <TrophyIcon className="w-3 h-3 shrink-0" />
            Rankings
          </div>
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
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">Tracked</p>
                    <p className="text-mono text-[11px] font-semibold text-ink-primary">{total.toLocaleString()}</p>
                  </div>
                )}
                {totalDownloads > 0 && (
                  <div>
                    <p className="text-mono text-[9px] text-ink-tertiary uppercase tracking-widest mb-0.5">Downloads</p>
                    <p className="text-mono text-[11px] font-semibold text-brand">{fmtCount(totalDownloads)}</p>
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
                  Queue
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
          <div className="flex items-center gap-3 px-5 h-12">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center shrink-0">
                <CloudArrowDownIcon className="w-3.5 h-3.5 text-brand-dark" />
              </div>
              <span className="text-[14px] font-semibold tracking-tight group-hover:text-brand transition-colors">
                dynrinth
              </span>
            </Link>
            <span className="text-ink-muted text-xs select-none">/</span>
            <span className="text-xs font-medium text-ink-secondary">Rankings</span>
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
          <span className="text-[13px] font-semibold tracking-tight">Most Downloaded</span>
          <span className="text-mono text-[10px] text-ink-tertiary ml-1">
            · {currentLabel}{version ? ` · ${version}` : ''}
          </span>
          {isFetching && (
            <span className="ml-auto w-3.5 h-3.5 rounded-full border-[1.5px] border-line-strong border-t-brand animate-spin shrink-0" />
          )}
        </div>

        {/* Rankings list */}
        <div className="flex-1 overflow-y-auto">
          {rankings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-ink-tertiary">
              <TrophyIcon className="w-8 h-8 text-ink-secondary opacity-30" />
              <span className="text-xs text-center leading-relaxed">
                {isFetching
                  ? 'Loading rankings…'
                  : `No ${currentLabel.toLowerCase()} rankings yet`
                }
                {!isFetching && <><br />Download some through Dynrinth to get started!</>}
              </span>
            </div>
          ) : (
            <ol className="max-w-2xl mx-auto">
              {rankings.map((entry, i) => {
                const podium   = PODIUM[entry.rank];
                const searchUrl = `/?q=${encodeURIComponent(entry.name ?? entry.id)}`;
                const inQueue  = queue.entries.some(e => e.id === entry.id);
                const isActive = queue.entries.find(e => e.id === entry.id)?.status === 'resolving';

                return (
                  <li key={entry.member}>
                    <div
                      className={[
                        'flex items-center gap-3 px-4 py-3.5 border-b border-line transition-all duration-150 animate-fadeIn',
                        podium
                          ? `${podium.border} ${podium.glow} pl-[calc(1rem-2px)] hover:brightness-110`
                          : 'hover:bg-bg-surface/60',
                      ].join(' ')}
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      {/* Rank */}
                      <span className={[
                        'w-7 text-center shrink-0 font-mono font-semibold',
                        podium ? `text-[13px] ${podium.color}` : 'text-[11px] text-ink-muted',
                      ].join(' ')}>
                        {podium ? podium.label : `#${entry.rank}`}
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

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-tight truncate">
                          {entry.name ?? entry.id}
                        </p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <span className="text-mono text-[10px] px-1.5 py-0.5 rounded bg-brand-glow text-brand border border-brand/30 font-medium">
                            ⬇ {fmtCount(entry.count)}
                          </span>
                          <span className="text-mono text-[10px] px-1.5 py-0.5 rounded bg-bg-surface text-ink-tertiary border border-line-subtle capitalize">
                            {entry.source}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {mounted && (
                          inQueue ? (
                            <div
                              className="w-8 h-8 rounded-lg bg-brand-glow text-brand flex items-center justify-center"
                              title="Already in queue"
                            >
                              {isActive
                                ? <span className="w-3 h-3 rounded-full border-[1.5px] border-brand/40 border-t-brand animate-spin" />
                                : <CheckIcon className="w-3.5 h-3.5" />
                              }
                            </div>
                          ) : version ? (
                            <button
                              onClick={() => queue.add(entry.id, entry.name ?? entry.id, entry.iconUrl, queueFilters(entry))}
                              className="no-ring w-8 h-8 rounded-lg bg-bg-surface text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95 flex items-center justify-center transition-all duration-150"
                              title={`Add to queue · ${version} · ${loader}`}
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <a
                              href={searchUrl}
                              className="w-8 h-8 rounded-lg bg-bg-surface text-ink-muted flex items-center justify-center"
                              title="Open Dynrinth to set a Minecraft version first"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                            </a>
                          )
                        )}

                        <a
                          href={searchUrl}
                          className="w-8 h-8 rounded-lg bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover flex items-center justify-center transition-all duration-150"
                          title={`Search "${entry.name ?? entry.id}" on Dynrinth`}
                        >
                          <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                        </a>

                        <a
                          href={modPageUrl(entry)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover flex items-center justify-center transition-all duration-150"
                          title="View on platform"
                        >
                          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}

              <p className="text-center text-mono text-[10px] text-ink-muted py-5">
                Tracking downloads through Dynrinth
              </p>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
